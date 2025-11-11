/**
 * @file registry.test.ts
 * Tests for PR-4 workspace registry (Local-only) + legacy coercion from PR-3.
 */

import {
  loadRegistry,
  saveRegistry,
  getActiveWorkspace,
  setActiveWorkspace,
  initializeLocalWorkspaceRegistry,
  getActiveWorkspaceId,
  listLocalWorkspaces,
  createLocalWorkspace,
  renameWorkspace,
  archiveWorkspace,
  ensureDefaultWorkspace,
} from '@/workspaces/registry';

import { StorageMode } from '@/core/constants/storageMode';
import type { WorkspaceType, WorkspaceRegistryType, WorkspaceIdType } from '@/core/constants/workspaces';
import {
  DEFAULT_LOCAL_WORKSPACE_ID,
  WORKSPACE_REGISTRY_KEY,
} from '@/core/constants/workspaces';

// ---- Legacy keys duplicated from implementation for clarity in tests ----
const LEGACY_WORKSPACES_KEY = 'mindful_workspaces_v1';
const LEGACY_ACTIVE_KEY = 'mindful_active_workspace_v1';

// ---- Stable time/id stubs ----
const FIXED_NOW_1 = 1_700_000_000_000; // arbitrary fixed timestamp
const FIXED_NOW_2 = 1_700_000_100_000;

jest.mock('@/core/utils/utilities', () => ({
  createUniqueID: jest.fn(() => 'mock-unique-id'),
}));

// ---- In-memory backing store used by spies ----
type Store = Record<string, unknown>;
let store: Store;

// Ensure setupChrome.js created global.chrome
beforeAll(() => {
  if (!(global as any).chrome?.storage?.local) {
    throw new Error(
      'chrome.storage.local is not initialized. Ensure setupChrome.js is listed under Jest `setupFiles`.'
    );
  }
});

