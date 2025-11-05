/* -------------------- Imports -------------------- */
import type { StorageAdapter } from "@/core/types/storageAdapter";
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkGroupType } from "@/core/types/bookmarks";
import { 
  BookmarkSnapshot, 
  readGroupsIndexSession, 
  writeGroupsIndexSession 
} from "@/scripts/caching/bookmarkCache";
import {
  readFpGroupsLocalSync,
  readFpIndexLocalSync,
  writeFpGroupsLocalSync,
  writeFpIndexLocalSync,
} from "@/scripts/caching/bookmarkCacheLocalFirstPaint";

import { wsKey } from "@/core/constants/workspaces";
/* ---------------------------------------------------------- */

/* -------------------- Namespacing helpers -------------------- */
/**
 * Construct a namespaced chrome.storage key for a workspace-scoped entry.
 *
 * @param workspaceId Workspace identifier.
 * @param key Logical storage key.
 * @returns Fully qualified key used in chrome.storage.local.
 */
const ns = (workspaceId: WorkspaceIdType, key: string) => wsKey(workspaceId, key);

/**
 * Read a value from chrome.storage.local under the workspace namespace.
 *
 * @param workspaceId Workspace identifier.
 * @param key Logical storage key.
 * @returns Stored value or undefined when key is absent.
 */
async function getLocal<T = unknown>(workspaceId: WorkspaceIdType, key: string): Promise<T | undefined> {
  const full = ns(workspaceId, key);
  const obj = await chrome.storage.local.get(full);
  return obj?.[full] as T | undefined;
}

/**
 * Persist a namespaced value to chrome.storage.local.
 *
 * @param workspaceId Workspace identifier.
 * @param key Logical storage key.
 * @param value Serializable value to store.
 */
async function setLocal(workspaceId: WorkspaceIdType, key: string, value: unknown): Promise<void> {
  const full = ns(workspaceId, key);
  await chrome.storage.local.set({ [full]: value });
}

/**
 * Remove a namespaced entry from chrome.storage.local.
 *
 * @param workspaceId Workspace identifier.
 * @param key Logical storage key.
 */
async function removeLocal(workspaceId: WorkspaceIdType, key: string): Promise<void> {
  const full = ns(workspaceId, key);
  await chrome.storage.local.remove(full);
}

/**
 * Derive a lightweight "groups index" from a full workspace groups array.
 *
 * This is used to populate the fast session mirror (`chrome.storage.session`)
 * for quick reopen and workspace switching without loading full bookmark data.
 * Each entry contains only the group’s `id` and `groupName`, which are enough
 * for listing and selection in the UI.
 *
 * @param {BookmarkGroupType[]} groups
 *   Full array of bookmark groups belonging to a workspace.
 *
 * @returns {{ id: string; groupName: string }[]}
 *   A compact array of objects containing each group's identifier and name,
 *   suitable for storage in `chrome.storage.session`.
 *
 * @example
 * deriveIndex([
 *   { id: "g1", groupName: "Work", bookmarks: [...] },
 *   { id: "g2", groupName: "Personal", bookmarks: [...] }
 * ]);
 * // → [ { id: "g1", groupName: "Work" }, { id: "g2", groupName: "Personal" } ]
 */
export const deriveIndex = (groups: BookmarkGroupType[]) =>
  groups.map(g => ({
    id: String(g.id),
    groupName: String(g.groupName),
  }));
/* ---------------------------------------------------------- */

