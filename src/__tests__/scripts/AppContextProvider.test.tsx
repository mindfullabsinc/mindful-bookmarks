import React from "react";
import { render, waitFor } from "@testing-library/react";


type GroupsIndex = Array<{ id: string; groupName: string }>;

// Minimal chrome.* surface so effects don't explode
beforeAll(() => {
  (globalThis as any).chrome = {
    storage: {
      local: { get: jest.fn(async () => ({})), set: jest.fn(async () => void 0), remove: jest.fn(async () => void 0) },
      session: { get: jest.fn(async () => ({})), set: jest.fn(async () => void 0), remove: jest.fn(async () => void 0) },
    },
    runtime: { onMessage: { addListener: jest.fn(), removeListener: jest.fn() } },
  };
  (globalThis as any).BroadcastChannel = class { constructor(_: string) {} onmessage: any = null; close() {} postMessage() {} };
});

// Avoid real Amplify calls; keep us in LOCAL path
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => null),
  fetchUserAttributes: jest.fn(async () => ({})),
  updateUserAttribute: jest.fn(async () => ({})),
}));

// ---- Mocks for the generic (non-LOCAL) cache layer (to assert "not called" in LOCAL) ----
const mock_readBookmarkCacheSync = jest.fn();
const mock_writeBookmarkCacheSync = jest.fn();
const mock_readBookmarkCacheSession = jest.fn();
const mock_writeBookmarkCacheSession = jest.fn();

jest.mock("@/scripts/caching/BookmarkCache", () => ({
  readBookmarkCacheSync: (...args: any[]) => mock_readBookmarkCacheSync(...args),
  writeBookmarkCacheSync: (...args: any[]) => mock_writeBookmarkCacheSync(...args),
  readBookmarkCacheSession: (...args: any[]) => mock_readBookmarkCacheSession(...args),
  writeBookmarkCacheSession: (...args: any[]) => mock_writeBookmarkCacheSession(...args),
}));

// ---- Adapter mock (this is what the provider now talks to for LOCAL) ----
const mock_adapter_readPhase1aSnapshot = jest.fn<any, any>(() => null);
const mock_adapter_readPhase1bSessionSnapshot = jest.fn<any, any>(async () => null);
const mock_adapter_readGroupsIndexFast = jest.fn<any, any>(async () => []);
const mock_adapter_persistCachesIfNonEmpty = jest.fn<any, any>(async () => {});

jest.mock('@/scripts/storageAdapters', () => ({
  getAdapter: jest.fn(() => ({
    readPhase1aSnapshot: (...args: any[]) => mock_adapter_readPhase1aSnapshot(...args),
    readPhase1bSessionSnapshot: (...args: any[]) => mock_adapter_readPhase1bSessionSnapshot(...args),
    readGroupsIndexFast: (...args: any[]) => mock_adapter_readGroupsIndexFast(...args),
    persistCachesIfNonEmpty: (...args: any[]) => mock_adapter_persistCachesIfNonEmpty(...args),
  })),
}));

// ---- Mock data & loadInitialBookmarks ----
import { StorageMode } from "@/core/constants/storageMode";
import type { BookmarkGroupType } from "@/core/types/bookmarks";

const demoGroups: BookmarkGroupType[] = [
  { id: "g1", groupName: "One", bookmarks: [] as any[] },
  { id: "g2", groupName: "Two", bookmarks: [] as any[] },
];

jest.mock("@/scripts/bookmarksData", () => {
  const { StorageMode } = require("@/core/constants/storageMode");
  return {
    loadInitialBookmarks: jest.fn(async (_uid: any, storageMode: any) => {
      if (storageMode !== StorageMode.LOCAL) throw new Error("Expected LOCAL mode");
      return demoGroups;
    }),
  };
});

// ---- Now import the SUT (after mocks) ----
import { AppContextProvider } from "@/scripts/AppContextProvider";

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

test("LOCAL mode seeds & writes using the adapter (no generic caches touched)", async () => {
  // Phase 1a seed via adapter
  mock_adapter_readPhase1aSnapshot.mockReturnValueOnce([{ id: "seed", groupName: "Seed", bookmarks: [] }]);

  renderLocalProvider();

  // Phase 1a/1b: adapter is used
  await waitFor(() => {
    expect(mock_adapter_readPhase1aSnapshot).toHaveBeenCalled();
  });
  expect(mock_adapter_readPhase1bSessionSnapshot).toHaveBeenCalled(); // provider warms in phase 1b

  // Ensure generic (REMOTE) cache readers were NOT used in LOCAL path
  expect(mock_readBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_readBookmarkCacheSession).not.toHaveBeenCalled();

  // Phase 2: after loadInitialBookmarks resolves, provider should persist via adapter
  await waitFor(() => {
    expect(mock_adapter_persistCachesIfNonEmpty).toHaveBeenCalledTimes(1);
  });

  // Verify adapter received the groups returned by loadInitialBookmarks
  const [, groupsArg] = mock_adapter_persistCachesIfNonEmpty.mock.calls[0] as [string, BookmarkGroupType[]];
  expect(groupsArg).toEqual(demoGroups);

  // And the generic writers were not called
  expect(mock_writeBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_writeBookmarkCacheSession).not.toHaveBeenCalled();
});

test("LOCAL mode derives groups index via adapter and not generic fast path", async () => {
  const idx: GroupsIndex = [
    { id: "g1", groupName: "One" },
    { id: "g2", groupName: "Two" },
  ];
  mock_adapter_readGroupsIndexFast.mockResolvedValueOnce(idx);

  renderLocalProvider();

  await waitFor(() => {
    expect(mock_adapter_readGroupsIndexFast).toHaveBeenCalled();
  });

  // No generic cache readers in LOCAL
  expect(mock_readBookmarkCacheSync).not.toHaveBeenCalled();
  expect(mock_readBookmarkCacheSession).not.toHaveBeenCalled();
});
