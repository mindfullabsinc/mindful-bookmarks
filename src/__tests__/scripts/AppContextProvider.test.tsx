import React from "react";
import { render, waitFor } from "@testing-library/react";

/* SUT */
import { AppContextProvider } from "@/scripts/AppContextProvider";

/* Types & constants */
import { StorageMode } from "@/core/constants/storageMode";
import type { BookmarkGroupType } from "@/core/types/bookmarks";

/* ---- Test doubles for browser/Amplify env ---- */
beforeAll(() => {
  // Minimal chrome.* surface so effects don't explode
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: jest.fn(async () => ({})),
        set: jest.fn(async () => void 0),
        remove: jest.fn(async () => void 0),
      },
      session: {
        get: jest.fn(async () => ({})),
        set: jest.fn(async () => void 0),
        remove: jest.fn(async () => void 0),
      },
    },
    runtime: {
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  };

  // BroadcastChannel shim
  (globalThis as any).BroadcastChannel = class {
    constructor(_name: string) {}
    onmessage: any = null;
    close() {}
    postMessage() {}
  };
});

// Avoid real Amplify calls; keep us in LOCAL path
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => null),
  fetchUserAttributes: jest.fn(async () => ({})),
  updateUserAttribute: jest.fn(async () => ({})),
}));

/* ---- Mocks for cache layers ---- */
const mock_readFpIndexLocalSync = jest.fn<ReturnType<any>, any>(() => []);
const mock_writeFpIndexLocalSync = jest.fn();
const mock_readFpGroupsLocalSync = jest.fn<ReturnType<any>, any>(() => []);
const mock_writeFpGroupsLocalSync = jest.fn();

jest.mock("@/scripts/BookmarkCacheLocalFirstPaint", () => ({
  readFpIndexLocalSync: (...args: any[]) => mock_readFpIndexLocalSync(...args),
  writeFpIndexLocalSync: (...args: any[]) => mock_writeFpIndexLocalSync(...args),
  readFpGroupsLocalSync: (...args: any[]) => mock_readFpGroupsLocalSync(...args),
  writeFpGroupsLocalSync: (...args: any[]) => mock_writeFpGroupsLocalSync(...args),
}));

const mock_readBookmarkCacheSync = jest.fn();
const mock_writeBookmarkCacheSync = jest.fn();
const mock_readBookmarkCacheSession = jest.fn();
const mock_writeBookmarkCacheSession = jest.fn();

jest.mock("@/scripts/BookmarkCache", () => ({
  readBookmarkCacheSync: (...args: any[]) => mock_readBookmarkCacheSync(...args),
  writeBookmarkCacheSync: (...args: any[]) => mock_writeBookmarkCacheSync(...args),
  readBookmarkCacheSession: (...args: any[]) => mock_readBookmarkCacheSession(...args),
  writeBookmarkCacheSession: (...args: any[]) => mock_writeBookmarkCacheSession(...args),
}));

/* During Phase 2 the provider calls loadInitialBookmarks → return groups */
const demoGroups: BookmarkGroupType[] = [
  { id: "g1", groupName: "One", bookmarks: [] as any[] },
  { id: "g2", groupName: "Two", bookmarks: [] as any[] },
];

jest.mock("@/scripts/bookmarksData", () => {
  // Pull StorageMode inside the factory so it’s not out-of-scope
  const { StorageMode } = require("@/core/constants/storageMode");

  return {
    loadInitialBookmarks: jest.fn(async (_uid: any, storageMode: any) => {
      if (storageMode !== StorageMode.LOCAL) throw new Error("Expected LOCAL mode");
      // Only reference mock* vars from outside scope
      return demoGroups;
    }),
  };
});

/* Utility: render with LOCAL mode preference to force the LOCAL path */
function renderLocalProvider() {
  return render(
    <AppContextProvider user={null} preferredStorageMode={StorageMode.LOCAL}>
      <div data-testid="child" />
    </AppContextProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("LOCAL mode seeds & writes using WS-local first-paint caches only", async () => {
  // Make the LOCAL first-paint read return something for the seed path
  mock_readFpGroupsLocalSync.mockReturnValueOnce([{ id: "seed", groupName: "Seed", bookmarks: [] }]);

  renderLocalProvider();

  // Phase 1a/1b: ensure we never touch the generic cache readers in LOCAL mode
  await waitFor(() => {
    expect(mock_readFpGroupsLocalSync).toHaveBeenCalled();
  });

  expect(mock_readBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_readBookmarkCacheSession).not.toHaveBeenCalled();

  // Phase 2: after loadInitialBookmarks resolves, provider should persist via LOCAL fp writers,
  // and NEVER call the generic writeBookmarkCache* in LOCAL mode.
  await waitFor(() => {
    expect(mock_writeFpIndexLocalSync).toHaveBeenCalledTimes(1);
    expect(mock_writeFpGroupsLocalSync).toHaveBeenCalledTimes(1);
  });

  expect(mock_writeBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_writeBookmarkCacheSession).not.toHaveBeenCalled();

  // Sanity-check: the write used the same data we returned from loadInitialBookmarks
  const [, groupsToPersist] = mock_writeFpGroupsLocalSync.mock.calls[0] as [string, BookmarkGroupType[]];
  expect(groupsToPersist).toEqual(demoGroups);
});

test("LOCAL mode derives groups index from WS-local fp index helper and not the generic fast path", async () => {
  // Return an index via Local-first-paint reader
  mock_readFpIndexLocalSync.mockReturnValueOnce([
    { id: "g1", groupName: "One" },
    { id: "g2", groupName: "Two" },
  ]);

  renderLocalProvider();

  await waitFor(() => {
    // We used WS-local index to hydrate index UI; no generic index helpers were invoked
    expect(mock_readFpIndexLocalSync).toHaveBeenCalled();
  });

  // readGroupsIndexFast() may exist for generic path; ensure we didn't hit generic cache readers
  expect(mock_readBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_readBookmarkCacheSession).not.toHaveBeenCalled();
});
