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
  const LS_KEY = (wid: string) => `mindful_${wid}_bookmarks_snapshot_v1`;

  it('returns [] when no snapshot exists', async () => {
    expect(localStorage.getItem(LS_KEY(WID))).toBeNull();
    const result = await LocalAdapter.readAllGroups(WID);
    expect(result).toEqual([]);
  });

  it('returns [] when JSON is malformed or not an array at data.groups', async () => {
    localStorage.setItem(LS_KEY(WID), '{not-json');
    expect(await LocalAdapter.readAllGroups(WID)).toEqual([]);

    localStorage.setItem(LS_KEY(WID), JSON.stringify({ data: { groups: 'nope' } }));
    expect(await LocalAdapter.readAllGroups(WID)).toEqual([]);
  });

  it('returns the groups array when present', async () => {
    const payload = { data: { groups: GROUPS }, at: 111 };
    localStorage.setItem(LS_KEY(WID), JSON.stringify(payload));

    const result = await LocalAdapter.readAllGroups(WID);
    expect(result).toEqual(GROUPS);
  });
});

describe('LocalAdapter.writeAllGroups', () => {
  const LS_KEY = (wid: string) => `mindful_${wid}_bookmarks_snapshot_v1`;

  it('writes snapshot payload and updates session mirror', async () => {
    await LocalAdapter.writeAllGroups(WID, GROUPS);

    const raw = localStorage.getItem(LS_KEY(WID));
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(String(raw));
    expect(parsed).toEqual({
      data: { groups: GROUPS },
      at: FIXED_NOW,
    });

    // session mirror should be written with id/name pairs
    expect(writeGroupsIndexSession).toHaveBeenCalledWith(WID, [
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ]);
  });
});