beforeEach(() => {
  store = {};
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW_1);

  // GET mock: supports both callback-style and promise-style usage
  // Cast to jest.Mock to bypass the strict overload signature.
  (jest.spyOn(chrome.storage.local, 'get') as unknown as jest.Mock).mockImplementation(
    (keysOrCallback?: any, maybeCallback?: any) => {
      const hasCallback = typeof keysOrCallback === 'function' || typeof maybeCallback === 'function';
      const cb = typeof keysOrCallback === 'function' ? keysOrCallback : maybeCallback;
      const query = typeof keysOrCallback === 'function' ? null : keysOrCallback;

      const buildResult = () => {
        if (query === null || query === undefined) return { ...store };
        if (Array.isArray(query)) {
          const out: Record<string, unknown> = {};
          for (const k of query) out[k] = store[k];
          return out;
        }
        if (typeof query === 'string') {
          return { [query]: store[query] };
        }
        // Object of keys -> default values (Chrome allows object param)
        if (query && typeof query === 'object') {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(query)) out[k] = store[k] ?? query[k];
          return out;
        }
        return {};
      };

      const result = buildResult();

      if (hasCallback) {
        cb(result);
        return; // callback overload returns void
      }
      // promise-style fallback (handy for our test helpers)
      return Promise.resolve(result);
    }
  );

  // SET mock: supports callback and promise
  (jest.spyOn(chrome.storage.local, 'set') as unknown as jest.Mock).mockImplementation(
    (items: Record<string, unknown>, callback?: any) => {
      Object.assign(store, items);
      if (typeof callback === 'function') {
        callback();
        return;
      }
      return Promise.resolve();
    }
  );

  // REMOVE mock: supports callback and promise
  (jest.spyOn(chrome.storage.local, 'remove') as unknown as jest.Mock).mockImplementation(
    (keys: string | string[], callback?: any) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
      if (typeof callback === 'function') {
        callback();
        return;
      }
      return Promise.resolve();
    }
  );

  // CLEAR mock (if code uses it)
  if (typeof (chrome.storage.local as any).clear === 'function') {
    (jest.spyOn(chrome.storage.local as any, 'clear') as unknown as jest.Mock).mockImplementation(
      (callback?: any) => {
        store = {};
        if (typeof callback === 'function') {
          callback();
          return;
        }
        return Promise.resolve();
      }
    );
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Small helpers ----------
async function readAllLocal(): Promise<Record<string, unknown>> {
  // Our mock returns a Promise when no callback is supplied.
  return (await chrome.storage.local.get(null)) as Record<string, unknown>;
}

function makeWorkspace(id: WorkspaceIdType, name = 'WS', createdAt = FIXED_NOW_1): WorkspaceType {
  return {
    id,
    name,
    storageMode: StorageMode.LOCAL,
    createdAt,
    updatedAt: createdAt,
  };
}

// =====================================================================
// Tests
// =====================================================================

describe('registry (PR-4, local-only)', () => {
  test('initializeLocalWorkspaceRegistry → creates default registry when empty and migrates legacy keys', async () => {
    // seed one legacy (non-namespaced) local key that should be migrated
    store['mindful_local_groups_index_v1'] = { foo: 'bar' };

    await initializeLocalWorkspaceRegistry();

    const reg = (await loadRegistry()) as WorkspaceRegistryType;
    expect(reg).toBeDefined();
    expect(reg.version).toBe(1);
    expect(reg.activeId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
    expect(Object.keys(reg.items)).toEqual([DEFAULT_LOCAL_WORKSPACE_ID]);

    const active = reg.items[reg.activeId];
    expect(active.storageMode).toBe(StorageMode.LOCAL);
    expect(active.createdAt).toBe(FIXED_NOW_1);
    expect(active.updatedAt).toBe(FIXED_NOW_1);

    // migratedLegacyLocal flag is set and persisted
    expect(reg.migratedLegacyLocal).toBe(true);

    // legacy key was moved under WS_<id>__ prefix and removed from root
    const all = await readAllLocal();
    expect(all['mindful_local_groups_index_v1']).toBeUndefined();
    expect(all[`WS_${reg.activeId}__mindful_local_groups_index_v1`]).toEqual({ foo: 'bar' });
  });

  test('saveRegistry / loadRegistry roundtrip', async () => {
    const ws = makeWorkspace(DEFAULT_LOCAL_WORKSPACE_ID);
    const payload: WorkspaceRegistryType = {
      version: 1,
      activeId: ws.id,
      items: { [ws.id]: ws },
      migratedLegacyLocal: true,
    };
    await saveRegistry(payload);

    const loaded = await loadRegistry();
    expect(loaded).toEqual(payload);
  });

  test('getActiveWorkspace returns the active workspace from an existing registry', async () => {
    const ws = makeWorkspace('local-abc' as WorkspaceIdType);
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: ws.id,
      items: { [ws.id]: ws },
      migratedLegacyLocal: true,
    };
    await saveRegistry(reg);

    const active = await getActiveWorkspace();
    expect(active).toEqual(ws);
  });

  test('setActiveWorkspace switches activeId and bumps updatedAt', async () => {
    const ws1 = makeWorkspace('local-1' as WorkspaceIdType, 'One', FIXED_NOW_1);
    const ws2 = makeWorkspace('local-2' as WorkspaceIdType, 'Two', FIXED_NOW_1);
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: ws1.id,
      items: { [ws1.id]: ws1, [ws2.id]: ws2 },
      migratedLegacyLocal: true,
    };
    await saveRegistry(reg);

    // New "now" for updatedAt bump
    (Date.now as jest.Mock).mockReturnValue(FIXED_NOW_2);

    await setActiveWorkspace(ws2.id);

    const reloaded = (await loadRegistry())!;
    expect(reloaded.activeId).toBe(ws2.id);
    expect(reloaded.items[ws2.id].updatedAt).toBe(FIXED_NOW_2);
  });

  test('ensureDefaultWorkspace creates a sane registry if called first', async () => {
    await ensureDefaultWorkspace();
    const reg = (await loadRegistry())!;
    expect(reg.version).toBe(1);
    expect(reg.items[DEFAULT_LOCAL_WORKSPACE_ID]).toBeTruthy();
    expect(reg.activeId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
  });

  test('listLocalWorkspaces returns non-archived by default (sorted by createdAt)', async () => {
    await initializeLocalWorkspaceRegistry();
    
    // Make ids unique for the two creations below
    const { createUniqueID } = require('@/core/utils/utilities');
    (createUniqueID as jest.Mock)
      .mockImplementationOnce(() => 'alpha-id')
      .mockImplementationOnce(() => 'beta-id');

    // add two additional workspaces
    const a = await createLocalWorkspace('Alpha');
    const b = await createLocalWorkspace('Beta');
    
    const list = await listLocalWorkspaces();
    const names = list.map(w => w.name).sort();
    expect(names).toEqual(['Alpha', 'Beta', 'My Bookmarks'].sort());

    // includeArchived should include everything
    const all = await listLocalWorkspaces({ includeArchived: true });
    expect(all.map(w => w.id).sort()).toEqual(
      [DEFAULT_LOCAL_WORKSPACE_ID, a.id, b.id].sort()
    );
  });

  test('createLocalWorkspace adds a workspace and makes it active', async () => {
    await initializeLocalWorkspaceRegistry();
    const before = await getActiveWorkspaceId();
    expect(before).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
    const w = await createLocalWorkspace('Project X');
    expect(w.id).toMatch(/^local-/);
    expect(await getActiveWorkspaceId()).toBe(w.id);
    const reg = await loadRegistry();
    expect(reg!.items[w.id]).toBeTruthy();
  });

  test('renameWorkspace updates name and updatedAt', async () => {
    await initializeLocalWorkspaceRegistry();
    const w = await createLocalWorkspace('Temp');
    const prevUpdated = (await loadRegistry())!.items[w.id].updatedAt;
    (Date.now as jest.Mock).mockReturnValue(FIXED_NOW_2);
    await renameWorkspace(w.id, 'Renamed');
    const reg = await loadRegistry();
    expect(reg!.items[w.id].name).toBe('Renamed');
    expect(reg!.items[w.id].updatedAt).toBeGreaterThanOrEqual(prevUpdated);
  });

  test('archiveWorkspace hides from default list and reassigns active if needed', async () => {
    await initializeLocalWorkspaceRegistry();
    const w1 = await createLocalWorkspace('One');
    const w2 = await createLocalWorkspace('Two');
    // active is w2
    expect(await getActiveWorkspaceId()).toBe(w2.id);
    await archiveWorkspace(w2.id);
    const list = await listLocalWorkspaces();
    expect(list.find(w => w.id === w2.id)).toBeUndefined();
    // active moved to a non-archived workspace
    const newActive = await getActiveWorkspaceId();
    expect(newActive).not.toBe(w2.id);
  });

  describe('initializeLocalWorkspaceRegistry → coerce legacy shapes', () => {
    test('A) separate legacy keys (items map + active id) → wrapped and legacy keys removed', async () => {
      const items = {
        'local-a': makeWorkspace('local-a' as WorkspaceIdType, 'A'),
        'local-b': makeWorkspace('local-b' as WorkspaceIdType, 'B'),
      } as Record<WorkspaceIdType, WorkspaceType>;

      await chrome.storage.local.set({
        [LEGACY_WORKSPACES_KEY]: items,
        [LEGACY_ACTIVE_KEY]: 'local-b',
      });

      await initializeLocalWorkspaceRegistry();

      const reg = (await loadRegistry())!;
      expect(reg.version).toBe(1);
      expect(reg.activeId).toBe('local-b');
      expect(reg.items).toEqual(items);

      const all = await readAllLocal();
      expect(all[LEGACY_WORKSPACES_KEY]).toBeUndefined();
      expect(all[LEGACY_ACTIVE_KEY]).toBeUndefined();
    });

    test('A) activeId missing/invalid → falls back to first key or DEFAULT_LOCAL_WORKSPACE_ID', async () => {
      const items = {
        'local-x': makeWorkspace('local-x' as WorkspaceIdType, 'X'),
      } as Record<WorkspaceIdType, WorkspaceType>;

      await chrome.storage.local.set({
        [LEGACY_WORKSPACES_KEY]: items,
        [LEGACY_ACTIVE_KEY]: 'non-existent',
      });

      await initializeLocalWorkspaceRegistry();

      const reg = (await loadRegistry())!;
      expect(reg.activeId).toBe('local-x'); // first key fallback
    });

    test('B) registry key contains just a string (activeId) and NO legacy items → creates default workspace with that id', async () => {
      await chrome.storage.local.set({
        [WORKSPACE_REGISTRY_KEY]: 'local-str-id',
      });

      await initializeLocalWorkspaceRegistry();

      const reg = (await loadRegistry())!;
      expect(reg.version).toBe(1);
      expect(reg.activeId).toBe('local-str-id');

      const ws = reg.items['local-str-id'];
      expect(ws).toBeDefined();
      expect(ws.id).toBe('local-str-id');
      expect(ws.name).toBe('My Bookmarks'); // from makeDefaultLocalWorkspace
      expect(ws.storageMode).toBe(StorageMode.LOCAL);
      expect(ws.createdAt).toBe(FIXED_NOW_1);
      expect(ws.updatedAt).toBe(FIXED_NOW_1);
    });

    test('B) registry key is string + legacy items exist → uses legacy items and string as activeId', async () => {
      const items = {
        'local-z': makeWorkspace('local-z' as WorkspaceIdType, 'Z'),
      } as Record<WorkspaceIdType, WorkspaceType>;
      await chrome.storage.local.set({
        [WORKSPACE_REGISTRY_KEY]: 'local-z',
        [LEGACY_WORKSPACES_KEY]: items,
      });

      await initializeLocalWorkspaceRegistry();

      const reg = (await loadRegistry())!;
      expect(reg.activeId).toBe('local-z');
      expect(reg.items).toEqual(items);
    });

    test('C) registry key contains a raw items map (no wrapper) → wraps with version=1 and activeId is first key', async () => {
      const rawItems = {
        'local-raw': makeWorkspace('local-raw' as WorkspaceIdType, 'RAW'),
        'local-raw-2': makeWorkspace('local-raw-2' as WorkspaceIdType, 'RAW2'),
      } as Record<WorkspaceIdType, WorkspaceType>;

      await chrome.storage.local.set({
        [WORKSPACE_REGISTRY_KEY]: rawItems,
      });

      await initializeLocalWorkspaceRegistry();

      const reg = (await loadRegistry())!;
      expect(reg.version).toBe(1);
      expect(reg.items).toEqual(rawItems);

      // ActiveId = first key in object order (implementation picks the first key)
      const firstKey = Object.keys(rawItems)[0];
      expect(reg.activeId).toBe(firstKey);
    });
  });

  test('initializeLocalWorkspaceRegistry is idempotent after first run (no extra migrations)', async () => {
    await initializeLocalWorkspaceRegistry();
    const first = (await loadRegistry())!;
    expect(first.migratedLegacyLocal).toBe(true);

    // Put an extra non-reserved key that looks "new"; since migratedLegacyLocal is true, it should NOT be moved now
    store['some_new_key'] = 123;

    await initializeLocalWorkspaceRegistry();
    const second = (await loadRegistry())!;

    expect(second).toEqual(first);

    const all = await readAllLocal();
    // ensure extra key is still at root (no further migration after the one-time flag)
    expect(all['some_new_key']).toBe(123);
  });

  test('setActiveWorkspace throws if ID does not exist', async () => {
    const ws = makeWorkspace('local-ok' as WorkspaceIdType);
    await saveRegistry({
      version: 1,
      activeId: ws.id,
      items: { [ws.id]: ws },
      migratedLegacyLocal: true,
    });

    await expect(setActiveWorkspace('does-not-exist' as WorkspaceIdType)).rejects.toThrow(/not found/);
  });
});
