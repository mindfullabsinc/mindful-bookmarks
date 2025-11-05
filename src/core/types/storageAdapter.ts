import type { BookmarkGroupType } from "@/core/types/bookmarks";
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkSnapshot } from "@/scripts/caching/bookmarkCache";

export interface StorageAdapter {
  /** Phase 1a: synchronous seed snapshot for first paint (or null if none) */
  readPhase1aSnapshot(workspaceId: WorkspaceIdType): BookmarkGroupType[] | null;

  /** Phase 1b: async warm snapshot for session (or null if none) */
  readPhase1bSessionSnapshot(workspaceId: WorkspaceIdType): Promise<BookmarkSnapshot | null>;

  /** Fast tiny groups index */
  readGroupsIndexFast(
    workspaceId: WorkspaceIdType
  ): Promise<Array<{ id: string; groupName: string }>>;

  /** Persist small index + caches only when data is non-empty */
  persistCachesIfNonEmpty(
    workspaceId: WorkspaceIdType,
    groups: BookmarkGroupType[]
  ): Promise<void>;

  /**
   * Optional WS-scoped KV operations (added in PR-3).
   * LocalAdapter implements these and namespaces keys as WS_<id>__<key>.
   * Remote adapters may skip for now.
   */
  get?<T = unknown>(workspaceId: WorkspaceIdType, key: string): Promise<T | undefined>;
  set?<T = unknown>(workspaceId: WorkspaceIdType, key: string, value: T): Promise<void>;
  remove?(workspaceId: WorkspaceIdType, key: string): Promise<void>;

  /**
   * Return the full groups array for a workspace.
   * PR-5 needs a raw, non-mutating read/write path for Local→Local copy.
   * Non-Local adapters can omit this (it’s optional).
   */
  readAllGroups?(workspaceId: WorkspaceIdType): Promise<BookmarkGroupType[]>;

  /**
   * Overwrite the full groups array for a workspace.
   * Must not mutate any other workspace or caches as side-effects.
   */
  writeAllGroups?(
    workspaceId: WorkspaceIdType,
    groups: BookmarkGroupType[]
  ): Promise<void>;
}

/** Narrowing helper for callers that want to use KV ops safely */
export function supportsKV(
  adapter: StorageAdapter
): adapter is StorageAdapter & Required<Pick<StorageAdapter, "get" | "set" | "remove">> {
  return typeof adapter.get === "function" &&
         typeof adapter.set === "function" &&
         typeof adapter.remove === "function";
}
