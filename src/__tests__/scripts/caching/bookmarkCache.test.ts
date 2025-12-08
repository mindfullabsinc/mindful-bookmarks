import {
  readBookmarkCacheSync,
  writeBookmarkCacheSync,
  readGroupsIndexSession,
  writeGroupsIndexSession,
  clearSessionGroupsIndexExcept,
  readBookmarkCacheSession,
  writeBookmarkCacheSession,
  clearBookmarkCaches,
} from "@/scripts/caching/bookmarkCache";

import {
  DEFAULT_LOCAL_WORKSPACE_ID,
  type WorkspaceIdType,
} from "@/core/constants/workspaces";

type BookmarkSnapshot = { data: any; at: number; etag?: string };
type GroupsIndexEntry = { id: string; groupName: string };

const groupsIndexKey = (wid: WorkspaceIdType) =>
  `mindful_${wid}_groups_index_v1`;
const bookmarksSnapshotKey = (wid: WorkspaceIdType) =>
  `mindful_${wid}_bookmarks_snapshot_v1`;

describe("bookmark cache helpers", () => {
  beforeEach(() => {
    // Use real jsdom storages, just reset them
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }

    (globalThis as any).chrome = {
      storage: {
        session: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /* -------------------- readBookmarkCacheSync -------------------- */

  describe("readBookmarkCacheSync", () => {
    it("returns null when nothing is stored", () => {
      const wid = "wid-1" as WorkspaceIdType;

      const result = readBookmarkCacheSync(wid);

      expect(result).toBeNull();
    });

    it("returns null when stored value is invalid JSON", () => {
      const wid = "wid-2" as WorkspaceIdType;
      const key = bookmarksSnapshotKey(wid);
      localStorage.setItem(key, "not-json");

      const result = readBookmarkCacheSync(wid);

      expect(result).toBeNull();
    });

    it("returns parsed bookmark snapshot when present", () => {
      const wid = "wid-3" as WorkspaceIdType;
      const key = bookmarksSnapshotKey(wid);
      const snapshot: BookmarkSnapshot = {
        data: { foo: "bar" },
        at: 12345,
        etag: "tag-1",
      };
      localStorage.setItem(key, JSON.stringify(snapshot));

      const result = readBookmarkCacheSync(wid);

      expect(result).toEqual(snapshot);
    });

    it("uses DEFAULT_LOCAL_WORKSPACE_ID when no workspaceId is passed", () => {
      const key = bookmarksSnapshotKey(DEFAULT_LOCAL_WORKSPACE_ID);
      const snapshot: BookmarkSnapshot = { data: { a: 1 }, at: 99 };
      localStorage.setItem(key, JSON.stringify(snapshot));

      const result = readBookmarkCacheSync(); // no arg

      expect(result).toEqual(snapshot);
    });
  });

  /* -------------------- writeBookmarkCacheSync -------------------- */

  describe("writeBookmarkCacheSync", () => {
    it("writes index and snapshot to localStorage for the given workspace", () => {
      const wid = "wid-4" as WorkspaceIdType;
      const data = {
        idx: [{ id: "g1", groupName: "Group 1" }],
        snap: { data: { foo: "bar" }, at: 111 } as BookmarkSnapshot,
      };

      writeBookmarkCacheSync(data, wid);

      expect(localStorage.getItem(groupsIndexKey(wid))).toEqual(
        JSON.stringify(data.idx)
      );
      expect(localStorage.getItem(bookmarksSnapshotKey(wid))).toEqual(
        JSON.stringify(data.snap)
      );
    });

    it("uses DEFAULT_LOCAL_WORKSPACE_ID when no workspaceId is passed", () => {
      const data = { idx: [], snap: { data: [], at: 1 } };

      writeBookmarkCacheSync(data);

      expect(
        localStorage.getItem(groupsIndexKey(DEFAULT_LOCAL_WORKSPACE_ID))
      ).toEqual(JSON.stringify(data.idx));
      expect(
        localStorage.getItem(bookmarksSnapshotKey(DEFAULT_LOCAL_WORKSPACE_ID))
      ).toEqual(JSON.stringify(data.snap));
    });

    it("swallows errors from localStorage.setItem", () => {
      const originalSet = localStorage.setItem;
      (localStorage as any).setItem = () => {
        throw new Error("boom");
      };

      expect(() =>
        writeBookmarkCacheSync({ idx: [], snap: { data: [], at: 1 } })
      ).not.toThrow();

      (localStorage as any).setItem = originalSet;
    });
  });

  /* -------------------- readGroupsIndexSession -------------------- */

  describe("readGroupsIndexSession", () => {
    it("returns null when chrome.storage.session is not available", async () => {
      (globalThis as any).chrome = {}; // remove storage

      const result = await readGroupsIndexSession("wid-x" as WorkspaceIdType);
      expect(result).toBeNull();
    });

    it("returns null when value is not an array", async () => {
      const wid = "wid-y" as WorkspaceIdType;
      const key = `groupsIndex:${wid}`;

      (globalThis as any).chrome.storage.session.get = jest
        .fn()
        .mockResolvedValue({ [key]: "not-an-array" });

      const result = await readGroupsIndexSession(wid);
      expect(result).toBeNull();
    });

    it("returns groups index array when present", async () => {
      const wid = "wid-z" as WorkspaceIdType;
      const key = `groupsIndex:${wid}`;
      const idx: GroupsIndexEntry[] = [
        { id: "g1", groupName: "Group 1" },
        { id: "g2", groupName: "Group 2" },
      ];

      const getMock = (globalThis as any).chrome.storage.session
        .get as jest.Mock;
      getMock.mockResolvedValue({ [key]: idx });

      const result = await readGroupsIndexSession(wid);

      expect(result).toEqual(idx);
      expect(getMock).toHaveBeenCalledWith([key]);
    });

    it("returns null when chrome.storage.session.get throws", async () => {
      const getMock = (globalThis as any).chrome.storage.session
        .get as jest.Mock;
      getMock.mockRejectedValue(new Error("boom"));

      const result = await readGroupsIndexSession("wid-err" as WorkspaceIdType);
      expect(result).toBeNull();
    });
  });

  /* -------------------- writeGroupsIndexSession -------------------- */

  describe("writeGroupsIndexSession", () => {
    it("no-ops when chrome.storage.session.set is not available", async () => {
      (globalThis as any).chrome.storage.session.set = undefined;

      await expect(
        writeGroupsIndexSession("wid-1" as WorkspaceIdType, [])
      ).resolves.toBeUndefined();
    });

    it("writes index to chrome.storage.session", async () => {
      const wid = "wid-2" as WorkspaceIdType;
      const idx: GroupsIndexEntry[] = [{ id: "g1", groupName: "G1" }];
      const key = `groupsIndex:${wid}`;

      const setMock = (globalThis as any).chrome.storage.session
        .set as jest.Mock;

      await writeGroupsIndexSession(wid, idx);

      expect(setMock).toHaveBeenCalledWith({ [key]: idx });
    });

    it("swallows errors thrown by chrome.storage.session.set", async () => {
      const setMock = (globalThis as any).chrome.storage.session
        .set as jest.Mock;
      setMock.mockRejectedValue(new Error("boom"));

      await expect(
        writeGroupsIndexSession("wid-3" as WorkspaceIdType, [])
      ).resolves.toBeUndefined();
    });
  });

  /* -------------------- clearSessionGroupsIndexExcept -------------------- */

  describe("clearSessionGroupsIndexExcept", () => {
    it("no-ops when chrome.storage.session.get/remove are not available", async () => {
      (globalThis as any).chrome.storage.session.get = undefined;
      (globalThis as any).chrome.storage.session.remove = undefined;

      await expect(
        clearSessionGroupsIndexExcept("wid-keep" as WorkspaceIdType)
      ).resolves.toBeUndefined();
    });

    it("removes all groupsIndex:* keys except the one for keepWorkspaceId", async () => {
      const keep = "wid-keep" as WorkspaceIdType;
      const keyKeep = `groupsIndex:${keep}`;
      const keyOther1 = "groupsIndex:wid-other-1";
      const keyOther2 = "groupsIndex:wid-other-2";

      const getMock = (globalThis as any).chrome.storage.session
        .get as jest.Mock;
      const removeMock = (globalThis as any).chrome.storage.session
        .remove as jest.Mock;

      getMock.mockResolvedValue({
        [keyKeep]: [],
        [keyOther1]: [],
        [keyOther2]: [],
        someOtherKey: 123,
      });

      await clearSessionGroupsIndexExcept(keep);

      expect(getMock).toHaveBeenCalledWith(null);
      expect(removeMock).toHaveBeenCalledWith([keyOther1, keyOther2]);
    });

    it("swallows errors thrown by chrome.storage.session.get", async () => {
      const getMock = (globalThis as any).chrome.storage.session
        .get as jest.Mock;
      getMock.mockRejectedValue(new Error("boom"));

      await expect(
        clearSessionGroupsIndexExcept("wid-keep" as WorkspaceIdType)
      ).resolves.toBeUndefined();
    });
  });

  /* -------------------- readBookmarkCacheSession (deprecated) -------------------- */

  describe("readBookmarkCacheSession (deprecated mirror)", () => {
    it("returns null when nothing stored", async () => {
      const result = await readBookmarkCacheSession("wid-1" as WorkspaceIdType);
      expect(result).toBeNull();
    });

    it("returns null on invalid JSON", async () => {
      const wid = "wid-2" as WorkspaceIdType;
      const key = bookmarksSnapshotKey(wid);
      sessionStorage.setItem(key, "not-json");

      const result = await readBookmarkCacheSession(wid);
      expect(result).toBeNull();
    });

    it("returns parsed snapshot on valid JSON", async () => {
      const wid = "wid-3" as WorkspaceIdType;
      const key = bookmarksSnapshotKey(wid);
      const snapshot: BookmarkSnapshot = { data: { foo: "bar" }, at: 42 };
      sessionStorage.setItem(key, JSON.stringify(snapshot));

      const result = await readBookmarkCacheSession(wid);

      expect(result).toEqual(snapshot);
    });

    it("uses DEFAULT_LOCAL_WORKSPACE_ID when no workspaceId is passed", async () => {
      const key = bookmarksSnapshotKey(DEFAULT_LOCAL_WORKSPACE_ID);
      const snapshot: BookmarkSnapshot = { data: { a: 1 }, at: 7 };
      sessionStorage.setItem(key, JSON.stringify(snapshot));

      const result = await readBookmarkCacheSession();

      expect(result).toEqual(snapshot);
    });
  });

  /* -------------------- writeBookmarkCacheSession (deprecated) -------------------- */

  describe("writeBookmarkCacheSession (deprecated mirror)", () => {
    it("writes index and snapshot to sessionStorage", async () => {
      const wid = "wid-4" as WorkspaceIdType;
      const data = {
        idx: [{ id: "g1", groupName: "G1" }],
        snap: { data: { foo: "bar" }, at: 100 },
      };

      await writeBookmarkCacheSession(data, wid);

      expect(sessionStorage.getItem(groupsIndexKey(wid))).toEqual(
        JSON.stringify(data.idx)
      );
      expect(sessionStorage.getItem(bookmarksSnapshotKey(wid))).toEqual(
        JSON.stringify(data.snap)
      );
    });

    it("uses DEFAULT_LOCAL_WORKSPACE_ID when no workspaceId is passed", async () => {
      const data = { idx: [], snap: { data: [], at: 1 } };

      await writeBookmarkCacheSession(data);

      expect(
        sessionStorage.getItem(groupsIndexKey(DEFAULT_LOCAL_WORKSPACE_ID))
      ).toEqual(JSON.stringify(data.idx));
      expect(
        sessionStorage.getItem(
          bookmarksSnapshotKey(DEFAULT_LOCAL_WORKSPACE_ID)
        )
      ).toEqual(JSON.stringify(data.snap));
    });

    it("swallows errors from sessionStorage.setItem", async () => {
      const originalSet = sessionStorage.setItem;
      (sessionStorage as any).setItem = () => {
        throw new Error("boom");
      };

      await expect(
        writeBookmarkCacheSession({ idx: [], snap: { data: [], at: 1 } })
      ).resolves.toBeUndefined();

      (sessionStorage as any).setItem = originalSet;
    });
  });

  /* -------------------- clearBookmarkCaches -------------------- */

  describe("clearBookmarkCaches", () => {
    it("removes workspace-scoped caches from localStorage, sessionStorage, and chrome.storage.session", () => {
      const wid = "wid-clear" as WorkspaceIdType;

      localStorage.setItem(groupsIndexKey(wid), "idx");
      localStorage.setItem(bookmarksSnapshotKey(wid), "snap");
      sessionStorage.setItem(groupsIndexKey(wid), "idx-session");
      sessionStorage.setItem(bookmarksSnapshotKey(wid), "snap-session");

      const removeMock = (globalThis as any).chrome.storage.session
        .remove as jest.Mock;

      clearBookmarkCaches(wid);

      expect(localStorage.getItem(groupsIndexKey(wid))).toBeNull();
      expect(localStorage.getItem(bookmarksSnapshotKey(wid))).toBeNull();
      expect(sessionStorage.getItem(groupsIndexKey(wid))).toBeNull();
      expect(sessionStorage.getItem(bookmarksSnapshotKey(wid))).toBeNull();
      expect(removeMock).toHaveBeenCalledWith(`groupsIndex:${wid}`);
    });

    it("uses DEFAULT_LOCAL_WORKSPACE_ID when no workspaceId is provided", () => {
      const wid = DEFAULT_LOCAL_WORKSPACE_ID;

      const removeMock = (globalThis as any).chrome.storage.session
        .remove as jest.Mock;

      clearBookmarkCaches();

      expect(removeMock).toHaveBeenCalledWith(`groupsIndex:${wid}`);
    });

    it("swallows errors from storage remove calls", () => {
      const originalLocalRemove = localStorage.removeItem;
      const originalSessionRemove = sessionStorage.removeItem;
      const chromeRemoveMock = (globalThis as any).chrome.storage.session
        .remove as jest.Mock;

      (localStorage as any).removeItem = () => {
        throw new Error("boom");
      };
      (sessionStorage as any).removeItem = () => {
        throw new Error("boom");
      };
      chromeRemoveMock.mockRejectedValue(new Error("boom"));

      expect(() =>
        clearBookmarkCaches("wid-err" as WorkspaceIdType)
      ).not.toThrow();

      (localStorage as any).removeItem = originalLocalRemove;
      (sessionStorage as any).removeItem = originalSessionRemove;
    });
  });
});