/* -------------------- Adapter -------------------- */
export const LocalAdapter: Required<StorageAdapter> = {
  // Phase 1a: synchronous seed from WS-scoped LOCAL first-paint snapshot
  /**
   * Return the first-paint snapshot for a workspace when available.
   *
   * @param workspaceId Workspace identifier.
   * @returns Bookmark groups array or null when no snapshot exists.
   */
  readPhase1aSnapshot(workspaceId: WorkspaceIdType): BookmarkGroupType[] | null {
    const fp = readFpGroupsLocalSync(workspaceId);
    return Array.isArray(fp) && fp.length ? fp : null;
  },

  // Phase 1b: no separate session snapshot format for LOCAL (reuse FP snapshot)
  /**
   * Return a session-level snapshot for fast hydration.
   *
   * @param workspaceId Workspace identifier.
   * @returns Bookmark snapshot or null when none exists.
   */
  async readPhase1bSessionSnapshot(workspaceId: WorkspaceIdType): Promise<BookmarkSnapshot | null> {
    const fp = readFpGroupsLocalSync(workspaceId);
    return Array.isArray(fp) && fp.length ? { data: fp, at: Date.now() } : null;
  },

  /**
   * Load the lightweight groups index for quick rendering.
   *
   * @param workspaceId Workspace identifier.
   * @returns Array of group id/name pairs.
   */
  async readGroupsIndexFast(workspaceId: WorkspaceIdType) {
    // 1) chrome.storage.session tiny mirror (fast on reopen)
    try {
      const mirrored = await readGroupsIndexSession(workspaceId);
      if (Array.isArray(mirrored) && mirrored.length) {
        return mirrored as { id: string; groupName: string }[];
      }
    } catch {}
    
    // 2) First-paint LOCAL snapshot (authoritative fallback)
    return readFpIndexLocalSync(workspaceId);
  },

  /**
   * Persist bookmark datasets to chrome.storage when non-empty.
   *
   * @param workspaceId Workspace identifier.
   * @param groups Bookmark collection to cache.
   */
  async persistCachesIfNonEmpty(workspaceId: WorkspaceIdType, groups: BookmarkGroupType[]) {
    if (!Array.isArray(groups) || groups.length === 0) return;
    try { writeFpIndexLocalSync(workspaceId, groups); } catch {}
    try { writeFpGroupsLocalSync(workspaceId, groups); } catch {}

    // Update the tiny chrome.storage.session mirror for fast reopen
    try {
      const idx = groups.map(g => ({ id: String(g.id), groupName: String(g.groupName) }));
      await writeGroupsIndexSession(workspaceId, idx);
    } catch {}
  },

  /* -------------------- Generic WS-scoped storage (new in PR-3) -------------------- */
  /**
   * Read a workspace-scoped value from chrome.storage.local.
   */
  async get<T = unknown>(workspaceId: WorkspaceIdType, key: string): Promise<T | undefined> {
    return getLocal<T>(workspaceId, key);
  },

  /**
   * Persist a workspace-scoped value into chrome.storage.local.
   */
  async set<T = unknown>(workspaceId: WorkspaceIdType, key: string, value: T): Promise<void> {
    await setLocal(workspaceId, key, value);
  },

  /**
   * Remove a workspace-scoped value from chrome.storage.local.
   */
  async remove(workspaceId: WorkspaceIdType, key: string): Promise<void> {
    await removeLocal(workspaceId, key);
  },

    /** Return all groups for a workspace (no caching side-effects). */
  async readAllGroups(workspaceId: string): Promise<BookmarkGroupType[]> {
    // Read from the canonical local store:
    const raw = localStorage.getItem(`mindful_${workspaceId}_bookmarks_snapshot_v1`);
    if (!raw) return [];
    try {
      const snap = JSON.parse(raw);
      return Array.isArray(snap?.data?.groups) ? snap.data.groups as BookmarkGroupType[] : [];
    } catch {
      return [];
    }
  },

  /** Overwrite all groups for a workspace. No mutation beyond this workspace. */
  async writeAllGroups(workspaceId: string, groups: BookmarkGroupType[]): Promise<void> {
    const payload = {
      data: { groups },
      at: Date.now(),
    };
    localStorage.setItem(
      `mindful_${workspaceId}_bookmarks_snapshot_v1`,
      JSON.stringify(payload)
    );
    // update the session mirror 
    writeGroupsIndexSession?.(workspaceId, deriveIndex(groups));
  },
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
