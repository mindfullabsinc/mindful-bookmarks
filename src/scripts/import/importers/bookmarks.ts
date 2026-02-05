/* -------------------- Imports -------------------- */
/* Types */
import type { ChromeBmNode } from "@/core/types/import"; 
import type { BookmarkType, BookmarkGroupType } from "@/core/types/bookmarks";

/* Utils */
import { normalizeUrl, isHttpUrl } from "@/core/utils/url";
import { createUniqueID } from "@/core/utils/ids";
/* ---------------------------------------------------------- */


/**
 * Convert a Chrome bookmark node to the app's bookmark shape.
 *
 * @param n Chrome bookmark node.
 * @returns AppBookmark ready for insertion.
 */
function toAppBookmark(n: ChromeBmNode): BookmarkType {
  return {
    id: createUniqueID(),
    name: n.title || n.url || "Untitled",
    url: n.url!,
    dateAdded: n.dateAdded,
  };
}

/**
 * Depth-first traversal helper that calls onBookmark for each leaf bookmark node.
 *
 * @param nodes Tree nodes to traverse.
 * @param onBookmark Callback invoked for each bookmark node.
 */
function walkBookmarks(
  nodes: ChromeBmNode[],
  onBookmark: (bm: ChromeBmNode) => void
): void {
  for (const n of nodes) {
    if (n.url) onBookmark(n);
    else if (n.children) walkBookmarks(n.children, onBookmark);
  }
}

/**
 * Flatten all Chrome bookmarks into a single group and insert it via the provided callback.
 *
 * @param insertGroups Callback that persists the resulting groups.
 */
export async function importChromeBookmarksAsSingleGroup(
  insertGroups: (groups: BookmarkGroupType[]) => Promise<void>
): Promise<void> {
  const tree = await chrome.bookmarks.getTree();

  const seen = new Set<string>();
  const bookmarks: BookmarkType[] = [];

  walkBookmarks(tree, (bm) => {
    if (!bm.url || !isHttpUrl(bm.url)) return;

    const key = normalizeUrl(bm.url);
    if (seen.has(key)) return;
    seen.add(key);

    bookmarks.push(toAppBookmark(bm));
  });

  if (bookmarks.length === 0) {
    await insertGroups([]);
    return;
  }

  await insertGroups([
    {
      id: createUniqueID(),
      groupName: "Imported from Chrome",
      bookmarks,
    },
  ]);
}

/**
 * Import Chrome bookmarks while preserving folder structure as separate groups. Groups remain flat, but names reflect the folder path.
 *
 * @param insertGroups Callback invoked with groups to save.
 * @param opts Options controlling depth, leaf/parent inclusion, dedupe behavior, etc.
 */
export async function importChromeBookmarksPreserveStructure(
  insertGroups: (groups: BookmarkGroupType[]) => Promise<void>,
  opts?: {
    maxDepth?: number;
    onlyLeafFolders?: boolean;
    minItemsPerFolder?: number;
    includeRootFolders?: boolean; // include Bookmarks Bar / Other Bookmarks etc
    includeParentFolderBookmarks?: boolean; 
  }
): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const {
    maxDepth = 8,
    onlyLeafFolders = false,
    minItemsPerFolder = 1,
    includeRootFolders = false,
    includeParentFolderBookmarks = true,
  } = opts ?? {};

  const groups: BookmarkGroupType[] = [];

  function walkFolder(node: ChromeBmNode, path: string[], depth: number) {
    if (depth > maxDepth) return;
    if (!node.children) return;

    const isFolder = !node.url;
    if (!isFolder) return;

    const title = (node.title || "Bookmarks").trim();
    const nextPath = [...path, title];

    const childFolders = node.children.filter((c) => !c.url);
    const childBookmarks = node.children.filter((c) => !!c.url);

    const isLeaf = childFolders.length === 0;
    const hasDirectBookmarks = childBookmarks.length > 0;

    // Create a group if:
    // - folder has direct bookmarks AND
    // - (we're not leaf-only) OR (it's a leaf) OR (it's a parent but we want parent bookmarks)
    const shouldCreateGroup =
      hasDirectBookmarks &&
      (
        !onlyLeafFolders ||
        isLeaf ||
        includeParentFolderBookmarks
      );

    if (shouldCreateGroup) {
      const seenInFolder = new Set<string>();
      const bookmarks: BookmarkType[] = [];

      for (const bm of childBookmarks) {
        if (!bm.url || !isHttpUrl(bm.url)) continue;

        const key = normalizeUrl(bm.url);
        if (seenInFolder.has(key)) continue;
        seenInFolder.add(key);

        bookmarks.push(toAppBookmark(bm));
      }

      if (bookmarks.length >= minItemsPerFolder) {
        const pathLabel = nextPath.filter(Boolean).join(" / ");
        const groupName = includeRootFolders
          ? `Bookmarks / ${pathLabel}`
          : `Bookmarks / ${nextPath.slice(1).join(" / ")}`;

        groups.push({
          id: node.id ?? createUniqueID(),
          groupName,
          bookmarks,
        });
      }
    }

    for (const child of childFolders) walkFolder(child, nextPath, depth + 1);
  }

  for (const root of tree) walkFolder(root, [], 0);

  await insertGroups(groups);
}
