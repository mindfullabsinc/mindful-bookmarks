import type { WorkspaceIdType } from '@/core/constants/workspaces';
import type { BookmarkGroupType } from '@/core/types/bookmarks';

// ---- Mocks for FP cache helpers ----
const readFpGroupsLocalSync = jest.fn();
const readFpIndexLocalSync = jest.fn();
const writeFpIndexLocalSync = jest.fn();
const writeFpGroupsLocalSync = jest.fn();

jest.mock('@/scripts/caching/bookmarkCacheLocalFirstPaint', () => ({
  readFpGroupsLocalSync: (...args: unknown[]) => readFpGroupsLocalSync(...args),
  readFpIndexLocalSync: (...args: unknown[]) => readFpIndexLocalSync(...args),
  writeFpIndexLocalSync: (...args: unknown[]) => writeFpIndexLocalSync(...args),
  writeFpGroupsLocalSync: (...args: unknown[]) => writeFpGroupsLocalSync(...args),
}));

// ---- Mocks for tiny session mirror (groups index) ----
const readGroupsIndexSession = jest.fn();
const writeGroupsIndexSession = jest.fn();

jest.mock('@/scripts/caching/bookmarkCache', () => ({
  readGroupsIndexSession: (...args: unknown[]) => readGroupsIndexSession(...args),
  writeGroupsIndexSession: (...args: unknown[]) => writeGroupsIndexSession(...args),
}));

// ---- Mock for wsKey (namespacing) ----
const wsKeyMock = jest.fn((wid: string, key: string) => `ws:${wid}:${key}`);
jest.mock('@/core/constants/workspaces', () => {
  const actual = jest.requireActual('@/core/constants/workspaces');
  return {
    ...actual,
    wsKey: (...args: unknown[]) => wsKeyMock(...(args as [string, string])),
  };
});

// SUT
import { LocalAdapter, deriveIndex } from '@/scripts/storageAdapters/local';

const chromeGet = jest.fn();
const chromeSet = jest.fn();
const chromeRemove = jest.fn();
const chromeGetBytesInUse = jest.fn();
const chromeClear = jest.fn();

