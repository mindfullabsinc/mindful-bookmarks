// src/scripts/storageAdapters/types.ts
import type { BookmarkGroupType } from "@/core/types/bookmarks";
import type { WorkspaceId } from "@/core/constants/workspaces";
import type { BookmarkSnapshot } from "@/scripts/caching/BookmarkCache";

export interface StorageAdapter {
  /** Phase 1a: synchronous seed snapshot for first paint (or null if none) */
  readPhase1aSnapshot(workspaceId: WorkspaceId): BookmarkGroupType[] | null;

  /** Phase 1b: async warm snapshot for session (or null if none) */
  readPhase1bSessionSnapshot(workspaceId: WorkspaceId): Promise<BookmarkSnapshot | null>;

  /** Fast tiny groups index */
  readGroupsIndexFast(workspaceId: WorkspaceId): Promise<Array<{ id: string; groupName: string }>>;

  /** Persist small index + caches only when data is non-empty */
  persistCachesIfNonEmpty(workspaceId: WorkspaceId, groups: BookmarkGroupType[]): Promise<void>;
}
