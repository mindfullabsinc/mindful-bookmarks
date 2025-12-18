import {
  importOpenTabsAsSingleGroup,
  importOpenTabsPreserveStructure,
} from "@/scripts/import/importers/tabs"; 

import type { BookmarkGroupType } from "@/core/types/bookmarks";

// ---- Mock utils used by the importer ----
jest.mock("@/core/utils/url", () => ({
  isHttpUrl: jest.fn(),
  normalizeUrl: jest.fn(),
}));

jest.mock("@/core/utils/ids", () => ({
  createUniqueID: jest.fn(),
}));

import { isHttpUrl, normalizeUrl } from "@/core/utils/url";
import { createUniqueID } from "@/core/utils/ids";

type MockTab = Partial<chrome.tabs.Tab> & { url?: string };
type MockWin = Partial<chrome.windows.Window> & { tabs?: chrome.tabs.Tab[] };

// Avoid relying on chrome.windows.GetInfo / GetAllInfo (not present in some typings)
type GetCurrentOpts = { populate?: boolean };
type GetAllOpts = { populate?: boolean };

function makeTab(partial: MockTab): chrome.tabs.Tab {
  return partial as chrome.tabs.Tab;
}

function makeWin(partial: MockWin): chrome.windows.Window {
  return partial as chrome.windows.Window;
}

