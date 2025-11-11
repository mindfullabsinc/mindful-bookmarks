/**
 * @file Storage.test.ts
 * Tests for Storage class local/remote strategies with workspace scoping.
 */

import type { BookmarkGroupType } from '@/core/types/bookmarks';
import type { WorkspaceIdType } from '@/core/constants/workspaces';
import { Storage } from '@/scripts/Storage';
import { StorageMode } from '@/core/constants/storageMode';

// === Use the real amplify_outputs.json so expectations match your env ===
import amplifyOutputs from '../../../amplify_outputs.json'
const API_BASE = amplifyOutputs.custom.API.bookmarks.endpoint;

// ---- Mocks ----

// 1) Deterministic storage key for tests
jest.mock('@/core/utils/utilities', () => ({
  getUserStorageKey: (userId: string, workspaceId: WorkspaceIdType) =>
    `bookmarks_${userId}_${String(workspaceId)}`,
}));

// 2) Mock aws-amplify/auth for remote strategy token retrieval
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));
import { fetchAuthSession } from 'aws-amplify/auth';

// ---- Chrome.storage shim (in-memory) ----
// --- Minimal in-memory store ---
type Store = Record<string, unknown>;
let memStore: Store = {};

// Helpers to build results like Chrome does
const resultForKeys = (keys?: any): Record<string, unknown> => {
  // 1) string key
  if (typeof keys === 'string') return { [keys]: memStore[keys] };

  // 2) array of keys
  if (Array.isArray(keys)) {
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = memStore[k];
    return out;
  }

  // 3) object of defaults: copy defaults, then overlay found values
  if (keys && typeof keys === 'object') {
    const out = { ...keys };
    for (const k of Object.keys(keys)) {
      if (k in memStore) out[k] = memStore[k];
    }
    return out;
  }

  // 4) undefined/null → return whole store
  return { ...memStore };
};

// ---- get with overloads ----
const chromeGet = ((...args: any[]) => {
  // get(callback)
  if (typeof args[0] === 'function') {
    const cb = args[0];
    cb(resultForKeys(undefined));
    return;
  }

  // get(keys, callback)
  if (typeof args[1] === 'function') {
    const [keys, cb] = args as [any, (items: any) => void];
    cb(resultForKeys(keys));
    return;
  }

  // get(keys?) → Promise
  const [keys] = args as [any?];
  return Promise.resolve(resultForKeys(keys));
}) as unknown as typeof chrome.storage.local.get;

// ---- set with overloads ----
const chromeSet = ((items: Record<string, unknown>, cb?: () => void) => {
  Object.assign(memStore, items);
  if (typeof cb === 'function') return cb();
  return Promise.resolve();
}) as unknown as typeof chrome.storage.local.set;

// ---- remove with overloads ----
const chromeRemove = ((keys: string | string[], cb?: () => void) => {
  const arr = Array.isArray(keys) ? keys : [keys];
  for (const k of arr) delete memStore[k];
  if (typeof cb === 'function') return cb();
  return Promise.resolve();
}) as unknown as typeof chrome.storage.local.remove;

// ---- attach shim ----
// @ts-ignore
global.chrome = global.chrome || {};
// @ts-ignore
global.chrome.storage = global.chrome.storage || {};
// @ts-ignore
global.chrome.storage.local = {
  get: chromeGet,
  set: chromeSet,
  remove: chromeRemove,
};

// ---- Fetch shim ----
const fetchMock = jest.fn();
// @ts-ignore
global.fetch = fetchMock;

// ---- Silence noisy console logs from the SUT ----
let consoleLogSpy: jest.SpyInstance;
beforeAll(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  consoleLogSpy.mockRestore();
});

// ---- Sample data ----
const USER = 'user-1';
const WS: WorkspaceIdType = 'ws-1' as unknown as WorkspaceIdType;
const SAMPLE_BOOKMARKS: BookmarkGroupType[] = [
  { id: 'g-1', groupName: 'Work', bookmarks: [] },
  { id: 'g-2', groupName: 'Reading', bookmarks: [{ id: 'b-1', name: 'Docs', url: 'https://example.com' }] },
];

// ---- Helpers ----
const keyFor = (user = USER, ws: WorkspaceIdType = WS) => `bookmarks_${user}_${String(ws)}`;

describe('Storage (local strategy)', () => {
  beforeEach(() => {
    memStore = {};
    fetchMock.mockReset();
    (fetchAuthSession as jest.Mock).mockReset();
  });

  it('loads empty array when nothing is saved', async () => {
    const storage = new Storage(StorageMode.LOCAL);
    const data = await storage.load(USER, WS);
    expect(data).toEqual([]);
  });

  it('saves and then loads bookmarks scoped by user + workspace', async () => {
    const storage = new Storage(StorageMode.LOCAL);

    await storage.save(SAMPLE_BOOKMARKS, USER, WS);
    expect(memStore[keyFor()]).toEqual(SAMPLE_BOOKMARKS);

    const loaded = await storage.load(USER, WS);
    expect(loaded).toEqual(SAMPLE_BOOKMARKS);
  });

  it('delete removes bookmarks for the scoped key only', async () => {
    const storage = new Storage(StorageMode.LOCAL);

    await storage.save(SAMPLE_BOOKMARKS, USER, WS);
    await storage.save([{ id: 'g-x', groupName: 'Other', bookmarks: [] }], USER, 'ws-2' as any);

    await storage.delete(USER, WS);

    expect(memStore[keyFor()]).toBeUndefined();
    expect(memStore[keyFor(USER, 'ws-2' as any)]).toBeDefined();
  });
});

describe('Storage (remote strategy)', () => {
  beforeEach(() => {
    memStore = {};
    fetchMock.mockReset();
    (fetchAuthSession as jest.Mock).mockReset();
  });

  const mockToken = () => {
    (fetchAuthSession as jest.Mock).mockResolvedValue({
      tokens: {
        idToken: { toString: () => 'idtoken-123' },
      },
    });
  };

  it('load → returns array from API on success', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_BOOKMARKS,
    });

    const storage = new Storage(StorageMode.REMOTE);
    const data = await storage.load(USER, WS);

    expect(fetchAuthSession).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/bookmarks`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer idtoken-123' }),
      }),
    );
    expect(data).toEqual(SAMPLE_BOOKMARKS);
  });

  it('load → returns [] on API error', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ message: 'nope' }),
    });

    const storage = new Storage(StorageMode.REMOTE);
    const data = await storage.load(USER, WS);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it('save → POSTs payload and returns JSON on success', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const storage = new Storage(StorageMode.REMOTE);
    const res = await storage.save(SAMPLE_BOOKMARKS, USER, WS);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/bookmarks`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer idtoken-123',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(SAMPLE_BOOKMARKS),
      }),
    );
    expect(res).toEqual({ success: true });
  });

  it('save → throws on non-ok response with message', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
      json: async () => ({ message: 'not allowed' }),
    });

    const storage = new Storage(StorageMode.REMOTE);
    await expect(storage.save(SAMPLE_BOOKMARKS, USER, WS)).rejects.toThrow(
      /Failed to save bookmarks: not allowed|Forbidden/,
    );
  });

  it('delete → calls DELETE and resolves on success', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({ ok: true });

    const storage = new Storage(StorageMode.REMOTE);
    await expect(storage.delete(USER, WS)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/bookmarks`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer idtoken-123' }),
      }),
    );
  });

  it('delete → throws on failure', async () => {
    mockToken();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const storage = new Storage(StorageMode.REMOTE);
    await expect(storage.delete(USER, WS)).rejects.toThrow(/Failed to delete bookmarks/);
  });
});
