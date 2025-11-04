/**
 * @file local.test.ts
 * Tests for the LOCAL storage adapter (workspace-scoped, chrome.storage.local).
 */

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
import { LocalAdapter } from '@/scripts/storageAdapters/local';

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
  it('returns the FP index passthrough', async () => {
    const index = [
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Home' },
    ];
    readFpIndexLocalSync.mockReturnValueOnce(index);
    const result = await LocalAdapter.readGroupsIndexFast(WID);
    expect(readFpIndexLocalSync).toHaveBeenCalledWith(WID);
    expect(result).toEqual(index);
  });
});

describe('LocalAdapter.persistCachesIfNonEmpty', () => {
  it('writes both index and groups when non-empty', async () => {
    await LocalAdapter.persistCachesIfNonEmpty(WID, GROUPS);
    expect(writeFpIndexLocalSync).toHaveBeenCalledWith(WID, GROUPS);
    expect(writeFpGroupsLocalSync).toHaveBeenCalledWith(WID, GROUPS);
  });

  it('does nothing when groups is empty or not an array', async () => {
    await LocalAdapter.persistCachesIfNonEmpty(WID, []);
    await LocalAdapter.persistCachesIfNonEmpty(WID, undefined as unknown as BookmarkGroupType[]);
    await LocalAdapter.persistCachesIfNonEmpty(WID, null as unknown as BookmarkGroupType[]);
    expect(writeFpIndexLocalSync).not.toHaveBeenCalled();
    expect(writeFpGroupsLocalSync).not.toHaveBeenCalled();
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