describe("importOpenTabs (tabs importers)", () => {
  let insertGroups: jest.MockedFunction<(groups: BookmarkGroupType[]) => Promise<void>>;

  // Chrome API mocks
  let tabsQuery: jest.Mock<Promise<chrome.tabs.Tab[]>, [chrome.tabs.QueryInfo]>;
  let windowsGetCurrent: jest.Mock<Promise<chrome.windows.Window>, [GetCurrentOpts]>;
  let windowsGetAll: jest.Mock<Promise<chrome.windows.Window[]>, [GetAllOpts]>;
  let tabGroupsGet: jest.Mock<Promise<chrome.tabGroups.TabGroup>, [number]>;

  beforeEach(() => {
    insertGroups = jest.fn(async (_groups: BookmarkGroupType[]) => {});

    // deterministic IDs
    let n = 0;
    (createUniqueID as jest.Mock).mockImplementation(() => `id-${++n}`);

    // URL helpers default behavior
    (isHttpUrl as jest.Mock).mockImplementation((u: string) => /^https?:\/\//.test(u));
    (normalizeUrl as jest.Mock).mockImplementation((u: string) => u.trim().toLowerCase());

    // Chrome mocks
    tabsQuery = jest.fn<Promise<chrome.tabs.Tab[]>, [chrome.tabs.QueryInfo]>(async (_q) => []);

    windowsGetCurrent = jest.fn<Promise<chrome.windows.Window>, [GetCurrentOpts]>(
      async (_opts) => makeWin({ id: 1, tabs: [] })
    );

    windowsGetAll = jest.fn<Promise<chrome.windows.Window[]>, [GetAllOpts]>(
      async (_opts) => []
    );

    tabGroupsGet = jest.fn<Promise<chrome.tabGroups.TabGroup>, [number]>(
      async (groupId) => ({ id: groupId, title: "Group" } as any)
    );

    (globalThis as any).chrome = {
      tabs: { query: tabsQuery },
      windows: { getCurrent: windowsGetCurrent, getAll: windowsGetAll },
      tabGroups: { get: tabGroupsGet },
    };

    // Stable label for single-group import
    jest.spyOn(Date.prototype, "toLocaleString").mockReturnValue("FAKE_DATE");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  describe("importOpenTabsAsSingleGroup", () => {
    test("queries only currentWindow when scope=current (default)", async () => {
      tabsQuery.mockResolvedValueOnce([]);

      await importOpenTabsAsSingleGroup(insertGroups);

      expect(tabsQuery).toHaveBeenCalledWith({ currentWindow: true });
    });

    test("queries all windows when scope=all", async () => {
      tabsQuery.mockResolvedValueOnce([]);

      await importOpenTabsAsSingleGroup(insertGroups, { scope: "all" });

      expect(tabsQuery).toHaveBeenCalledWith({});
    });

    test("filters non-http URLs, pinned/ discarded (based on opts)", async () => {
      tabsQuery.mockResolvedValueOnce([
        makeTab({ url: "chrome://extensions", title: "Extensions", pinned: false }),
        makeTab({ url: "https://a.com", title: "A", pinned: true }),
        makeTab({ url: "https://b.com", title: "B", pinned: false, discarded: true as any }),
        makeTab({ url: "https://c.com", title: "C", pinned: false }),
      ]);

      await importOpenTabsAsSingleGroup(insertGroups, {
        includePinned: false,
        includeDiscarded: false,
      });

      expect(insertGroups).toHaveBeenCalledTimes(1);
      const groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);

      const g = groups[0];
      expect(g.groupName).toBe("Imported from Open Tabs (FAKE_DATE)");
      expect(g.bookmarks.map((b) => b.url)).toEqual(["https://c.com"]);
    });

    test("dedupes by normalizeUrl across all tabs", async () => {
      // Normalize makes these collide
      (normalizeUrl as jest.Mock).mockImplementation((u: string) =>
        u.replace(/^https?:\/\//, "").toLowerCase()
      );

      tabsQuery.mockResolvedValueOnce([
        makeTab({ url: "https://EXAMPLE.com", title: "One" }),
        makeTab({ url: "http://example.com", title: "Two" }),
        makeTab({ url: "https://example.com", title: "Three" }),
      ]);

      await importOpenTabsAsSingleGroup(insertGroups);

      const groups = insertGroups.mock.calls[0][0];
      expect(groups[0].bookmarks).toHaveLength(1);
      expect(groups[0].bookmarks[0].url).toBe("https://EXAMPLE.com"); // first wins
    });

    test("does not call insertGroups if nothing qualifies", async () => {
      tabsQuery.mockResolvedValueOnce([makeTab({ url: "chrome://newtab" }), makeTab({ url: "file:///tmp/a" })]);

      // Force all to fail
      (isHttpUrl as jest.Mock).mockReturnValue(false);

      await importOpenTabsAsSingleGroup(insertGroups);

      expect(insertGroups).not.toHaveBeenCalled();
    });
  });

  describe("importOpenTabsPreserveStructure", () => {
    test("scope=current uses windows.getCurrent({populate:true})", async () => {
      windowsGetCurrent.mockResolvedValueOnce(makeWin({ id: 1, tabs: [] }));

      await importOpenTabsPreserveStructure(insertGroups, { scope: "current" });

      expect(windowsGetCurrent).toHaveBeenCalledWith({ populate: true });
      expect(windowsGetAll).not.toHaveBeenCalled();
      expect(insertGroups).toHaveBeenCalledWith([]); // always called at end
    });

    test("scope=all uses windows.getAll({populate:true})", async () => {
      windowsGetAll.mockResolvedValueOnce([makeWin({ id: 1, tabs: [] })]);

      await importOpenTabsPreserveStructure(insertGroups, { scope: "all" });

      expect(windowsGetAll).toHaveBeenCalledWith({ populate: true });
      expect(windowsGetCurrent).not.toHaveBeenCalled();
      expect(insertGroups).toHaveBeenCalledWith([]); // always called at end
    });

    test("groups tabs by groupId and includes Ungrouped by default", async () => {
      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [
            makeTab({ index: 2, url: "https://u2.com", groupId: -1, title: "U2" }),
            makeTab({ index: 1, url: "https://g1a.com", groupId: 10, title: "G1A" }),
            makeTab({ index: 0, url: "https://u1.com", groupId: -1, title: "U1" }),
            makeTab({ index: 3, url: "https://g1b.com", groupId: 10, title: "G1B" }),
          ],
        })
      );

      tabGroupsGet.mockResolvedValueOnce({ id: 10, title: "Work" } as any);

      await importOpenTabsPreserveStructure(insertGroups);

      const groups = insertGroups.mock.calls[0][0];
      // Expect two groups: groupId 10 and ungrouped
      expect(groups).toHaveLength(2);

      // Tabs are sorted by index: ungrouped (idx0), group10 (idx1), ungrouped (idx2), group10 (idx3)
      expect(groups[0].groupName).toBe("Tabs / Window 1 / Ungrouped");
      expect(groups[0].bookmarks.map((b) => b.url)).toEqual(["https://u1.com", "https://u2.com"]);

      expect(groups[1].groupName).toBe('Tabs / Window 1 / “Work”');
      expect(groups[1].bookmarks.map((b) => b.url)).toEqual(["https://g1a.com", "https://g1b.com"]);
    });

    test("can exclude ungrouped tabs", async () => {
      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [
            makeTab({ index: 0, url: "https://u1.com", groupId: -1, title: "U1" }),
            makeTab({ index: 1, url: "https://g1.com", groupId: 5, title: "G1" }),
          ],
        })
      );

      tabGroupsGet.mockResolvedValueOnce({ id: 5, title: "X" } as any);

      await importOpenTabsPreserveStructure(insertGroups, { includeUngrouped: false });

      const groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);
      expect(groups[0].groupName).toBe('Tabs / Window 1 / “X”');
    });

    test("filters pinned/discarded similarly to single-group importer", async () => {
      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [
            makeTab({ index: 0, url: "https://a.com", groupId: -1, pinned: true, title: "A" }),
            makeTab({ index: 1, url: "https://b.com", groupId: -1, discarded: true as any, title: "B" }),
            makeTab({ index: 2, url: "https://c.com", groupId: -1, title: "C" }),
          ],
        })
      );

      await importOpenTabsPreserveStructure(insertGroups, {
        includePinned: false,
        includeDiscarded: false,
      });

      const groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);
      expect(groups[0].bookmarks.map((b) => b.url)).toEqual(["https://c.com"]);
    });

    test("tabGroups.get failure falls back to 'Tab group' label", async () => {
      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [makeTab({ index: 0, url: "https://a.com", groupId: 123, title: "A" })],
        })
      );

      tabGroupsGet.mockRejectedValueOnce(new Error("no permission"));

      await importOpenTabsPreserveStructure(insertGroups);

      const groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);
      expect(groups[0].groupName).toBe("Tabs / Window 1 / Tab group");
    });

    test("tabGroups.get with empty/whitespace title becomes 'Unnamed group'", async () => {
      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [makeTab({ index: 0, url: "https://a.com", groupId: 7, title: "A" })],
        })
      );

      tabGroupsGet.mockResolvedValueOnce({ id: 7, title: "   " } as any);

      await importOpenTabsPreserveStructure(insertGroups);

      const groups = insertGroups.mock.calls[0][0];
      expect(groups[0].groupName).toBe("Tabs / Window 1 / Unnamed group");
    });

    test("dedupeWithinGroup=true removes dupes inside each group; false keeps them", async () => {
      (normalizeUrl as jest.Mock).mockImplementation((u: string) => u.toLowerCase());

      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [
            makeTab({ index: 0, url: "https://dup.com", groupId: -1, title: "D1" }),
            makeTab({ index: 1, url: "https://dup.com", groupId: -1, title: "D2" }),
          ],
        })
      );

      await importOpenTabsPreserveStructure(insertGroups, { dedupeWithinGroup: true });

      let groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);
      expect(groups[0].bookmarks).toHaveLength(1);

      insertGroups.mockClear();

      windowsGetCurrent.mockResolvedValueOnce(
        makeWin({
          id: 1,
          tabs: [
            makeTab({ index: 0, url: "https://dup.com", groupId: -1, title: "D1" }),
            makeTab({ index: 1, url: "https://dup.com", groupId: -1, title: "D2" }),
          ],
        })
      );

      await importOpenTabsPreserveStructure(insertGroups, { dedupeWithinGroup: false });

      groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(1);
      expect(groups[0].bookmarks).toHaveLength(2);
      expect(groups[0].bookmarks.map((b) => b.name)).toEqual(["D1", "D2"]);
    });

    test("multiple windows increments Window index in groupName", async () => {
      windowsGetAll.mockResolvedValueOnce([
        makeWin({
          id: 1,
          tabs: [makeTab({ index: 0, url: "https://w1.com", groupId: -1, title: "W1" })],
        }),
        makeWin({
          id: 2,
          tabs: [makeTab({ index: 0, url: "https://w2.com", groupId: -1, title: "W2" })],
        }),
      ]);

      await importOpenTabsPreserveStructure(insertGroups, { scope: "all" });

      const groups = insertGroups.mock.calls[0][0];
      expect(groups).toHaveLength(2);
      expect(groups[0].groupName).toBe("Tabs / Window 1 / Ungrouped");
      expect(groups[1].groupName).toBe("Tabs / Window 2 / Ungrouped");
    });
  });
});