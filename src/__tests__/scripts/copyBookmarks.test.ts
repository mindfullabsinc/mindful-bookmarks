jest.resetModules();

const origCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: jest.fn(() => `uuid-${Math.random()}`) },
  configurable: true,
});

import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkGroupType, BookmarkType } from "@/core/types/bookmarks";

import { copyItems, moveItems } from "@/scripts/copyBookmarks"; 

// --- Mocks -------------------------------------------------------------------

jest.mock("@/scripts/storageAdapters", () => ({
  getAdapter: jest.fn(),
}));

// Keep normalizeUrl simple and predictable for tests
jest.mock("@/core/utils/utilities", () => ({
  normalizeUrl: (u: string) => u.toLowerCase().replace(/\/+$/, ""),
}));

import { getAdapter } from "@/scripts/storageAdapters";

beforeAll(() => {
  let counter = 0;
  const nextUuid = () => `uuid-${++counter}`;

  // Force override
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: jest.fn(() => nextUuid()) },
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: origCrypto, configurable: true });
});

type MemStore = Map<string, BookmarkGroupType[]>;

const deepClone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Build a simple in-memory adapter
function makeMemoryAdapter(store: MemStore) {
  return {
    // read by storageKey
    readAllGroups: jest.fn(async (storageKey: string): Promise<BookmarkGroupType[]> => {
      return deepClone(store.get(storageKey) || []);
    }),
    // write by (workspaceId, storageKey, groups)
    writeAllGroups: jest.fn(async (
      _wid: WorkspaceIdType,
      storageKey: string,
      groups: BookmarkGroupType[]
    ) => {
      store.set(storageKey, deepClone(groups));
    }),
  };
}


// --- Fixtures ----------------------------------------------------------------

const WS_A = "ws-a" as WorkspaceIdType;
const WS_B = "ws-b" as WorkspaceIdType;
const STORAGE_KEY_A = "storage-a" as string;
const STORAGE_KEY_B = "storage-b" as string;

const g = (id: string, name: string, bookmarks: BookmarkType[]): BookmarkGroupType => ({
  id,
  groupName: name,
  bookmarks: deepClone(bookmarks),
});

const b = (id: string, name: string, url: string): BookmarkType => ({
  id,
  name,
  url,
});

// Resets per test
let store: MemStore;
let adapter: ReturnType<typeof makeMemoryAdapter>;

beforeEach(() => {
  store = new Map();

  // Source at STORAGE_KEY_A
  store.set(STORAGE_KEY_A, [
    g("ga1", "Alpha", [
      b("ba1", "Site One", "https://one.com"),
      b("ba2", "Site Two", "https://two.com"),
    ]),
    g("ga2", "Beta", [
      b("bb1", "TWO (dup)", "https://two.com/"),
      b("bb2", "Site Three", "https://three.com"),
    ]),
  ]);

  // Destination at STORAGE_KEY_B
  store.set(STORAGE_KEY_B, [
    g("gb1", "Destination", [ b("bd1", "Existing", "https://existing.com") ]),
  ]);

  adapter = makeMemoryAdapter(store);
  (getAdapter as jest.Mock).mockReturnValue(adapter);
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Tests -------------------------------------------------------------------

test("copies entire group by id, generating new ids and writing only the destination", async () => {
  const res = await copyItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: { kind: "group", groupId: "ga1" },
    dedupeByUrl: true,
  });

  // ba1 + ba2 both should be copied unless deduped by dest
  // dest had existing.com only, so both should be added
  expect(res).toEqual({ added: 2, skipped: 0 });

  // Destination got a new group appended
  const destAfter = await adapter.readAllGroups(STORAGE_KEY_B);
  expect(destAfter).toHaveLength(2);

  const newGroup = destAfter[1];
  expect(newGroup.groupName).toBe("Alpha");
  expect(newGroup.id).toMatch(/^uuid-/);
  expect(newGroup.bookmarks).toHaveLength(2);
  expect(newGroup.bookmarks[0].id).toMatch(/^uuid-/);
  expect(newGroup.bookmarks[1].id).toMatch(/^uuid-/);

  // Source untouched
  const srcAfter = await adapter.readAllGroups(STORAGE_KEY_A);
  expect(srcAfter).toHaveLength(2);

  // writeAllGroups called for destination only
  expect(adapter.writeAllGroups).toHaveBeenCalledTimes(1);
  expect(adapter.writeAllGroups).toHaveBeenCalledWith(WS_B, STORAGE_KEY_B, expect.any(Array));
});

