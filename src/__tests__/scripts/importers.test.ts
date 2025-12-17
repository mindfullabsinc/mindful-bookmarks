
/* -------------------- Imports -------------------- */
import { importChromeBookmarksAsSingleGroup, importOpenTabsAsSingleGroup } from '@/scripts/import/importers';
/* ---------------------------------------------------------- */

export {}; // ensure this file is a module so our globals don't merge with lib.d.ts

describe('scripts/importers', () => {
  const FIXED_NOW = 1_700_000_000_000; // deterministic Date.now()
  const FIXED_RAND = 0.123456;         // deterministic Math.random()

  let insertGroups: jest.Mock;

  beforeAll(() => {
    jest.useFakeTimers();
  });

   beforeEach(() => {
    // Deterministic IDs and timestamps inside the importers
    jest.setSystemTime(new Date(FIXED_NOW));
    jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    jest.spyOn(Math, "random").mockReturnValue(FIXED_RAND);

    insertGroups = jest.fn().mockResolvedValue(undefined); 

    // Fresh chrome mock each test; cast via globalThis as any to bypass full Chrome typing
    (globalThis as any).chrome = {
      bookmarks: {
        getTree: jest.fn(), 
      },
      permissions: {
        contains: jest.fn(),
        request: jest.fn(),
      },
      tabs: {
        query: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up to avoid leaking across tests
    delete (globalThis as any).chrome;
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const makeId = () => String(FIXED_NOW + FIXED_RAND);

  describe('importChromeBookmarksAsSingleGroup', () => {
    test('walks the tree, filters non-http(s), de-dupes (ignores #hash), and inserts 1 group', async () => {
      // Tree:
      // - root
      //   - folder A
      //     - http bookmark (dupe with hash variant)
      //     - non-http (chrome://...) -> skipped
      //   - folder B
      //     - https bookmark (same as first but with #section -> should be de-duped)
      //     - https bookmark (unique)
      const tree = [
        {
          title: 'root',
          children: [
            {
              title: 'A',
              children: [
                { title: 'Example', url: 'http://example.com', dateAdded: 111 },
                { title: 'Chrome Settings', url: 'chrome://settings', dateAdded: 222 },
              ],
            },
            {
              title: 'B',
              children: [
                { title: 'Example with hash', url: 'http://example.com#section', dateAdded: 333 },
                { title: 'Unique', url: 'https://unique.test/page', dateAdded: 444 },
              ],
            },
          ],
        },
      ];

      (chrome.bookmarks.getTree as jest.Mock).mockResolvedValue(tree);

      await importChromeBookmarksAsSingleGroup(insertGroups);

      expect(chrome.bookmarks.getTree).toHaveBeenCalledTimes(1);
      expect(insertGroups).toHaveBeenCalledTimes(1);

      const arg = (insertGroups.mock.calls[0][0] as any[])[0];
      expect(arg).toMatchObject({
        id: makeId(),
        groupName: 'Imported from Chrome',
      });

      // Expect only 2 bookmarks (hash de-duped, non-http skipped)
      expect(arg.bookmarks).toHaveLength(2);

      // Verify structure of first bookmark
      expect(arg.bookmarks[0]).toMatchObject({
        id: makeId(),
        name: 'Example',
        url: 'http://example.com',
        dateAdded: 111,
      });

      // Second should be the unique https one
      expect(arg.bookmarks[1]).toMatchObject({
        id: makeId(),
        name: 'Unique',
        url: 'https://unique.test/page',
        dateAdded: 444,
      });
    });

    test('when no http(s) bookmarks are found, calls insertGroups with [] (no-op group insert)', async () => {
      const tree = [
        {
          title: 'root',
          children: [
            { title: 'sys', children: [{ title: 'Settings', url: 'chrome://settings' }] },
          ],
        },
      ];
      (chrome.bookmarks.getTree as jest.Mock).mockResolvedValue(tree);

      await importChromeBookmarksAsSingleGroup(insertGroups);

      expect(chrome.bookmarks.getTree).toHaveBeenCalled();
      expect(insertGroups).toHaveBeenCalledTimes(1);
      expect(insertGroups).toHaveBeenCalledWith([]); // contract: explicit empty
    });
  });

  describe('importOpenTabsAsSingleGroup', () => {
    test('requests tabs permission if missing, filters pinned/discarded/non-http, de-dupes, inserts 1 group', async () => {
      (chrome.permissions.contains as jest.Mock).mockResolvedValue(false);
      (chrome.permissions.request as jest.Mock).mockResolvedValue(true);

      const tabs = [
        // kept: http, not pinned, not discarded
        { url: 'http://a.test', title: 'A', pinned: false, favIconUrl: 'https://a.ico' },
        // skipped: duplicate by normalized URL (hash)
        { url: 'http://a.test#frag', title: 'A dup', pinned: false, favIconUrl: 'https://a.ico' },
        // skipped: non-http
        { url: 'chrome://extensions', title: 'chrome', pinned: false },
        // skipped by includePinned=false
        { url: 'https://pinned.test', title: 'Pinned', pinned: true, favIconUrl: 'https://p.ico' },
        // skipped by includeDiscarded=false (present in MV3)
        { url: 'https://discarded.test', title: 'Discarded', pinned: false, discarded: true },
        // kept: another unique
        { url: 'https://b.test/page', title: 'B', pinned: false, favIconUrl: 'https://b.ico' },
      ];

      (chrome.tabs.query as jest.Mock).mockResolvedValue(tabs);

      await importOpenTabsAsSingleGroup(insertGroups, {
        scope: 'all',
        includePinned: false,
        includeDiscarded: false,
      });

      expect(chrome.permissions.contains).toHaveBeenCalledWith({
        permissions: ['tabs'],
        origins: ['<all_urls>'],
      });
      expect(chrome.permissions.request).toHaveBeenCalledWith({
        permissions: ['tabs'],
        origins: ['<all_urls>'],
      });
      expect(chrome.tabs.query).toHaveBeenCalledWith({}); // scope 'all'

      expect(insertGroups).toHaveBeenCalledTimes(1);
      const group = insertGroups.mock.calls[0][0][0];

      expect(group.id).toBe(makeId());
      expect(group.groupName).toMatch(/^Imported from Open Tabs \(.+\)$/);

      // Expect only the two kept
      expect(group.bookmarks).toHaveLength(2);

      expect(group.bookmarks[0]).toMatchObject({
        id: makeId(),
        name: 'A',
        url: 'http://a.test',
        faviconUrl: 'https://a.ico',
      });

      expect(group.bookmarks[1]).toMatchObject({
        id: makeId(),
        name: 'B',
        url: 'https://b.test/page',
        faviconUrl: 'https://b.ico',
      });
    });

    test('does not request permission if already granted', async () => {
      (chrome.permissions.contains as jest.Mock).mockResolvedValue(true);
      (chrome.tabs.query as jest.Mock).mockResolvedValue([
        { url: 'https://x.test', title: 'X', pinned: false },
      ]);

      await importOpenTabsAsSingleGroup(insertGroups);

      expect(chrome.permissions.request).not.toHaveBeenCalled();
      expect(chrome.tabs.query).toHaveBeenCalledWith({ currentWindow: true }); // default scope 'current'
      expect(insertGroups).toHaveBeenCalledTimes(1);
    });

    test('throws if permission request is denied', async () => {
      (chrome.permissions.contains as jest.Mock).mockResolvedValue(false);
      (chrome.permissions.request as jest.Mock).mockResolvedValue(false);

      await expect(
        importOpenTabsAsSingleGroup(insertGroups)
      ).rejects.toThrow(/Permission to read open tabs was not granted/);

      expect(insertGroups).not.toHaveBeenCalled();
    });

    test('returns early (no insert) when no http(s) tabs found', async () => {
      (chrome.permissions.contains as jest.Mock).mockResolvedValue(true);
      (chrome.tabs.query as jest.Mock).mockResolvedValue([
        { url: 'chrome://newtab', title: 'ntp', pinned: false },
        { url: 'about:blank', title: 'blank', pinned: false },
      ]);

      await importOpenTabsAsSingleGroup(insertGroups, { scope: 'all' });

      expect(insertGroups).not.toHaveBeenCalled();
    });
  });
});
