import {
  readFpIndexLocalSync,
  writeFpIndexLocalSync,
  readFpGroupsLocalSync,
  writeFpGroupsLocalSync,
  clearFpLocal,
} from "@/scripts/caching/bookmarkCacheLocalFirstPaint";

// Make cache key functions deterministic for tests
jest.mock("@/scripts/caching/cacheKeys", () => ({
  fpGroupsIndexKey: (workspaceId: string) => `idx:${workspaceId}`,
  fpGroupsBlobKey: (workspaceId: string) => `blob:${workspaceId}`,
}));

type StorageMap = Record<string, string>;

function createStorageMock(map: StorageMap) {
  return {
    getItem: jest.fn((key: string) => (key in map ? map[key] : null)),
    setItem: jest.fn((key: string, value: string) => {
      map[key] = String(value);
    }),
    removeItem: jest.fn((key: string) => {
      delete map[key];
    }),
    clear: jest.fn(() => {
      Object.keys(map).forEach((k) => delete map[k]);
    }),
  };
}

describe("fpLocalCache helpers", () => {
  let localStorageMap: StorageMap;
  let sessionStorageMap: StorageMap;
  let localStorageMock: ReturnType<typeof createStorageMock>;
  let sessionStorageMock: ReturnType<typeof createStorageMock>;

  const originalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalSessionStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage"
  );

  beforeEach(() => {
    localStorageMap = {};
    sessionStorageMap = {};

    localStorageMock = createStorageMock(localStorageMap);
    sessionStorageMock = createStorageMock(sessionStorageMap);

    // Override jsdom's localStorage / sessionStorage with our mocks
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: localStorageMock,
    });

    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: sessionStorageMock,
    });
  });

  afterAll(() => {
    // Restore originals (if they existed)
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }

    if (originalSessionStorage) {
      Object.defineProperty(
        globalThis,
        "sessionStorage",
        originalSessionStorage
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).sessionStorage;
    }
  });

  describe("readFpIndexLocalSync", () => {
    it("returns an empty array when no entry exists", () => {
      const result = readFpIndexLocalSync("ws-1");

      expect(localStorageMock.getItem).toHaveBeenCalledWith("idx:ws-1");
      expect(result).toEqual([]);
    });

    it("returns parsed index when valid JSON is stored", () => {
      const idxKey = "idx:ws-1";
      const stored = [
        { id: "1", groupName: "Foo" },
        { id: "2", groupName: "Bar" },
      ];
      localStorageMap[idxKey] = JSON.stringify(stored);

      const result = readFpIndexLocalSync("ws-1");

      expect(result).toEqual(stored);
    });

    it("gracefully falls back to [] on malformed JSON", () => {
      const idxKey = "idx:ws-1";
      localStorageMap[idxKey] = "{ this is not valid JSON";

      const result = readFpIndexLocalSync("ws-1");

      expect(result).toEqual([]);
    });
  });

  describe("writeFpIndexLocalSync", () => {
    it("does nothing when groups is null/undefined/empty", () => {
      writeFpIndexLocalSync("ws-1", null);
      writeFpIndexLocalSync("ws-1", undefined);
      writeFpIndexLocalSync("ws-1", [] as any);

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("writes a minimal id/groupName index to localStorage", () => {
      const groups = [
        { id: 1, groupName: "Foo", extra: "ignored" },
        { id: "2", groupName: "Bar" },
      ] as unknown as any[]; // BookmarkGroupType[] in real code

      writeFpIndexLocalSync("ws-1", groups);

      const expectedIndex = [
        { id: "1", groupName: "Foo" },
        { id: "2", groupName: "Bar" },
      ];

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "idx:ws-1",
        JSON.stringify(expectedIndex)
      );
    });

    it("swallows errors from localStorage.setItem", () => {
      (localStorageMock.setItem as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });

      const groups = [
        { id: "1", groupName: "Foo" },
      ] as unknown as any[];

      expect(() =>
        writeFpIndexLocalSync("ws-1", groups)
      ).not.toThrow();
    });
  });

  describe("readFpGroupsLocalSync", () => {
    it("returns [] when there is no stored snapshot", () => {
      const result = readFpGroupsLocalSync("ws-1");

      expect(localStorageMock.getItem).toHaveBeenCalledWith("blob:ws-1");
      expect(result).toEqual([]);
    });

    it("returns parsed groups when valid JSON exists", () => {
      const blobKey = "blob:ws-1";
      const groups = [
        { id: "1", groupName: "Foo", bookmarks: [] },
        { id: "2", groupName: "Bar", bookmarks: [] },
      ];
      localStorageMap[blobKey] = JSON.stringify(groups);

      const result = readFpGroupsLocalSync("ws-1");

      expect(result).toEqual(groups);
    });

    it("gracefully falls back to [] on malformed JSON", () => {
      const blobKey = "blob:ws-1";
      localStorageMap[blobKey] = "{ not valid json";

      const result = readFpGroupsLocalSync("ws-1");

      expect(result).toEqual([]);
    });
  });

  describe("writeFpGroupsLocalSync", () => {
    it("does nothing when groups is null/undefined/empty", () => {
      writeFpGroupsLocalSync("ws-1", null);
      writeFpGroupsLocalSync("ws-1", undefined);
      writeFpGroupsLocalSync("ws-1", [] as any);

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("writes the groups snapshot to localStorage", () => {
      const groups = [
        { id: "1", groupName: "Foo", bookmarks: [] },
        { id: "2", groupName: "Bar", bookmarks: [] },
      ] as unknown as any[];

      writeFpGroupsLocalSync("ws-1", groups);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "blob:ws-1",
        JSON.stringify(groups)
      );
    });

    it("swallows errors from localStorage.setItem", () => {
      (localStorageMock.setItem as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });

      const groups = [
        { id: "1", groupName: "Foo", bookmarks: [] },
      ] as unknown as any[];

      expect(() =>
        writeFpGroupsLocalSync("ws-1", groups)
      ).not.toThrow();
    });
  });

  describe("clearFpLocal", () => {
    it("removes index and blob keys from localStorage and sessionStorage", () => {
      clearFpLocal("ws-1");

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("idx:ws-1");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("blob:ws-1");
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith("blob:ws-1");
    });

    it("swallows errors from removeItem calls", () => {
      (localStorageMock.removeItem as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });

      expect(() => clearFpLocal("ws-1")).not.toThrow();
    });
  });
});