test("de-dupes by URL across ALL destination groups when copying whole group", async () => {
  // Add a bookmark to destination that will collide with a source bookmark ("https://two.com")
  store.set(STORAGE_KEY_B, [
    g("gb1", "Destination", [
      b("bd1", "Existing", "https://two.com"), // will normalize to same as ba2/bb1
    ]),
  ]);

  const res = await copyItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: { kind: "group", groupId: "ga2" }, // contains bb1 (two.com) + bb2 (three.com)
    dedupeByUrl: true,
  });

  // Expect to skip the duplicate (bb1) and add bb2 only
  expect(res).toEqual({ added: 1, skipped: 1 });

  const destAfter = await adapter.readAllGroups(STORAGE_KEY_B);
  const copied = destAfter.find((x) => x.id !== "gb1")!;
  expect(copied.bookmarks.map((bk) => bk.url)).toEqual(["https://three.com"]);
});

test("de-dupe OFF allows duplicates", async () => {
  // Destination has two.com; we will still add bb1 when dedupeByUrl=false
  store.set(STORAGE_KEY_B, [
    g("gb1", "Destination", [b("bd1", "Existing", "https://two.com")]),
  ]);

  const res = await copyItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: { kind: "group", groupId: "ga2" },
    dedupeByUrl: false,
  });

  // bb1 and bb2 both added
  expect(res).toEqual({ added: 2, skipped: 0 });

  const destAfter = await adapter.readAllGroups(STORAGE_KEY_B);
  const copied = destAfter.find((x) => x.id !== "gb1")!;
  expect(copied.bookmarks).toHaveLength(2);
});

test("copies specific bookmarks into a known destination group (chunked + progress)", async () => {
  const onProgress = jest.fn();

  const res = await copyItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: {
      kind: "bookmark",
      bookmarkIds: ["ba1", "bb2", "ba2"], // mixed from both groups
      intoGroupId: "gb1", // Destination group exists
    },
    chunkSize: 1, // force yielding each bookmark
    onProgress,
  });

  expect(res).toEqual({ added: 3, skipped: 0 });

  // onProgress called once per chunk (3 chunks)
  expect(onProgress).toHaveBeenCalledTimes(3);
  expect(onProgress).toHaveBeenNthCalledWith(1, 1, 0);
  expect(onProgress).toHaveBeenNthCalledWith(2, 2, 0);
  expect(onProgress).toHaveBeenNthCalledWith(3, 3, 0);

  const destAfter = await adapter.readAllGroups(STORAGE_KEY_B);
  const dest = destAfter.find((x) => x.id === "gb1")!;
  const urls = dest.bookmarks.map((bk) => bk.url);
  expect(urls).toEqual(["https://existing.com", "https://one.com", "https://three.com", "https://two.com"]);
});

test("copy specific bookmarks throws when destination group not found", async () => {
  await expect(
    copyItems({
      fromWorkspaceId: WS_A,
      toWorkspaceId: WS_B,
      fromStorageKey: STORAGE_KEY_A,
      toStorageKey: STORAGE_KEY_B,
      target: {
        kind: "bookmark",
        bookmarkIds: ["ba1"],
        intoGroupId: "does-not-exist",
      },
    })
  ).rejects.toThrow("Destination group not found");
});

test("moveItems removes groups from source", async () => {
  const res = await moveItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: { kind: "group", groupId: "ga1" },
    dedupeByUrl: true,
  });

  expect(res).toEqual({ added: 2, skipped: 0 });

  const srcAfter = await adapter.readAllGroups(STORAGE_KEY_A);
  // ga1 should be removed, only ga2 remains
  expect(srcAfter.map((g) => g.id)).toEqual(["ga2"]);
});

test("moveItems with removes specific bookmarks from source", async () => {
  const res = await moveItems({
    fromWorkspaceId: WS_A,
    toWorkspaceId: WS_B,
    fromStorageKey: STORAGE_KEY_A,
    toStorageKey: STORAGE_KEY_B,
    target: {
      kind: "bookmark",
      bookmarkIds: ["ba1", "bb2"], // remove one from each source group
      intoGroupId: "gb1",
    },
  });

  expect(res.added).toBe(2);

  const srcAfter = await adapter.readAllGroups(STORAGE_KEY_A);
  const alpha = srcAfter.find((g) => g.id === "ga1")!;
  const beta = srcAfter.find((g) => g.id === "ga2")!;

  expect(alpha.bookmarks.map((b) => b.id)).toEqual(["ba2"]); // ba1 removed
  expect(beta.bookmarks.map((b) => b.id)).toEqual(["bb1"]); // bb2 removed
});

test("errors if adapter lacks readAllGroups/writeAllGroups", async () => {
  (getAdapter as jest.Mock).mockReturnValueOnce({} as any);

  await expect(
    copyItems({
      fromWorkspaceId: WS_A,
      toWorkspaceId: WS_B,
      fromStorageKey: STORAGE_KEY_A,
      toStorageKey: STORAGE_KEY_B,
      target: { kind: "group", groupId: "ga1" },
    })
  ).rejects.toThrow("Local adapter missing readAllGroups/writeAllGroups");
});
