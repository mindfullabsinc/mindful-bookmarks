// src/scripts/storageAdapters/local.ts
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
    try { writeFpIndexLocalSync(String(workspaceId), groups); } catch {}
    try { writeFpGroupsLocalSync(String(workspaceId), groups); } catch {}
  },
};
