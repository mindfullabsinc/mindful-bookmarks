/* -------------------- Imports -------------------- */
import { WorkspaceId, DEFAULT_LOCAL_WORKSPACE_ID } from '@/scripts/workspaces';
/* ---------------------------------------------------------- */


/* -------------------- Constants --------------------*/
const NS = 'mindful:v1';
// (Removed unused LEGACY_* constants)
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type BookmarkSnapshot = { data: any; at: number; etag?: string };
/* ---------------------------------------------------------- */

/* -------------------- Helper functions functions -------------------- */
const legacyBookmarkKey = (userId?: string | null, StorageMode?: string) =>
  `${NS}:bookmarkGroups:${userId || 'anon'}:${StorageMode || 'local'}`;

// New, workspace-scoped keys:
const groupsIndexKey = (wid: WorkspaceId) => `mindful_${wid}_groups_index_v1`;
const bookmarksSnapshotKey = (wid: WorkspaceId) => `mindful_${wid}_bookmarks_snapshot_v1`;
/* ---------------------------------------------------------- */

/* -------------------- Exportable functions -------------------- */
export function readBookmarkCacheSync(workspaceId: WorkspaceId = DEFAULT_LOCAL_WORKSPACE_ID) {
  try {
    // Try new workspace-scoped keys first
    const idx = JSON.parse(localStorage.getItem(groupsIndexKey(workspaceId)) ?? 'null');
    const snap = JSON.parse(localStorage.getItem(bookmarksSnapshotKey(workspaceId)) ?? 'null');
    if (idx && snap) return { idx, snap };

    // fallback legacy (prefer the real legacy key with userId/storageMode)
    const lidxUserScoped = JSON.parse(localStorage.getItem(legacyBookmarkKey()) ?? 'null');
    const lsnap = snap; // no separate legacy snapshot; reuse whatever we have

    if (lidxUserScoped && lsnap) {
      // Best-effort migration into workspace-scoped keys
      try {
        localStorage.setItem(groupsIndexKey(workspaceId), JSON.stringify(lidxUserScoped));
        localStorage.setItem(bookmarksSnapshotKey(workspaceId), JSON.stringify(lsnap));
        // Optional: clean up old key after successful write
        localStorage.removeItem(legacyBookmarkKey());
      } catch {}
      return { idx: lidxUserScoped, snap: lsnap };
    }

    return null;
  } catch { return null; }
}

export function writeBookmarkCacheSync(
  data: { idx: unknown; snap: unknown },
  workspaceId: WorkspaceId = DEFAULT_LOCAL_WORKSPACE_ID
) {
  try {
    localStorage.setItem(groupsIndexKey(workspaceId), JSON.stringify(data.idx));
    localStorage.setItem(bookmarksSnapshotKey(workspaceId), JSON.stringify(data.snap));
  } catch {}
}

export async function readBookmarkCacheSession(workspaceId: WorkspaceId = DEFAULT_LOCAL_WORKSPACE_ID) {
  const key = groupsIndexKey(workspaceId);
  const key2 = bookmarksSnapshotKey(workspaceId);
  const ss = (globalThis as any).sessionStorage;
  try {
    // Try new workspace-scoped keys first
    const idx = JSON.parse(ss?.getItem(key) ?? 'null');
    const snap = JSON.parse(ss?.getItem(key2) ?? 'null');
    if (idx && snap) return { idx, snap };

    // fallback legacy (prefer the real legacy key with userId/storageMode)
    const lidxUserScoped = JSON.parse(ss?.getItem(legacyBookmarkKey()) ?? 'null');
    const lsnap = snap; // no separate legacy snapshot in session scope

    if (lidxUserScoped && lsnap) {
      // Best-effort migration into workspace-scoped keys
      try {
        ss?.setItem(key, JSON.stringify(lidxUserScoped));
        ss?.setItem(key2, JSON.stringify(lsnap));
        // Optional: clean up old key after successful write
        ss?.removeItem(legacyBookmarkKey());
      } catch {}
      return { idx: lidxUserScoped, snap: lsnap };
    }

    return null;
  } catch { return null; }
}

export async function writeBookmarkCacheSession(
  data: { idx: unknown; snap: unknown },
  workspaceId: WorkspaceId = DEFAULT_LOCAL_WORKSPACE_ID
) {
  const ss = (globalThis as any).sessionStorage;
  try {
    ss?.setItem(groupsIndexKey(workspaceId), JSON.stringify(data.idx));
    ss?.setItem(bookmarksSnapshotKey(workspaceId), JSON.stringify(data.snap));
  } catch {}
}
/* ---------------------------------------------------------- */
