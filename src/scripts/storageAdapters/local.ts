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
      await writeGroupsIndexSession(idx, workspaceId);
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
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
