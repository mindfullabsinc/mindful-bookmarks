// src/scripts/BookmarkCacheLocalFirstPaint.ts
import { fpGroupsIndexKey, fpGroupsBlobKey } from "@/scripts/CacheKeys";
import type { BookmarkGroupType } from "@/types/bookmarks"; 

/**
 * Read the minimal bookmark index used for first paint in LOCAL mode.
 *
 * @param workspaceId Workspace identifier whose index should be retrieved.
 * @returns Array of group metadata (id + name) or an empty array.
 */
export function readFpIndexLocalSync(workspaceId: string): Array<{id: string; groupName: string}> {
  try {
    const raw = (globalThis as any).localStorage?.getItem(fpGroupsIndexKey(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Persist the minimal index used during first paint in LOCAL mode.
 *
 * @param workspaceId Workspace identifier where the index should be stored.
 * @param groups Bookmark groups to derive the index from.
 * @returns void
 */
export function writeFpIndexLocalSync(workspaceId: string, groups: BookmarkGroupType[] | undefined | null) {
  if (!Array.isArray(groups) || groups.length === 0) return;
  const idx = groups.map(g => ({ id: String(g.id), groupName: String(g.groupName) }));
  try { (globalThis as any).localStorage?.setItem(fpGroupsIndexKey(workspaceId), JSON.stringify(idx)); } catch {}
}

/**
 * Read the full bookmark snapshot used for first paint in LOCAL mode.
 *
 * @param workspaceId Workspace identifier whose snapshot should be loaded.
 * @returns Stored bookmark groups or an empty array.
 */
export function readFpGroupsLocalSync(workspaceId: string): BookmarkGroupType[] {
  try {
    const raw = (globalThis as any).sessionStorage?.getItem(fpGroupsBlobKey(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Persist the full bookmark snapshot used for first paint in LOCAL mode.
 *
 * @param workspaceId Workspace identifier where the snapshot should be cached.
 * @param groups Bookmark groups to serialize.
 * @returns void
 */
export function writeFpGroupsLocalSync(workspaceId: string, groups: BookmarkGroupType[] | undefined | null) {
  if (!Array.isArray(groups) || groups.length === 0) return;
  try { (globalThis as any).sessionStorage?.setItem(fpGroupsBlobKey(workspaceId), JSON.stringify(groups)); } catch {}
}

/**
 * Clear the workspace-scoped first-paint caches from local and session storage.
 *
 * @param workspaceId Workspace identifier whose caches should be removed.
 * @returns void
 */
export function clearFpLocal(workspaceId: string) {
  try { (globalThis as any).localStorage?.removeItem(fpGroupsIndexKey(workspaceId)); } catch {}
  try { (globalThis as any).sessionStorage?.removeItem(fpGroupsBlobKey(workspaceId)); } catch {}
}
