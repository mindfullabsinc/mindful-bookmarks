import {
  importChromeBookmarksAsSingleGroup,
  importChromeBookmarksPreserveStructure,
} from "@/scripts/import/importers/bookmarks"; 

import { normalizeUrl, isHttpUrl } from "@/core/utils/url";
import { createUniqueID } from "@/core/utils/ids";

jest.mock("@/core/utils/url", () => ({
  normalizeUrl: jest.fn((u: string) => u),
  isHttpUrl: jest.fn((u: string) => u.startsWith("http://") || u.startsWith("https://")),
}));

jest.mock("@/core/utils/ids", () => ({
  createUniqueID: jest.fn(),
}));

type ChromeBmNode = {
  id?: string;
  title?: string;
  url?: string;
  dateAdded?: number;
  children?: ChromeBmNode[];
};

function bm(opts: Partial<ChromeBmNode>): ChromeBmNode {
  return {
    id: opts.id,
    title: opts.title ?? "",
    url: opts.url,
    dateAdded: opts.dateAdded ?? 123,
    children: opts.children,
  };
}

describe("importChromeBookmarks", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Deterministic IDs for snapshots/asserts
    let i = 0;
    (createUniqueID as jest.Mock).mockImplementation(() => `uid_${++i}`);

    // Provide a chrome.bookmarks.getTree mock
    (global as any).chrome = {
      bookmarks: {
        getTree: jest.fn(),
      },
    };
  });

  describe("importChromeBookmarksAsSingleGroup", () => {
    it("inserts [] when there are no http(s) bookmarks", async () => {
      (global as any).chrome.bookmarks.getTree.mockResolvedValue([
        bm({
          title: "Root",
          children: [
            bm({ title: "Folder", children: [bm({ title: "No URL" })] }),
            bm({ title: "ftp", url: "ftp://example.com" }),
          ],
        }),
      ]);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksAsSingleGroup(insertGroups);

      expect(isHttpUrl).toHaveBeenCalledWith("ftp://example.com");
      expect(insertGroups).toHaveBeenCalledTimes(1);
      expect(insertGroups).toHaveBeenCalledWith([]);
    });

    it("flattens all bookmarks into one group, filters non-http(s), and de-dupes globally by normalizeUrl", async () => {
      (normalizeUrl as jest.Mock).mockImplementation((u: string) =>
        // normalize to lowercase for test purposes
        u.toLowerCase()
      );

      (global as any).chrome.bookmarks.getTree.mockResolvedValue([
        bm({
          title: "Root",
          children: [
            bm({
              title: "Folder A",
              children: [
                bm({ title: "Example", url: "https://example.com" }),
                bm({ title: "Duplicate different case", url: "https://EXAMPLE.com" }),
                bm({ title: "Not http", url: "chrome://extensions" }),
              ],
            }),
            bm({
              title: "Folder B",
              children: [
                bm({ title: "Another", url: "http://another.com/path" }),
                bm({ title: "No title uses url", url: "https://title-fallback.com" }),
              ],
            }),
          ],
        }),
      ]);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksAsSingleGroup(insertGroups);

      expect(insertGroups).toHaveBeenCalledTimes(1);

      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toHaveLength(1);

      const [group] = groupsArg;
      expect(group.groupName).toBe("Imported from Chrome");
      expect(group.id).toBe("uid_4"); // 3 bookmarks => uid_1..uid_3, then group id uid_4

      // Should include 3 unique http(s) bookmarks:
      // - https://example.com (deduped)
      // - http://another.com/path
      // - https://title-fallback.com
      expect(group.bookmarks).toHaveLength(3);

      expect(group.bookmarks.map((b: any) => b.url)).toEqual([
        "https://example.com",
        "http://another.com/path",
        "https://title-fallback.com",
      ]);

      // Name fallback behavior
      expect(group.bookmarks[2].name).toBe("No title uses url");

      // ensure normalizeUrl was used (for de-dupe)
      expect(normalizeUrl).toHaveBeenCalledWith("https://example.com");
      expect(normalizeUrl).toHaveBeenCalledWith("https://EXAMPLE.com");
    });
  });

  describe("importChromeBookmarksPreserveStructure", () => {
    it("creates one group per folder path; de-dupes within a folder; includes parent folder bookmarks by default", async () => {
      (normalizeUrl as jest.Mock).mockImplementation((u: string) => u.toLowerCase());

      // Root -> Bookmarks Bar -> Projects (has direct bookmarks + child folder)
      // Also include duplicates within the same folder; duplicates across folders should be allowed.
      const tree: ChromeBmNode[] = [
        bm({
          title: "Bookmarks Bar",
          children: [
            bm({
              id: "folder_projects",
              title: "Projects",
              children: [
                bm({ title: "A", url: "https://example.com" }),
                bm({ title: "A dup", url: "https://EXAMPLE.com" }), // dup in same folder
                bm({ title: "B", url: "http://b.com" }),
                bm({
                  id: "folder_child",
                  title: "Child",
                  children: [
                    bm({ title: "A again (allowed across folders)", url: "https://example.com" }),
                    bm({ title: "C", url: "https://c.com" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      (global as any).chrome.bookmarks.getTree.mockResolvedValue(tree);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksPreserveStructure(insertGroups, {
        includeRootFolders: false,
        onlyLeafFolders: false, // allow parent groups
        includeParentFolderBookmarks: true, // default, but explicit for clarity
      });

      expect(insertGroups).toHaveBeenCalledTimes(1);
      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toHaveLength(2);

      const projects = groupsArg.find((g: any) => g.id === "folder_projects");
      const child = groupsArg.find((g: any) => g.id === "folder_child");

      expect(projects.groupName).toBe("Bookmarks / Projects");
      expect(projects.bookmarks.map((b: any) => b.url)).toEqual([
        "https://example.com",
        "http://b.com",
      ]);

      expect(child.groupName).toBe("Bookmarks / Projects / Child");
      expect(child.bookmarks.map((b: any) => b.url)).toEqual([
        "https://example.com",
        "https://c.com",
      ]);
    });

    it("when onlyLeafFolders=true and includeParentFolderBookmarks=false, skips parent folders with direct bookmarks (only leaf folders get groups)", async () => {
      const tree: ChromeBmNode[] = [
        bm({
          title: "Bookmarks Bar",
          children: [
            bm({
              id: "parent",
              title: "Parent",
              children: [
                bm({ title: "Direct", url: "https://direct.com" }),
                bm({
                  id: "leaf",
                  title: "Leaf",
                  children: [bm({ title: "Leaf link", url: "https://leaf.com" })],
                }),
              ],
            }),
          ],
        }),
      ];

      (global as any).chrome.bookmarks.getTree.mockResolvedValue(tree);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksPreserveStructure(insertGroups, {
        onlyLeafFolders: true,
        includeParentFolderBookmarks: false,
      });

      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toHaveLength(1);
      expect(groupsArg[0].id).toBe("leaf");
      expect(groupsArg[0].groupName).toBe("Bookmarks / Parent / Leaf");
    });

    it("when includeRootFolders=true, prefixes full path from the root folder title", async () => {
      const tree: ChromeBmNode[] = [
        bm({
          title: "Bookmarks Bar",
          children: [
            bm({
              id: "f1",
              title: "Folder",
              children: [bm({ title: "X", url: "https://x.com" })],
            }),
          ],
        }),
      ];

      (global as any).chrome.bookmarks.getTree.mockResolvedValue(tree);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksPreserveStructure(insertGroups, {
        includeRootFolders: true,
      });

      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toHaveLength(1);
      expect(groupsArg[0].groupName).toBe("Bookmarks / Bookmarks Bar / Folder");
    });

    it("respects minItemsPerFolder (after filtering + per-folder dedupe)", async () => {
      (normalizeUrl as jest.Mock).mockImplementation((u: string) => u.toLowerCase());

      const tree: ChromeBmNode[] = [
        bm({
          title: "Bookmarks Bar",
          children: [
            bm({
              id: "few",
              title: "Few",
              children: [
                bm({ title: "A", url: "https://a.com" }),
                bm({ title: "A dup", url: "https://A.com" }), // dedup -> only 1 unique
              ],
            }),
            bm({
              id: "enough",
              title: "Enough",
              children: [
                bm({ title: "A", url: "https://a.com" }),
                bm({ title: "B", url: "https://b.com" }),
              ],
            }),
          ],
        }),
      ];

      (global as any).chrome.bookmarks.getTree.mockResolvedValue(tree);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      await importChromeBookmarksPreserveStructure(insertGroups, {
        minItemsPerFolder: 2,
      });

      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toHaveLength(1);
      expect(groupsArg[0].id).toBe("enough");
    });

    it("respects maxDepth (depth > maxDepth is not traversed)", async () => {
      const tree: ChromeBmNode[] = [
        bm({
          title: "Bookmarks Bar",
          children: [
            bm({
              id: "lvl1",
              title: "L1",
              children: [
                bm({
                  id: "lvl2",
                  title: "L2",
                  children: [
                    bm({
                      id: "lvl3",
                      title: "L3",
                      children: [bm({ title: "Deep", url: "https://deep.com" })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      (global as any).chrome.bookmarks.getTree.mockResolvedValue(tree);

      const insertGroups = jest.fn().mockResolvedValue(undefined);

      // With maxDepth=1:
      // - root "Bookmarks Bar" walked at depth 0
      // - "L1" walked at depth 1
      // - "L2" would be depth 2 => skipped, so "L3" group never created
      await importChromeBookmarksPreserveStructure(insertGroups, {
        maxDepth: 1,
      });

      const groupsArg = insertGroups.mock.calls[0][0];
      expect(groupsArg).toEqual([]); // no folder at depth<=1 has direct bookmarks
    });
  });
});