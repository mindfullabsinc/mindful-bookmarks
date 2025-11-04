/* -------------------- Imports -------------------- */
import { WorkspaceIdType, DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type BookmarkSnapshot = { data: any; at: number; etag?: string };
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Compute the localStorage key used for the workspace's compact groups index.
 */
const groupsIndexKey = (wid: WorkspaceIdType) => `mindful_${wid}_groups_index_v1`;
/**
 * Compute the localStorage key used for the workspace's full bookmark snapshot.
 */
const bookmarksSnapshotKey = (wid: WorkspaceIdType) => `mindful_${wid}_bookmarks_snapshot_v1`;

/** ---------- Tiny mirror key in chrome.storage.session ---------- */
const groupsIndexSessionKey = (wid: WorkspaceIdType) => `groupsIndex:${wid}`;
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

/* -------------------- NEW: chrome.storage.session tiny mirror (index only) -------------------- */
/**
 * Read the tiny groups-index mirror from chrome.storage.session (fast-path for reopen).
 * NOTE: This is NOT the source of truth; localStorage snapshot is.
 */
export async function readGroupsIndexSession(
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
): Promise<unknown | null> {
  const api = (globalThis as any).chrome?.storage?.session;
  if (!api?.get) return null;
  try {
    const key = groupsIndexSessionKey(workspaceId);
    const result = await api.get(key);
    return result?.[key] ?? null;
  } catch { return null; }
}

/**
 * Write the tiny groups-index mirror to chrome.storage.session.
 */
export async function writeGroupsIndexSession(
  idx: unknown,
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
): Promise<void> {
  const api = (globalThis as any).chrome?.storage?.session;
  if (!api?.set) return;
  try {
    await api.set({ [groupsIndexSessionKey(workspaceId)]: idx });
  } catch {}
}

/**
 * Remove all groups-index mirrors except the active one's mirror to avoid cross-leaks.
 */
export async function clearSessionGroupsIndexExcept(
  workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID
): Promise<void> {
  const api = (globalThis as any).chrome?.storage?.session;
  if (!api?.get || !api?.remove) return;
  try {
    const all = await api.get(null as any);
    const keys = Object.keys(all).filter(
      k => k.startsWith('groupsIndex:') && k !== groupsIndexSessionKey(workspaceId)
    );
    if (keys.length) await api.remove(keys);
  } catch {}
}
/* --------------------------------------------------------------------------------------------- */

/* -------------------- DEPRECATED: window.sessionStorage snapshot mirror -------------------- */
/**
 * Read the sessionStorage bookmark snapshot for a workspace.
 *
 * @deprecated use localStorage snapshot + readGroupsIndexSession() for fast index.
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
 * @deprecated prefer writeGroupsIndexSession() (index only) and keep snapshot only in localStorage.
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
/* ------------------------------------------------------------------------------------------ */


/**
 * Remove workspace-scoped bookmark caches (both index and snapshot) from
 * localStorage and sessionStorage.
 *
 * @param workspaceId Workspace identifier whose caches should be cleared.
 */
export function clearBookmarkCaches(workspaceId: WorkspaceIdType = DEFAULT_LOCAL_WORKSPACE_ID) {
  try { localStorage.removeItem(groupsIndexKey(workspaceId)); } catch {}
  try { localStorage.removeItem(bookmarksSnapshotKey(workspaceId)); } catch {}

  // old window.sessionStorage cleanup (kept for completeness)
  try { (globalThis as any).sessionStorage?.removeItem(groupsIndexKey(workspaceId)); } catch {}
  try { (globalThis as any).sessionStorage?.removeItem(bookmarksSnapshotKey(workspaceId)); } catch {}

  // : also clean the chrome.storage.session mirror for this wid
  const api = (globalThis as any).chrome?.storage?.session;
  if (api?.remove) {
    api.remove(groupsIndexSessionKey(workspaceId)).catch(() => {});
  }
}
/* ---------------------------------------------------------- */
