import type { BookmarkGroupType } from "@/core/types/bookmarks";
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import type { BookmarkSnapshot } from "@/scripts/caching/bookmarkCache";

export interface StorageAdapter {
  /**
   * Provide a synchronous snapshot used to seed the UI before async hydration.
   *
   * @param workspaceId Workspace identifier whose cache should be read.
   * @returns Bookmark list or null when no snapshot exists.
   */
  readPhase1aSnapshot(workspaceId: WorkspaceIdType): BookmarkGroupType[] | null;

  /**
   * Provide an asynchronous session snapshot with timestamp metadata.
   *
   * @param workspaceId Workspace identifier whose session cache should be read.
   * @returns Bookmark snapshot or null when none exists.
   */
  readPhase1bSessionSnapshot(workspaceId: WorkspaceIdType): Promise<BookmarkSnapshot | null>;

  /**
   * Return a compact groups index suitable for lightweight UI rendering.
   *
   * @param workspaceId Workspace identifier whose index should be read.
   * @returns Array of group id/name pairs.
   */
  readGroupsIndexFast(
    workspaceId: WorkspaceIdType
  ): Promise<Array<{ id: string; groupName: string }>>;

  /**
   * Persist first-paint caches and indexes only when bookmark data is non-empty.
   *
   * @param workspaceId Workspace identifier whose caches should be updated.
   * @param groups Bookmark dataset used to seed caches.
   */
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
  readAllGroups?(fullStorageKey: string): Promise<BookmarkGroupType[]>;

  /**
   * Overwrite the full groups array for a workspace.
   * Must not mutate any other workspace or caches as side-effects.
   */
  writeAllGroups?(
    workspaceId: WorkspaceIdType,
    fullStorageKey: string,
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
