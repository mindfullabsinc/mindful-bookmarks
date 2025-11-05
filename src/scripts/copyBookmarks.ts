import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkGroupType, BookmarkType } from "@/core/types/bookmarks";
import { getAdapter } from "@/scripts/storageAdapters";
import { StorageMode } from "@/core/constants/storageMode";
import { normalizeUrl } from "@/core/utils/utilities";

type CopyTarget =
  | { kind: "group"; groupId: string }                 // copy whole group(s)
  | { kind: "bookmark"; bookmarkIds: string[]; intoGroupId: string }; // copy specific bookmarks into a dest group

export type CopyOptions = {
  fromWorkspaceId: WorkspaceIdType;
  toWorkspaceId: WorkspaceIdType;
  target: CopyTarget;
  dedupeByUrl?: boolean;         // default true
  chunkSize?: number;            // default 100
  abortSignal?: AbortSignal;     // optional cancel
  onProgress?: (copied: number, skipped: number) => void;
};

export type CopyResult = { added: number; skipped: number };

/** Small util: safe, fast new IDs (works in modern Chrome + JSDOM; fallback to Date+rand) */
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`);

/** Yield to event loop to keep UI responsive */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * Core copy routine (Local → Local). Non-mutating for source workspace.
 * - Groups are deep-copied with NEW ids for the group and its bookmarks.
 * - Bookmarks copied into a chosen destination group get NEW ids.
 * - De-dupe by normalized URL (default on).
 * - Chunked so large groups don't block the UI.
 */
export async function copyItems(opts: CopyOptions): Promise<CopyResult> {
  const {
    fromWorkspaceId,
    toWorkspaceId,
    target,
    dedupeByUrl = true,
    chunkSize = 100,
    abortSignal,
    onProgress,
  } = opts;

  // Adapters: we’re Local-only for PR-5
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!adapter?.readAllGroups || !adapter?.writeAllGroups) {
    throw new Error("Local adapter missing readAllGroups/writeAllGroups");
  }

  // 1) Read source + destination snapshots
  const [srcGroups, destGroups] = await Promise.all([
    adapter.readAllGroups(fromWorkspaceId), // BookmarkGroupType[]
    adapter.readAllGroups(toWorkspaceId),
  ]);

  // Build fast lookup maps
  const destGroupById = new Map<string, BookmarkGroupType>(destGroups.map(g => [g.id, g]));

  // Destination workspace URL set for de-dupe (across ALL groups)
  const destUrlSet = new Set<string>();
  if (dedupeByUrl) {
    for (const g of destGroups) {
      for (const b of g.bookmarks) {
        // Only normalize and add if the URL exists
        if (b.url) {
          destUrlSet.add(normalizeUrl(b.url));
        }
      }
    }
  }

  let added = 0;
  let skipped = 0;

  // Helper to copy a single bookmark into a destination group
  const copyOneBookmarkInto = (b: BookmarkType, destGroup: BookmarkGroupType) => {
  const urlKey = dedupeByUrl && b.url ? normalizeUrl(b.url) : null;

  if (dedupeByUrl && urlKey && destUrlSet.has(urlKey)) {
    skipped += 1;
    return;
  }

  const cloned: BookmarkType = { ...b, id: newId() };
  destGroup.bookmarks.push(cloned);

  if (dedupeByUrl && urlKey) destUrlSet.add(urlKey);
  added += 1;
};

  // 2) Perform copies, chunked with yields
  if (target.kind === "group") {
    // Copy entire group(s) by id — keep names, make new group+bookmark ids
    const sourceGroupsById = new Map(srcGroups.map(g => [g.id, g]));
    const groupIds = target.groupId.split(","); // allow one or many via comma if you pass it that way

    for (let i = 0; i < groupIds.length; i += 1) {
      if (abortSignal?.aborted) break;
      const srcG = sourceGroupsById.get(groupIds[i]);
      if (!srcG) continue;

      // New group shell
      const newGroup: BookmarkGroupType = {
        ...srcG,
        id: newId(),
        // shallow clone then we'll push fresh bookmark copies
        bookmarks: [],
      };

      // Chunk bookmarks for responsiveness
      for (let start = 0; start < srcG.bookmarks.length; start += chunkSize) {
        if (abortSignal?.aborted) break;
        const slice = srcG.bookmarks.slice(start, start + chunkSize);
        for (const b of slice) copyOneBookmarkInto(b, newGroup);
        onProgress?.(added, skipped);
        await tick();
      }

      destGroups.push(newGroup);
    }
  } else {
    // Copy specific bookmarks into a known destination group
    const destG = destGroupById.get(target.intoGroupId);
    if (!destG) throw new Error("Destination group not found");

    // Flatten a map of all source bookmarks by id (cheap enough)
    const allSourceBookmarks = new Map<string, BookmarkType>();
    for (const g of srcGroups) {
      for (const b of g.bookmarks) allSourceBookmarks.set(b.id, b);
    }

    // Chunk copy
    const list = target.bookmarkIds;
    for (let start = 0; start < list.length; start += chunkSize) {
      if (abortSignal?.aborted) break;
      const slice = list.slice(start, start + chunkSize);
      for (const id of slice) {
        const srcB = allSourceBookmarks.get(id);
        if (srcB) copyOneBookmarkInto(srcB, destG);
      }
      onProgress?.(added, skipped);
      await tick();
    }
  }

  // 3) Persist destination workspace only (no source mutations)
  await adapter.writeAllGroups(toWorkspaceId, destGroups);

  return { added, skipped };
}

/** Convenience: "Move" = copy + optional delete from source (checkbox). */
export async function moveItems(opts: CopyOptions & { deleteFromSource: boolean }): Promise<CopyResult> {
  const { deleteFromSource, ...copyOpts } = opts;
  const res = await copyItems(copyOpts);
  if (!deleteFromSource || res.added === 0) return res;

  // Delete from source AFTER copy succeeds.
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!adapter?.readAllGroups || !adapter?.writeAllGroups) return res;

  const { fromWorkspaceId, target } = copyOpts;
  const srcGroups = await adapter.readAllGroups(fromWorkspaceId);

  if (target.kind === "group") {
    const toDelete = new Set(target.groupId.split(","));
    const remaining = srcGroups.filter(g => !toDelete.has(g.id));
    await adapter.writeAllGroups(fromWorkspaceId, remaining);
  } else {
    const ids = new Set(target.bookmarkIds);
    for (const g of srcGroups) {
      if (ids.size === 0) break;
      const before = g.bookmarks.length;
      g.bookmarks = g.bookmarks.filter(b => !ids.has(b.id));
      if (g.bookmarks.length !== before) {
        // shrink set by those we removed (optional micro-optimization)
      }
    }
    await adapter.writeAllGroups(fromWorkspaceId, srcGroups);
  }

  return res;
}
