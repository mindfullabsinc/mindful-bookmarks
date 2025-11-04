import { Storage } from "@/scripts/Storage";
import { StorageMode, type StorageModeType } from "@/core/constants/storageMode";
import type { BookmarkGroupType } from "@/core/types/bookmarks";
import type { WorkspaceIdType } from "@/core/constants/workspaces";

type LoadOptions = {
  noLocalFallback?: boolean;
};

const ensureGroups = (value: unknown): BookmarkGroupType[] =>
  Array.isArray(value) ? (value as BookmarkGroupType[]) : [];

/**
 * Load the initial bookmark groups for a user/workspace pair, preferring the requested storage mode
 * while optionally falling back to local storage when remote data is unavailable.
 *
 * @param userId Cognito user identifier (or null/undefined when anonymous).
 * @param workspaceId Workspace identifier whose bookmarks should be loaded.
 * @param storageMode Storage mode to query (`local` or `remote`). When omitted, remote is attempted first.
 * @param opts Optional behaviour overrides (e.g. disable local fallback).
 * @returns Promise resolving to the bookmark groups array (empty when none found).
 */
export async function loadInitialBookmarks(
  userId: string | null | undefined,
  workspaceId: WorkspaceIdType,
  storageMode: StorageModeType | undefined,
  opts: LoadOptions = {}
): Promise<BookmarkGroupType[]> {
  const { noLocalFallback = false } = opts;

  if (!userId) return [];

  // LOCAL mode: read from chrome.storage.local as usual
  if (storageMode === StorageMode.LOCAL) {
    const localStore = new Storage(StorageMode.LOCAL);
    try {
      const local = await localStore.load(userId, workspaceId);
      return ensureGroups(local);
    } catch {
      return [];
    }
  }

  // REMOTE mode: try remote first
  const remoteStore = new Storage(StorageMode.REMOTE as any);
  try {
    const remoteRaw = await remoteStore.load(userId, workspaceId);
    const remote = ensureGroups(remoteRaw);
    // remoteStorageStrategy.load already returns [] on error, so just return
    // whatever it gave us (array or empty)
    if (noLocalFallback) return remote;
    // optional fallback to LOCAL if you allow it
    if (remote.length) return remote;
  } catch {
    // swallow – we'll consider fallback below (if allowed)
  }

  // Only reach here if remote failed or was empty.
  // If you said "no local fallback", return [] and DO NOT show local cache.
  if (noLocalFallback) return [];

  // Fallback to LOCAL (only when explicitly allowed by the caller)
  try {
    const localStore = new Storage(StorageMode.LOCAL);
    const local = await localStore.load(userId, workspaceId);
    return ensureGroups(local);
  } catch {
    return [];
  }
}
