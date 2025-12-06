import { nanoid } from "nanoid";

import { BrowserSourceService } from "@/scripts/import/smartImport";
import { RawItem } from "@shared/types/llmGrouping";


/**
 * Chrome-specific implementation of the BrowserSourceService that gathers bookmarks, tabs, and history.
 */
export const chromeBrowserSourceService: BrowserSourceService = {
  /**
   * Collects bookmark items from the chrome.bookmarks API.
   *
   * @returns Promise resolving to RawItems sourced from bookmarks.
   */
  async collectBookmarks(): Promise<RawItem[]> {
    if (!chrome.bookmarks || typeof chrome.bookmarks.getTree !== "function") {
      console.warn("[SmartImport] chrome.bookmarks API not available; skipping bookmarks import");
      return [];
    }

    const tree = await chrome.bookmarks.getTree();
    const items: RawItem[] = [];

    const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of nodes) {
        if (node.url) {
          items.push({
            id: node.id,
            name: node.title || node.url,
            url: node.url,
            source: "bookmarks",
          });
        }
        if (node.children) walk(node.children);
      }
    };

    walk(tree);
    return items;
  },

  /**
   * Collects currently open tabs via chrome.tabs.query.
   */
  async collectTabs(): Promise<RawItem[]> {
    if (!chrome.tabs || typeof chrome.tabs.query !== "function") {
      console.warn("[SmartImport] chrome.tabs API not available; skipping tabs import");
      return [];
    }

    const tabs = await chrome.tabs.query({});
    return tabs
      .filter((t) => t.url)
      .map((t) => ({
        id: String(t.id ?? nanoid()),
        name: t.title ?? t.url!,
        url: t.url!,
        source: "tabs",
      }));
  },

  /**
   * Collects browsing history entries via chrome.history.search.
   *
   * @param limit Maximum number of history entries to fetch.
   */
  async collectHistory(limit = 300): Promise<RawItem[]> {
    if (!chrome.history || typeof chrome.history.search !== "function") {
      console.warn("[SmartImport] chrome.history API not available; skipping history import");
      return [];
    }

    const results = await chrome.history.search({
      text: "",
      maxResults: limit,
      startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // last 30 days
    });

    return results.map((h) => ({
      id: h.id ?? nanoid(),
      name: h.title?? h.url!,
      url: h.url!,
      source: "history",
      lastVisitedAt: h.lastVisitTime ?? undefined,
    }));
  },
};
