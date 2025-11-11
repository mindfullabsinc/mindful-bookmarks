/**
 * @file isolate.test.ts
 * Verifies workspace isolation for PR-4 (Local-only).
 *
 * Focus:
 *  - WS-scoped FP caches (localStorage) are isolated
 *  - Tiny index mirror in chrome.storage.session is isolated to active WS
 *  - Active WS first-paint returns the right dataset (no cross-leaks)
 */

import {
  initializeLocalWorkspaceRegistry,
  getActiveWorkspaceId,
  setActiveWorkspace,
  createLocalWorkspace,
} from '@/workspaces/registry';

import {
  DEFAULT_LOCAL_WORKSPACE_ID,
  type WorkspaceIdType,
} from '@/core/constants/workspaces';

import {
  readFpGroupsLocalSync,
  readFpIndexLocalSync,
  writeFpGroupsLocalSync,
  writeFpIndexLocalSync,
} from '@/scripts/caching/bookmarkCacheLocalFirstPaint';

import {
  writeGroupsIndexSession,
  clearSessionGroupsIndexExcept,
} from '@/scripts/caching/bookmarkCache';

// ---------- Stable time/id stubs ----------
const FIXED_NOW = 1_700_000_000_000;
jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

jest.mock('@/core/utils/utilities', () => ({
  __esModule: true,
  // ensure unique ids across calls in this suite so nothing gets overwritten
  createUniqueID: jest
    .fn()
    .mockImplementationOnce(() => 'id-1')
    .mockImplementationOnce(() => 'id-2')
    .mockImplementation(() => Math.random().toString(36).slice(2, 10)),
}));

/* -------------------- Stable test data -------------------- */
const A_GROUPS = [
  { id: 'a-1', groupName: 'A-Work', bookmarks: [] as any[] },
  { id: 'a-2', groupName: 'A-Personal', bookmarks: [] as any[] },
];
const B_GROUPS = [
  { id: 'b-1', groupName: 'B-Research', bookmarks: [] as any[] },
];

const A_INDEX = A_GROUPS.map(g => ({ id: g.id, groupName: g.groupName }));
const B_INDEX = B_GROUPS.map(g => ({ id: g.id, groupName: g.groupName }));

/* -------------------- Chrome storage shims -------------------- */
type Store = Record<string, unknown>;
let SESSION_STORE: Store;
let LOCAL_STORE: Store;

function resetStores() {
  SESSION_STORE = {};
  LOCAL_STORE = {};
}

function getFrom(store: Store, key?: string | string[] | null): Record<string, unknown> {
  if (key === null || key === undefined) return { ...store };
  if (Array.isArray(key)) {
    const out: Record<string, unknown> = {};
    for (const k of key) out[k] = store[k];
    return out;
  }
  if (typeof key === 'string') return { [key]: store[key] };
  if (key && typeof key === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(key)) out[k] = store[k] ?? (key as any)[k];
    return out;
  }
  return {};
}

function removeFrom(store: Store, keys: string | string[]) {
  const arr = Array.isArray(keys) ? keys : [keys];
  for (const k of arr) delete store[k];
}

beforeAll(() => {
  (globalThis as any).chrome = (globalThis as any).chrome || {};
  (globalThis as any).chrome.storage = (globalThis as any).chrome.storage || {};

  resetStores();

  // session mirror (what the tiny index uses)
  (globalThis as any).chrome.storage.session = {
    get: jest.fn(async (key?: any) => getFrom(SESSION_STORE, key)),
    set: jest.fn(async (obj: Record<string, unknown>) => Object.assign(SESSION_STORE, obj)),
    remove: jest.fn(async (keys: string | string[]) => removeFrom(SESSION_STORE, keys)),
  } as any;

  // local storage (the registry + WS-scoped values live here)
  (globalThis as any).chrome.storage.local = {
    get: jest.fn(async (key?: any) => getFrom(LOCAL_STORE, key)),
    set: jest.fn(async (obj: Record<string, unknown>) => {
      Object.assign(LOCAL_STORE, obj);
      return;
    }),
    remove: jest.fn(async (keys: string | string[]) => removeFrom(LOCAL_STORE, keys)),
  } as any;
});

beforeEach(() => {
  resetStores();
  jest.clearAllMocks();
  try { localStorage.clear(); } catch {}
});

