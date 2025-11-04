/* -------------------- Imports -------------------- */
import { WorkspaceIdType, DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type BookmarkSnapshot = { data: any; at: number; etag?: string };
/* ---------------------------------------------------------- */

/* -------------------- Helper functions functions -------------------- */
/**
 * Compute the localStorage key used for the workspace's compact groups index.
 */
const groupsIndexKey = (wid: WorkspaceIdType) => `mindful_${wid}_groups_index_v1`;
/**
 * Compute the localStorage key used for the workspace's full bookmark snapshot.
 */
const bookmarksSnapshotKey = (wid: WorkspaceIdType) => `mindful_${wid}_bookmarks_snapshot_v1`;
/* ---------------------------------------------------------- */

/* -------------------- Exportable functions -------------------- */
/**
 * Read the synchronous bookmark snapshot and index for a workspace from localStorage.
 *
 * @param workspaceId Workspace identifier whose cache should be read.
 * @returns Stored bookmark snapshot or null when nothing is cached.
 */
export function readBookmarkCacheSync(
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
): BookmarkSnapshot | null {  
  try {
    const snap = JSON.parse(localStorage.getItem(bookmarksSnapshotKey(workspaceId)) ?? 'null');
    return snap ?? null; // snap is already a BookmarkSnapshot
  } catch { return null; }
}

/**
 * Persist bookmark index and snapshot data to localStorage for the given workspace.
 *
 * @param data Object containing index (`idx`) and snapshot (`snap`) payloads.
 * @param workspaceId Workspace identifier whose cache should be updated.
 */
export function writeBookmarkCacheSync(
  data: { idx: unknown; snap: unknown },
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
) {
  try {
    localStorage.setItem(groupsIndexKey(workspaceId), JSON.stringify(data.idx));
    localStorage.setItem(bookmarksSnapshotKey(workspaceId), JSON.stringify(data.snap));
  } catch {}
}

/**
 * Read the sessionStorage bookmark snapshot for a workspace.
 *
 * @param workspaceId Workspace identifier whose session cache should be read.
 * @returns Promise resolving to the stored snapshot or null.
 */
export async function readBookmarkCacheSession(
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
): Promise<BookmarkSnapshot | null> {
  const key2 = bookmarksSnapshotKey(workspaceId);
  const ss = (globalThis as any).sessionStorage;
  try {
    const snap = JSON.parse(ss?.getItem(key2) ?? 'null');
    return snap ?? null;
  } catch { return null; }
}

/**
 * Persist bookmark index and snapshot data to sessionStorage for the given workspace.
 *
 * @param data Object containing index (`idx`) and snapshot (`snap`) payloads.
 * @param workspaceId Workspace identifier whose session cache should be updated.
 */
export async function writeBookmarkCacheSession(
  data: { idx: unknown; snap: unknown },
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
) {
  const ss = (globalThis as any).sessionStorage;
  try {
    ss?.setItem(groupsIndexKey(workspaceId), JSON.stringify(data.idx));
    ss?.setItem(bookmarksSnapshotKey(workspaceId), JSON.stringify(data.snap));
  } catch {}
}


/**
 * Remove workspace-scoped bookmark caches (both index and snapshot) from
 * localStorage and sessionStorage.
 *
 * @param workspaceId Workspace identifier whose caches should be cleared.
 */
export function clearBookmarkCaches(workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID) {
  try { localStorage.removeItem(groupsIndexKey(workspaceId)); } catch {}
  try { localStorage.removeItem(bookmarksSnapshotKey(workspaceId)); } catch {}
  try { (globalThis as any).sessionStorage?.removeItem(groupsIndexKey(workspaceId)); } catch {}
  try { (globalThis as any).sessionStorage?.removeItem(bookmarksSnapshotKey(workspaceId)); } catch {}
}
/* ---------------------------------------------------------- */
