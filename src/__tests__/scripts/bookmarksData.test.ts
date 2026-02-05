/**
 * @file bookmarksData.test.ts
 * Tests for loadInitialBookmarks() logic (local vs remote + optional fallback).
 */

import { loadInitialBookmarks } from '@/scripts/bookmarksData';
import { 
  StorageMode,
  type StorageModeType,
} from '@/core/constants/storageMode';

// ---- Test helpers: mock Storage so we can control per-mode behavior ----
type Behavior =
  | { kind: 'resolve'; value: unknown }
  | { kind: 'reject'; error?: unknown };

let remoteBehavior: Behavior;
let localBehavior: Behavior;

jest.mock('@/scripts/Storage', () => {
  // We want to branch on the StorageMode used by the ctor.
  const { StorageMode } = jest.requireActual('@/core/constants/storageMode');

  // Each instance gets a .load mocked to use the current behavior globals.
  const Storage = jest.fn().mockImplementation(function (this: any, mode: (typeof StorageMode)[keyof typeof StorageMode]) {
    this.mode = mode;
    this.load = jest.fn(() => {
      const b = mode === StorageMode.REMOTE ? remoteBehavior : localBehavior;
      if (b?.kind === 'reject') {
        return Promise.reject(b.error ?? new Error('mock remote/local failure'));
      }
      return Promise.resolve(b?.value);
    });
  });

  return { Storage };
});

// A small helper so we can get at constructor call history & instances
function getStorageMock() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Storage } = require('@/scripts/Storage');
  return Storage as jest.Mock;
}