beforeAll(() => {
  const g = globalThis as any;

  g.chrome = g.chrome || {};
  g.chrome.storage = g.chrome.storage || {};

  // Build a partial that matches the StorageArea surface we care about
  const localPartial: Partial<chrome.storage.StorageArea> = {
    get: chromeGet as unknown as typeof chrome.storage.local.get,
    set: chromeSet as unknown as typeof chrome.storage.local.set,
    remove: chromeRemove as unknown as typeof chrome.storage.local.remove,
    getBytesInUse: chromeGetBytesInUse as unknown as typeof chrome.storage.local.getBytesInUse,
    clear: chromeClear as unknown as typeof chrome.storage.local.clear,
  };

  // Assign with a single, tidy cast to the full type
  g.chrome.storage.local = localPartial as chrome.storage.StorageArea;
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

// Stable clock for snapshot "at" values
const FIXED_NOW = 1730600000000; // any fixed timestamp
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

// ---- Test data ----
const WID = 'workspace-1' as WorkspaceIdType;
const FULL_STORAGE_KEY = 'ws:workspace-1:bookmarks_snapshot_v1';

const GROUPS: BookmarkGroupType[] = [
  { id: 'g1', groupName: 'Work', bookmarks: [] },
  { id: 'g2', groupName: 'Home', bookmarks: [{ id: 'b1', name: 'Site', url: 'https://example.com' }] },
];

describe('deriveIndex', () => {
  it('maps groups to id/groupName string pairs', () => {
    const result = deriveIndex(GROUPS);
    expect(result).toEqual([
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ]);
  });
});

describe('LocalAdapter.readPhase1aSnapshot', () => {
  it('returns the FP groups when non-empty', () => {
    readFpGroupsLocalSync.mockReturnValueOnce(GROUPS);

    const result = LocalAdapter.readPhase1aSnapshot(WID);
    expect(readFpGroupsLocalSync).toHaveBeenCalledWith(WID);
    expect(result).toEqual(GROUPS);
  });

  it('returns null when FP groups are empty or not an array', () => {
    readFpGroupsLocalSync.mockReturnValueOnce([]);
    expect(LocalAdapter.readPhase1aSnapshot(WID)).toBeNull();

    readFpGroupsLocalSync.mockReturnValueOnce(null);
    expect(LocalAdapter.readPhase1aSnapshot(WID)).toBeNull();

    readFpGroupsLocalSync.mockReturnValueOnce(undefined);
    expect(LocalAdapter.readPhase1aSnapshot(WID)).toBeNull();
  });
});

describe('LocalAdapter.readPhase1bSessionSnapshot', () => {
  it('wraps FP groups in a BookmarkSnapshot with current time', async () => {
    readFpGroupsLocalSync.mockReturnValueOnce(GROUPS);

    const snap = await LocalAdapter.readPhase1bSessionSnapshot(WID);
    expect(readFpGroupsLocalSync).toHaveBeenCalledWith(WID);
    expect(snap).toEqual({ data: GROUPS, at: FIXED_NOW });
  });

  it('returns null when no FP groups exist', async () => {
    readFpGroupsLocalSync.mockReturnValueOnce([]);
    const snap = await LocalAdapter.readPhase1bSessionSnapshot(WID);
    expect(snap).toBeNull();
  });
});

describe('LocalAdapter.readGroupsIndexFast', () => {
  it('returns the FP index passthrough when session mirror is absent', async () => {
    readGroupsIndexSession.mockResolvedValueOnce(undefined);
    const index = [
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ];
    readFpIndexLocalSync.mockReturnValueOnce(index);

    const result = await LocalAdapter.readGroupsIndexFast(WID);

    expect(readGroupsIndexSession).toHaveBeenCalledWith(WID);
    expect(readFpIndexLocalSync).toHaveBeenCalledWith(WID);
    expect(result).toEqual(index);
  });

  it('returns the tiny session mirror when present (fast path)', async () => {
    const mirror = [
      { id: 'g10', groupName: 'Alpha' },
      { id: 'g20', groupName: 'Beta' },
    ];
    readGroupsIndexSession.mockResolvedValueOnce(mirror);

    const result = await LocalAdapter.readGroupsIndexFast(WID);

    expect(readGroupsIndexSession).toHaveBeenCalledWith(WID);
    expect(readFpIndexLocalSync).not.toHaveBeenCalled();
    expect(result).toEqual(mirror);
  });

  it('falls back to FP index when session read throws', async () => {
    readGroupsIndexSession.mockRejectedValueOnce(new Error('boom'));
    const fpIdx = [{ id: 'g3', groupName: 'Zeta' }];
    readFpIndexLocalSync.mockReturnValueOnce(fpIdx);

    const result = await LocalAdapter.readGroupsIndexFast(WID);

    expect(readGroupsIndexSession).toHaveBeenCalledWith(WID);
    expect(readFpIndexLocalSync).toHaveBeenCalledWith(WID);
    expect(result).toEqual(fpIdx);
  });
});

describe('LocalAdapter.persistCachesIfNonEmpty', () => {
  it('writes index, groups, and session mirror when non-empty', async () => {
    await LocalAdapter.persistCachesIfNonEmpty(WID, GROUPS);

    expect(writeFpIndexLocalSync).toHaveBeenCalledWith(WID, GROUPS);
    expect(writeFpGroupsLocalSync).toHaveBeenCalledWith(WID, GROUPS);
    expect(writeGroupsIndexSession).toHaveBeenCalledWith(WID, [
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ]);
  });

  it('does nothing when groups is empty or not an array', async () => {
    await LocalAdapter.persistCachesIfNonEmpty(WID, []);
    await LocalAdapter.persistCachesIfNonEmpty(WID, undefined as unknown as BookmarkGroupType[]);
    await LocalAdapter.persistCachesIfNonEmpty(WID, null as unknown as BookmarkGroupType[]);

    expect(writeFpIndexLocalSync).not.toHaveBeenCalled();
    expect(writeFpGroupsLocalSync).not.toHaveBeenCalled();
    expect(writeGroupsIndexSession).not.toHaveBeenCalled();
  });
});

describe('LocalAdapter generic get/set/remove (workspace-scoped)', () => {
  const KEY = 'myKey';
  const FULL = `ws:${WID}:${KEY}`;

  it('get() calls chrome.storage.local.get with namespaced key and returns the value', async () => {
    // Arrange: chromeGet resolves with the shape { [FULL]: VALUE }
    const VALUE = { hello: 'world' };
    chromeGet.mockImplementationOnce(async (k: string | string[]) => {
      const key = Array.isArray(k) ? k[0] : k;
      return { [key]: VALUE };
    });

    const val = await LocalAdapter.get<typeof VALUE>(WID, KEY);

    expect(wsKeyMock).toHaveBeenCalledWith(WID, KEY);
    expect(chromeGet).toHaveBeenCalledWith(FULL);
    expect(val).toEqual(VALUE);
  });

  it('set() calls chrome.storage.local.set with namespaced key', async () => {
    const VALUE = ['a', 'b'];
    chromeSet.mockResolvedValueOnce(undefined);

    await LocalAdapter.set(WID, KEY, VALUE);

    expect(wsKeyMock).toHaveBeenCalledWith(WID, KEY);
    expect(chromeSet).toHaveBeenCalledWith({ [FULL]: VALUE });
  });

  it('remove() calls chrome.storage.local.remove with namespaced key', async () => {
    chromeRemove.mockResolvedValueOnce(undefined);

    await LocalAdapter.remove(WID, KEY);

    expect(wsKeyMock).toHaveBeenCalledWith(WID, KEY);
    expect(chromeRemove).toHaveBeenCalledWith(FULL);
  });
});

describe('LocalAdapter.readAllGroups', () => {
  it('returns [] when no groups exist at the key', async () => {
    chromeGet.mockResolvedValueOnce({}); // nothing stored for FULL_STORAGE_KEY
    const result = await LocalAdapter.readAllGroups(FULL_STORAGE_KEY);
    expect(chromeGet).toHaveBeenCalledWith(FULL_STORAGE_KEY);
    expect(result).toEqual([]);
  });

  it('returns [] when value at key is not an array', async () => {
    chromeGet.mockResolvedValueOnce({ [FULL_STORAGE_KEY]: { data: { groups: 'nope' } } });
    const result = await LocalAdapter.readAllGroups(FULL_STORAGE_KEY);
    expect(chromeGet).toHaveBeenCalledWith(FULL_STORAGE_KEY);
    expect(result).toEqual([]);
  });

  it('returns the groups array when present', async () => {
    chromeGet.mockResolvedValueOnce({ [FULL_STORAGE_KEY]: GROUPS });
    const result = await LocalAdapter.readAllGroups(FULL_STORAGE_KEY);
    expect(chromeGet).toHaveBeenCalledWith(FULL_STORAGE_KEY);
    expect(result).toEqual(GROUPS);
  });
});

describe('LocalAdapter.writeAllGroups', () => {
  it('writes groups to chrome.storage.local and updates session mirror', async () => {
    chromeSet.mockResolvedValueOnce(undefined);

    await LocalAdapter.writeAllGroups(WID, FULL_STORAGE_KEY, GROUPS);

    expect(chromeSet).toHaveBeenCalledWith({ [FULL_STORAGE_KEY]: GROUPS });
    expect(writeGroupsIndexSession).toHaveBeenCalledWith(WID, [
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ]);
  });
});
