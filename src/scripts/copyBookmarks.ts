import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkGroupType, BookmarkType } from "@/core/types/bookmarks";
import { getAdapter } from "@/scripts/storageAdapters";
import { StorageMode } from "@/core/constants/storageMode";
import { normalizeUrl } from "@/core/utils/utilities";
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";

type CopyTarget =
  | { kind: "group"; groupId: string }                 // copy whole group(s)
  | { kind: "bookmark"; bookmarkIds: string[]; intoGroupId: string }; // copy specific bookmarks into a dest group

export type CopyOptions = {
  fromWorkspaceId: WorkspaceIdType,
  toWorkspaceId: WorkspaceIdType,
  fromStorageKey: string,
  toStorageKey: string,
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
 * Copy groups or bookmarks from one workspace to another without mutating the source.
 * - Groups are deep-copied with new identifiers.
 * - Bookmarks receive new identifiers and optionally dedupe on normalized URL.
 * - Work is chunked/yielded to keep the UI responsive.
 *
 * @param opts Copy configuration including source, destination, and copy target details.
 * @param opts.fromWorkspaceId Workspace identifier to copy items from.
 * @param opts.toWorkspaceId Workspace identifier to copy items into.
 * @param opts.target Group or bookmark selection to copy.
 * @param opts.dedupeByUrl When true, skip adding bookmarks with duplicate URLs in the destination.
 * @param opts.chunkSize Number of bookmarks to process per chunk before yielding.
 * @param opts.abortSignal Optional signal to cancel the copy midway.
 * @param opts.onProgress Optional callback invoked with cumulative added/skipped counts as chunks finish.
 * @returns Totals for added and skipped bookmarks.
 * @throws When the local storage adapter lacks read/write support or the destination group is missing.
 */
export async function copyItems(opts: CopyOptions): Promise<CopyResult> {
  const {
    fromWorkspaceId,
    toWorkspaceId,
    fromStorageKey,
    toStorageKey,
    target,
    dedupeByUrl = true,
    chunkSize = 100,
    abortSignal,
    onProgress,
  } = opts;

  // Local-only for PR-5
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!adapter?.readAllGroups || !adapter?.writeAllGroups) {
    throw new Error("Local adapter missing readAllGroups/writeAllGroups");
  }

  // 1) Read source + destination snapshots
  const [srcGroups, destGroups] = await Promise.all([
    adapter.readAllGroups(fromStorageKey), // BookmarkGroupType[]
    adapter.readAllGroups(toStorageKey),
  ]);

  // Build fast lookup maps
  const destGroupById = new Map<string, BookmarkGroupType>(destGroups.map(g => [g.id, g]));

  // Destination workspace URL set for de-dupe (across ALL groups)
  const destUrlSet = new Set<string>();
  if (dedupeByUrl) {
    for (const g of destGroups) {
      for (const b of g.bookmarks) {
        if (b.url) destUrlSet.add(normalizeUrl(b.url));
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
    const sourceGroupsById = new Map(srcGroups.map(g => [g.id, g]));

    // If "__ALL__", copy all *non-placeholder* groups only
    const groupIds =
      target.groupId === "__ALL__"
        ? srcGroups
            .filter(g => g.groupName !== EMPTY_GROUP_IDENTIFIER)
            .map(g => g.id)
        : target.groupId.split(",");

    for (let i = 0; i < groupIds.length; i += 1) {
      if (abortSignal?.aborted) break;

      const srcG = sourceGroupsById.get(groupIds[i]);
      if (!srcG) continue;

      // Always skip placeholder groups
      if (srcG.groupName === EMPTY_GROUP_IDENTIFIER) continue;

      // New group shell
      const newGroup: BookmarkGroupType = {
        ...srcG,
        id: newId(),
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
  // Ensure the EMPTY group is at the end (stable ordering for others)
  const nonPlaceholders = destGroups.filter(
    g => g.groupName !== EMPTY_GROUP_IDENTIFIER
  );
  const placeholders = destGroups.filter(
    g => g.groupName === EMPTY_GROUP_IDENTIFIER
  );
  const reordered = [...nonPlaceholders, ...placeholders];

  await adapter.writeAllGroups(toWorkspaceId, toStorageKey, reordered);

  return { added, skipped };
}

/**
 * Move groups or bookmarks between workspaces by copying them and deleting from the source.
 *
 * @param opts Copy configuration 
 * @returns Totals for added and skipped bookmarks.
 */
export async function moveItems(opts: CopyOptions): Promise<CopyResult> {
  const { fromWorkspaceId, fromStorageKey, target } = opts;
  const res = await copyItems(opts);
  if (res.added === 0) return res;

  // Delete from source AFTER copy succeeds.
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!adapter?.readAllGroups || !adapter?.writeAllGroups) return res;

  const srcGroups = await adapter.readAllGroups(fromStorageKey);

  if (target.kind === "group") {
    const toDelete = new Set(target.groupId.split(","));
    const remaining = srcGroups.filter(g => !toDelete.has(g.id));
    await adapter.writeAllGroups(fromWorkspaceId, fromStorageKey, remaining);
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
    await adapter.writeAllGroups(fromWorkspaceId, fromStorageKey, srcGroups);
  }

  return res;
}