describe('loadInitialBookmarks', () => {
  const userId = 'u-123';
  const workspaceId = 'local-default' as any; // WorkspaceIdType

  beforeEach(() => {
    jest.clearAllMocks();
    // By default, behave like "no data but successful calls"
    remoteBehavior = { kind: 'resolve', value: [] };
    localBehavior = { kind: 'resolve', value: [] };
  });

  test('returns [] immediately when userId is null/undefined/empty', async () => {
    await expect(loadInitialBookmarks(null, workspaceId, undefined)).resolves.toEqual([]);
    await expect(loadInitialBookmarks(undefined, workspaceId, StorageMode.REMOTE)).resolves.toEqual([]);
    await expect(loadInitialBookmarks('', workspaceId, StorageMode.LOCAL)).resolves.toEqual([]);

    // Should not construct Storage at all
    const Storage = getStorageMock();
    expect(Storage).not.toHaveBeenCalled();
  });

  test('LOCAL mode: reads only local and returns array (coerces non-array to [])', async () => {
    // case: local returns valid array
    localBehavior = {
      kind: 'resolve',
      value: [{ id: 'g1', groupName: 'Work', bookmarks: [] }],
    };
    const out1 = await loadInitialBookmarks(userId, workspaceId, StorageMode.LOCAL);
    expect(out1).toEqual([{ id: 'g1', groupName: 'Work', bookmarks: [] }]);

    // case: local returns non-array => ensureGroups([]) => []
    localBehavior = { kind: 'resolve', value: { not: 'an array' } };
    const out2 = await loadInitialBookmarks(userId, workspaceId, StorageMode.LOCAL);
    expect(out2).toEqual([]);

    // case: local throws => []
    localBehavior = { kind: 'reject' };
    const out3 = await loadInitialBookmarks(userId, workspaceId, StorageMode.LOCAL);
    expect(out3).toEqual([]);

    // Should never construct a REMOTE Storage in LOCAL mode
    const Storage = getStorageMock();
    const instances = Storage.mock.instances as Array<{ mode: StorageModeType }>;
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.some(i => i.mode === StorageMode.REMOTE)).toBe(false);
  });

  test('REMOTE mode (or undefined): returns remote when it is non-empty', async () => {
    const remoteGroups = [{ id: 'r1', groupName: 'Remote', bookmarks: [] }];
    remoteBehavior = { kind: 'resolve', value: remoteGroups };

    // storageMode explicitly REMOTE
    await expect(loadInitialBookmarks(userId, workspaceId, StorageMode.REMOTE)).resolves.toEqual(remoteGroups);

    // storageMode undefined ⇒ code tries REMOTE first
    await expect(loadInitialBookmarks(userId, workspaceId, undefined)).resolves.toEqual(remoteGroups);

    // local should not be consulted when remote has data
    const Storage = getStorageMock();
    const instances = Storage.mock.instances as Array<{
      mode: StorageModeType;
      load: jest.Mock;
    }>;
    // In both calls above, we expect at least one REMOTE instance; and no LOCAL instance load called
    const localLoads = instances
      .filter(i => i.mode === StorageMode.LOCAL)
      .flatMap(i => i.load.mock.calls);
    expect(localLoads.length).toBe(0);
  });

  test('REMOTE mode: when remote returns [], falls back to local (default) and returns local array', async () => {
    remoteBehavior = { kind: 'resolve', value: [] };
    localBehavior = {
      kind: 'resolve',
      value: [{ id: 'l1', groupName: 'Local', bookmarks: [] }],
    };

    const out = await loadInitialBookmarks(userId, workspaceId, StorageMode.REMOTE);
    expect(out).toEqual([{ id: 'l1', groupName: 'Local', bookmarks: [] }]);

    const Storage = getStorageMock();
    // Should have constructed both REMOTE and LOCAL at least once
    const modes = (Storage.mock.instances as Array<{ mode: StorageModeType }>).map(i => i.mode);
    expect(modes).toContain(StorageMode.REMOTE);
    expect(modes).toContain(StorageMode.LOCAL);
  });

  test('REMOTE mode with noLocalFallback=true: when remote returns [], returns [] and does NOT hit local', async () => {
    remoteBehavior = { kind: 'resolve', value: [] };
    localBehavior = {
      kind: 'resolve',
      value: [{ id: 'l-hit', groupName: 'ShouldNotBeUsed', bookmarks: [] }],
    };

    const out = await loadInitialBookmarks(userId, workspaceId, StorageMode.REMOTE, {
      noLocalFallback: true,
    });
    expect(out).toEqual([]);

    const Storage = getStorageMock();
    // Ensure no LOCAL instance was constructed
    const instances = Storage.mock.instances as Array<{ mode: StorageModeType }>;
    expect(instances.some(i => i.mode === StorageMode.LOCAL)).toBe(false);
  });

  test('REMOTE mode: when remote throws, falls back to local (default) and returns local array', async () => {
    remoteBehavior = { kind: 'reject' };
    localBehavior = {
      kind: 'resolve',
      value: [{ id: 'l2', groupName: 'LocalAfterError', bookmarks: [] }],
    };

    const out = await loadInitialBookmarks(userId, workspaceId, StorageMode.REMOTE);
    expect(out).toEqual([{ id: 'l2', groupName: 'LocalAfterError', bookmarks: [] }]);
  });

  test('REMOTE mode with noLocalFallback=true: when remote throws, returns [] and does NOT hit local', async () => {
    remoteBehavior = { kind: 'reject' };
    localBehavior = {
      kind: 'resolve',
      value: [{ id: 'l3', groupName: 'ShouldNotBeUsed', bookmarks: [] }],
    };

    const out = await loadInitialBookmarks(userId, workspaceId, StorageMode.REMOTE, {
      noLocalFallback: true,
    });
    expect(out).toEqual([]);

    const Storage = getStorageMock();
    const instances = Storage.mock.instances as Array<{ mode: StorageModeType }>;
    expect(instances.some(i => i.mode === StorageMode.LOCAL)).toBe(false);
  });

  test('REMOTE (default) path also supports non-array coerce to [] on local fallback', async () => {
    remoteBehavior = { kind: 'resolve', value: [] };
    localBehavior = { kind: 'resolve', value: { weird: 'object' } };

    const out = await loadInitialBookmarks(userId, workspaceId, undefined);
    expect(out).toEqual([]); // ensureGroups() coerces non-array to []
  });
});
