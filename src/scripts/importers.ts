/* -------------------- Imports -------------------- */
/* Types */
import { type OpenTabsScopeType } from '@/core/types/import'
/* ---------------------------------------------------------- */

/* -------------------- Local types / interfaces -------------------- */
type ChromeBmNode = chrome.bookmarks.BookmarkTreeNode;

type AppBookmark = {
  id: string;
  name: string;
  url: string;
  faviconUrl?: string;
  dateAdded?: number;
};

type AppGroup = {
  id: string;
  groupName: string;
  bookmarks: AppBookmark[];
}/* ---------------------------------------------------------- */
;

// --- Helpers ---
/**
 * Normalize URLs for duplicate detection by stripping fragments and reserializing.
 *
 * @param u Raw URL string to normalize.
 * @returns Normalized URL or original input when parsing fails.
 */
function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = ''; // ignore fragments for de-dupe
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * Convert a Chrome bookmark node into the app's bookmark shape.
 *
 * @param n Chrome bookmark node.
 * @returns Converted application bookmark.
 */
function toAppBookmark(n: ChromeBmNode): AppBookmark {
  return {
    id: String(Date.now() + Math.random()),
    name: n.title || n.url || 'Untitled',
    url: n.url!,
    dateAdded: n.dateAdded,
  };
}

/**
 * Depth-first traversal helper that visits every bookmark node.
 *
 * @param nodes Current bookmark subtree.
 * @param onBookmark Callback invoked for each bookmark entry.
 */
function walk(
  nodes: ChromeBmNode[],
  onBookmark: (bm: ChromeBmNode) => void
): void {
  for (const n of nodes) {
    if (n.url) onBookmark(n);
    else if (n.children) walk(n.children, onBookmark);
  }
}

/**
 * Aggregate all Chrome bookmarks into a single group and pass them to the provided inserter.
 *
 * @param insertGroups Callback that receives the generated group(s) to insert into app state.
 */
export async function importChromeBookmarksAsSingleGroup(
  insertGroups: (groups: AppGroup[]) => Promise<void>
): Promise<void> {
  // Modal already asked for permissions; assume we have them.
  const tree = await chrome.bookmarks.getTree();

  // collect + de-dupe http(s)
  const seen = new Set<string>();
  const bookmarks: AppBookmark[] = [];

  walk(tree, (bm) => {
    if (!/^https?:\/\//i.test(bm.url!)) return;
    const key = normalizeUrl(bm.url!);
    if (seen.has(key)) return;
    seen.add(key);
    bookmarks.push(toAppBookmark(bm));
  });

  if (bookmarks.length === 0) {
    await insertGroups([]); // no-op but keeps contract simple
    return;
  }

  const group: AppGroup = {
    id: String(Date.now() + Math.random()),
    groupName: 'Imported from Chrome',
    bookmarks,
  };

  await insertGroups([group]);
}

/**
 * Capture open browser tabs as a single bookmark group.
 *
 * @param insertGroups Callback that receives the generated group for persistence.
 * @param opts Optional filters controlling which tabs are included.
 */
export async function importOpenTabsAsSingleGroup(
  insertGroups: (groups: AppGroup[]) => Promise<void>,
  opts?: { scope?: OpenTabsScopeType; includePinned?: boolean; includeDiscarded?: boolean }
): Promise<void> {
  const { scope = 'current', includePinned = true, includeDiscarded = true } = opts ?? {};

  const q: chrome.tabs.QueryInfo = scope === 'current' ? { currentWindow: true } : {};
  const tabs = await chrome.tabs.query(q);

  const seen = new Set<string>();
  const bookmarks: AppBookmark[] = [];
  for (const t of tabs) {
    const u = t.url || '';
    if (!/^https?:\/\//i.test(u)) continue;                    // skip chrome://, file://, etc.
    if (!includePinned && t.pinned) continue;
    // @ts-ignore (MV3 tabs has 'discarded' in modern Chrome)
    if (!includeDiscarded && t.discarded) continue;

    const key = normalizeUrl(u);
    if (seen.has(key)) continue;
    seen.add(key);

    bookmarks.push({
      id: String(Date.now() + Math.random()),
      name: t.title || u,
      url: u,
      faviconUrl: t.favIconUrl || undefined,
      // dateAdded: undefined (not available for tabs)
    });
  }

  if (bookmarks.length === 0) return;

  const label = new Date().toLocaleString();
  const group: AppGroup = {
    id: String(Date.now() + Math.random()),
    groupName: `Imported from Open Tabs (${label})`,
    bookmarks,
  };

  await insertGroups([group]);
}
