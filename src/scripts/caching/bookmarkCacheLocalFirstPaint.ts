import { fpGroupsIndexKey, fpGroupsBlobKey } from "@/scripts/caching/cacheKeys";
import type { BookmarkGroupType } from "@/core/types/bookmarks";

/**
 * Read the first-paint index (id + groupName) from localStorage for a workspace.
 *
 * @param workspaceId Workspace identifier whose index should be retrieved.
 * @returns Array of id/groupName pairs or an empty array when none cached.
 */
export function readFpIndexLocalSync(workspaceId: string): Array<{ id: string; groupName: string }> {
  try {
    const raw = (globalThis as any).localStorage?.getItem(fpGroupsIndexKey(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Persist the first-paint index for a workspace to localStorage when groups exist.
 *
 * @param workspaceId Workspace identifier whose index should be stored.
 * @param groups Bookmark groups to derive the index from.
 */
export function writeFpIndexLocalSync(workspaceId: string, groups: BookmarkGroupType[] | undefined | null) {
  if (!Array.isArray(groups) || groups.length === 0) return;
  const idx = groups.map(g => ({ id: String(g.id), groupName: String(g.groupName) }));
  try { (globalThis as any).localStorage?.setItem(fpGroupsIndexKey(workspaceId), JSON.stringify(idx)); } catch {}
}

/**
 * Read the first-paint full bookmark snapshot from localStorage for a workspace.
 *
 * @param workspaceId Workspace identifier whose snapshot should be retrieved.
 * @returns Bookmark groups array (empty when missing).
 */
export function readFpGroupsLocalSync(workspaceId: string): BookmarkGroupType[] {
  const l = (globalThis as any).localStorage;
  const blobKey = fpGroupsBlobKey(workspaceId);

  try {
    // Use persistent localStorage
    const rawLocal = l?.getItem(blobKey);
    if (rawLocal) return JSON.parse(rawLocal);

    return [];
  } catch { return []; }
}

/**
 * Persist the first-paint bookmark snapshot to localStorage for a workspace.
 *
 * @param workspaceId Workspace identifier whose snapshot should be stored.
 * @param groups Bookmark groups to store.
 */
export function writeFpGroupsLocalSync(workspaceId: string, groups: BookmarkGroupType[] | undefined | null) {
  if (!Array.isArray(groups) || groups.length === 0) return;
  const l = (globalThis as any).localStorage;
  const blobKey = fpGroupsBlobKey(workspaceId);
  try { l?.setItem(blobKey, JSON.stringify(groups)); } catch {}
}

/**
 * Remove first-paint caches (index + full snapshot) from local and session storage.
 *
 * @param workspaceId Workspace identifier whose caches should be cleared.
 */
export function clearFpLocal(workspaceId: string) {
  const l = (globalThis as any).localStorage;
  const s = (globalThis as any).sessionStorage;
  try { l?.removeItem(fpGroupsIndexKey(workspaceId)); } catch {}
  try { l?.removeItem(fpGroupsBlobKey(workspaceId)); } catch {}
  try { s?.removeItem(fpGroupsBlobKey(workspaceId)); } catch {} // legacy
}
