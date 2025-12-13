import { chromeBrowserSourceService } from "@/scripts/import/browserSourceServiceChrome";
import { nanoid } from "nanoid";
import { ImportSource } from "@/core/constants/import";

jest.mock("nanoid", () => ({
  nanoid: jest.fn(() => "mock-nanoid"),
}));

// Type helper so TS doesn't complain about global chrome
type ChromeLike = {
  bookmarks?: {
    getTree?: jest.Mock;
  };
  tabs?: {
    query?: jest.Mock;
  };
  history?: {
    search?: jest.Mock;
  };
};

declare const global: any;

describe("chromeBrowserSourceService", () => {
  let originalChrome: any;
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(() => {
    originalChrome = global.chrome;
  });

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (global as any).chrome = {} as ChromeLike;
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  afterAll(() => {
    global.chrome = originalChrome;
  });

  describe("collectBookmarks", () => {
    it("returns empty array and logs a warning when chrome.bookmarks API is unavailable", async () => {
      // chrome.bookmarks is missing
      (global as any).chrome = {};

      const result = await chromeBrowserSourceService.collectBookmarks();

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SmartImport] chrome.bookmarks API not available; skipping bookmarks import"
      );
    });

    it("walks the bookmark tree and returns only nodes with URLs", async () => {
      const getTreeMock = jest.fn().mockResolvedValue([
        {
          id: "1",
          title: "Bookmarks Bar",
          children: [
            {
              id: "2",
              title: "Folder",
              children: [
                {
                  id: "3",
                  title: "Mindful",
                  url: "https://mindfulbookmarks.com",
                },
                {
                  id: "4",
                  // No URL -> should be skipped
                  title: "No URL node",
                },
              ],
            },
          ],
        },
      ]);

      (global as any).chrome = {
        bookmarks: {
          getTree: getTreeMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectBookmarks();

      expect(getTreeMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        {
          id: "3",
          name: "Mindful",
          url: "https://mindfulbookmarks.com",
          source: ImportSource.Bookmarks,
        },
      ]);
    });

    it("uses URL as name when bookmark title is missing", async () => {
      const getTreeMock = jest.fn().mockResolvedValue([
        {
          id: "1",
          children: [
            {
              id: "2",
              title: "",
              url: "https://example.com",
            },
          ],
        },
      ]);

      (global as any).chrome = {
        bookmarks: {
          getTree: getTreeMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectBookmarks();

      expect(result).toEqual([
        {
          id: "2",
          name: "https://example.com",
          url: "https://example.com",
          source: ImportSource.Bookmarks,
        },
      ]);
    });
  });

  describe("collectTabs", () => {
    it("returns empty array and logs a warning when chrome.tabs API is unavailable", async () => {
      (global as any).chrome = {};

      const result = await chromeBrowserSourceService.collectTabs();

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SmartImport] chrome.tabs API not available; skipping tabs import"
      );
    });

    it("maps tabs with URLs to RawItems and filters out tabs without URLs", async () => {
      const queryMock = jest.fn().mockResolvedValue([
        {
          id: 123,
          title: "Mindful",
          url: "https://mindfulbookmarks.com",
        },
        {
          id: 456,
          title: "No URL tab",
          url: undefined,
        },
      ]);

      (global as any).chrome = {
        tabs: {
          query: queryMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectTabs();

      expect(queryMock).toHaveBeenCalledWith({});
      expect(result).toEqual([
        {
          id: "123",
          name: "Mindful",
          url: "https://mindfulbookmarks.com",
          source: ImportSource.Tabs,
        },
      ]);
    });

    it("falls back to nanoid when tab.id is undefined", async () => {
      const queryMock = jest.fn().mockResolvedValue([
        {
          id: undefined,
          title: "Generated ID tab",
          url: "https://example.com",
        },
      ]);

      (global as any).chrome = {
        tabs: {
          query: queryMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectTabs();

      expect(nanoid).toHaveBeenCalled();
      expect(result).toEqual([
        {
          id: "mock-nanoid",
          name: "Generated ID tab",
          url: "https://example.com",
          source: ImportSource.Tabs,
        },
      ]);
    });

    it("uses URL as name when tab title is missing", async () => {
      const queryMock = jest.fn().mockResolvedValue([
        {
          id: 789,
          title: undefined,
          url: "https://no-title.com",
        },
      ]);

      (global as any).chrome = {
        tabs: {
          query: queryMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectTabs();

      expect(result).toEqual([
        {
          id: "789",
          name: "https://no-title.com",
          url: "https://no-title.com",
          source: ImportSource.Tabs,
        },
      ]);
    });
  });

  describe("collectHistory", () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it("returns empty array and logs a warning when chrome.history API is unavailable", async () => {
      (global as any).chrome = {};

      const result = await chromeBrowserSourceService.collectHistory();

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SmartImport] chrome.history API not available; skipping history import"
      );
    });

    it("queries history with default limit and last 30 days window, mapping to RawItems", async () => {
      const now = new Date("2025-01-01T00:00:00.000Z").getTime();
      jest.setSystemTime(now);

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const searchMock = jest.fn().mockResolvedValue([
        {
          id: "hist-1",
          title: "Example",
          url: "https://example.com",
          lastVisitTime: now - 1_000,
        },
        {
          id: undefined,
          title: undefined,
          url: "https://no-title.com",
          lastVisitTime: undefined,
        },
      ]);

      (global as any).chrome = {
        history: {
          search: searchMock,
        },
      } as ChromeLike;

      const result = await chromeBrowserSourceService.collectHistory();

      expect(searchMock).toHaveBeenCalledWith({
        text: "",
        maxResults: 300,
        startTime: now - thirtyDaysMs,
      });

      expect(nanoid).toHaveBeenCalled(); // for the item with no id

      expect(result).toEqual([
        {
          id: "hist-1",
          name: "Example",
          url: "https://example.com",
          source: ImportSource.History,
          lastVisitedAt: now - 1_000,
        },
        {
          id: "mock-nanoid",
          name: "https://no-title.com",
          url: "https://no-title.com",
          source: ImportSource.History,
          lastVisitedAt: undefined,
        },
      ]);
    });

    it("respects a custom limit parameter", async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      const searchMock = jest.fn().mockResolvedValue([]);

      (global as any).chrome = {
        history: {
          search: searchMock,
        },
      } as ChromeLike;

      await chromeBrowserSourceService.collectHistory(10);

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 10,
        })
      );
    });
  });
});