afterEach(() => {
  jest.restoreAllMocks();
});

/* -------------------- Helpers -------------------- */
async function readAllSession(): Promise<Record<string, unknown>> {
  return (await chrome.storage.session.get(null)) as Record<string, unknown>;
}

function indexKeyFor(wid: WorkspaceIdType): string {
  return `groupsIndex:${wid}`;
}

/* -------------------- Tests -------------------- */

describe('Workspace isolation — FP caches + session mirror', () => {
  test('FP snapshot & index: per-workspace isolation with no cross-leaks', async () => {
    await initializeLocalWorkspaceRegistry();

    const wsA = DEFAULT_LOCAL_WORKSPACE_ID;
    const wsB = (await createLocalWorkspace('WS-B')).id;

    // Seed WS-A and WS-B with different datasets
    writeFpGroupsLocalSync(wsA, A_GROUPS as any);
    writeFpIndexLocalSync(wsA, A_GROUPS as any);

    writeFpGroupsLocalSync(wsB, B_GROUPS as any);
    writeFpIndexLocalSync(wsB, B_GROUPS as any);

    // Read back: each WS should only see its own data
    const a_fp = readFpGroupsLocalSync(wsA);
    const a_idx = readFpIndexLocalSync(wsA);
    const b_fp = readFpGroupsLocalSync(wsB);
    const b_idx = readFpIndexLocalSync(wsB);

    expect(a_fp).toEqual(A_GROUPS);
    expect(a_idx).toEqual(A_INDEX);
    expect(b_fp).toEqual(B_GROUPS);
    expect(b_idx).toEqual(B_INDEX);
  });

  test('Session tiny-index mirror: only active workspace is kept', async () => {
    await initializeLocalWorkspaceRegistry();

    const wsA = DEFAULT_LOCAL_WORKSPACE_ID;
    const wsB = (await createLocalWorkspace('WS-B')).id;

    // Mirror both initially
    await writeGroupsIndexSession(wsA, A_INDEX);
    await writeGroupsIndexSession(wsB, B_INDEX);

    // Sanity: both entries present
    let snapshot = await readAllSession();
    expect(snapshot[indexKeyFor(wsA)]).toEqual(A_INDEX);
    expect(snapshot[indexKeyFor(wsB)]).toEqual(B_INDEX);

    // Keep only WS-B
    await clearSessionGroupsIndexExcept(wsB);

    snapshot = await readAllSession();
    expect(snapshot[indexKeyFor(wsA)]).toBeUndefined();
    expect(snapshot[indexKeyFor(wsB)]).toEqual(B_INDEX);

    // Switch to WS-A and keep only A
    await setActiveWorkspace(wsA);

    // Recreate A's mirror (it was removed when we kept only B)
    await writeGroupsIndexSession(wsA, A_INDEX);

    await clearSessionGroupsIndexExcept(wsA);

    snapshot = await readAllSession();
    expect(snapshot[indexKeyFor(wsB)]).toBeUndefined();
    expect(snapshot[indexKeyFor(wsA)]).toEqual(A_INDEX); 
  });

  test('First-paint uses the active workspace FP snapshot', async () => {
    await initializeLocalWorkspaceRegistry();
    const wsA = DEFAULT_LOCAL_WORKSPACE_ID;
    const wsB = (await createLocalWorkspace('WS-B')).id;

    // Seed FP caches
    writeFpGroupsLocalSync(wsA, A_GROUPS as any);
    writeFpGroupsLocalSync(wsB, B_GROUPS as any);

    // Active is WS-B now (createLocalWorkspace makes the new WS active)
    expect(await getActiveWorkspaceId()).toBe(wsB);
    expect(readFpGroupsLocalSync(wsB)).toEqual(B_GROUPS);
    expect(readFpGroupsLocalSync(wsA)).toEqual(A_GROUPS);

    // Switch back to A → FP snapshot remains isolated and correct
    await setActiveWorkspace(wsA);
    expect(await getActiveWorkspaceId()).toBe(wsA);
    expect(readFpGroupsLocalSync(wsA)).toEqual(A_GROUPS);
    expect(readFpGroupsLocalSync(wsB)).toEqual(B_GROUPS);
  });
});
