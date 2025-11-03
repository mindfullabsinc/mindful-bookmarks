/* -------------------- Imports -------------------- */
import type { StorageAdapter } from "@/core/types/storageAdapter";
import type { WorkspaceId } from "@/core/constants/workspaces";
import type { BookmarkGroupType } from "@/core/types/bookmarks";
import type { BookmarkSnapshot } from "@/scripts/caching/BookmarkCache";

import {
  readFpGroupsLocalSync,
  readFpIndexLocalSync,
  writeFpGroupsLocalSync,
  writeFpIndexLocalSync,
} from "@/scripts/caching/BookmarkCacheLocalFirstPaint";

import { wsKey } from "@/core/constants/workspaces";
/* ---------------------------------------------------------- */

/* -------------------- Namespacing helpers -------------------- */
const ns = (workspaceId: WorkspaceId, key: string) => wsKey(workspaceId, key);

async function getLocal<T = unknown>(workspaceId: WorkspaceId, key: string): Promise<T | undefined> {
  const full = ns(workspaceId, key);
  const obj = await chrome.storage.local.get(full);
  return obj?.[full] as T | undefined;
}

async function setLocal(workspaceId: WorkspaceId, key: string, value: unknown): Promise<void> {
  const full = ns(workspaceId, key);
  await chrome.storage.local.set({ [full]: value });
}

async function removeLocal(workspaceId: WorkspaceId, key: string): Promise<void> {
  const full = ns(workspaceId, key);
  await chrome.storage.local.remove(full);
}
/* ---------------------------------------------------------- */

/* -------------------- Adapter -------------------- */
export const LocalAdapter: StorageAdapter = {
  // Phase 1a: synchronous seed from WS-scoped LOCAL first-paint snapshot
  readPhase1aSnapshot(workspaceId: WorkspaceId): BookmarkGroupType[] | null {
    const fp = readFpGroupsLocalSync(workspaceId);
    return Array.isArray(fp) && fp.length ? fp : null;
  },

  // Phase 1b: no separate session snapshot format for LOCAL (reuse FP snapshot)
  async readPhase1bSessionSnapshot(workspaceId: WorkspaceId): Promise<BookmarkSnapshot | null> {
    const fp = readFpGroupsLocalSync(workspaceId);
    return Array.isArray(fp) && fp.length ? { data: fp, at: Date.now() } : null;
  },

  async readGroupsIndexFast(workspaceId: WorkspaceId) {
    return readFpIndexLocalSync(workspaceId);
  },

  async persistCachesIfNonEmpty(workspaceId: WorkspaceId, groups: BookmarkGroupType[]) {
    if (!Array.isArray(groups) || groups.length === 0) return;
    try { writeFpIndexLocalSync(workspaceId, groups); } catch {}
    try { writeFpGroupsLocalSync(workspaceId, groups); } catch {}
  },

  /* -------------------- Generic WS-scoped storage (new in PR-3) -------------------- */
  async get<T = unknown>(workspaceId: WorkspaceId, key: string): Promise<T | undefined> {
    return getLocal<T>(workspaceId, key);
  },

  async set<T = unknown>(workspaceId: WorkspaceId, key: string, value: T): Promise<void> {
    await setLocal(workspaceId, key, value);
  },

  async remove(workspaceId: WorkspaceId, key: string): Promise<void> {
    await removeLocal(workspaceId, key);
  },
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */