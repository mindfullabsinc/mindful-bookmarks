/* -------------------- Imports -------------------- */
/* Types */
import type { WorkspaceService } from "@/core/types/workspaces";
import type {
  BookmarkGroupType,
  BookmarkType,
} from "@/core/types/bookmarks";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup } from "@shared/types/llmGrouping";

/* Constants */
import { wsKey } from "@/core/constants/workspaces";

/* Scripts and utils */
import { createLocalWorkspace } from "@/scripts/workspaces/registry";
import { getGroupsStorageKey } from "@/core/utils/storageKeys";
import { LocalAdapter } from "@/scripts/storageAdapters/local";
import { capitalize } from "@/core/utils/stringUtils";
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Convert CategorizedGroup entries into BookmarkGroupType arrays for persistence.
 *
 * @param groups Grouping results returned by the LLM.
 * @returns BookmarkGroupType array ready to save.
 */
function mapToBookmarkGroups(
  groups: CategorizedGroup[]
): BookmarkGroupType[] {
  const now = Date.now();

  return groups.map((group) => {
    const bookmarks: BookmarkType[] = group.items.map((item) => ({
      id: item.id,
      name: item.name || item.url,
      url: item.url,
      createdAt: item.lastVisitedAt ?? now,
    })) as BookmarkType[];

    const bookmarkGroup: BookmarkGroupType = {
      id: group.id,
      groupName: group.name,
      bookmarks,
    };

    return bookmarkGroup;
  });
}
/* ---------------------------------------------------------- */

/**
 * Factory for a WorkspaceService that:
 *  - is scoped to a specific userId
 *  - creates one Local workspace per purpose
 *  - writes bookmark groups via LocalAdapter into chrome.storage.local
 *  - keeps first-paint + session mirrors in sync
 */
/**
 * Construct a WorkspaceService bound to the current userId that persists via LocalAdapter.
 *
 * @param userId Resolved user identifier (LOCAL_USER_ID when anonymous).
 * @returns WorkspaceService implementation for smart import.
 */
export function createWorkspaceServiceLocal(userId: string): WorkspaceService {
  return {
    /**
     * Create a new workspace for a given purpose without activating it.
     *
     * @param purpose User-selected purpose.
     * @returns Workspace reference containing id and purpose.
     */
    async createWorkspaceForPurpose(purpose: PurposeIdType) {
      // Friendly default names per purpose
      const name = capitalize(purpose);

      const ws = await createLocalWorkspace(name, { setActive: false } );

      return { id: ws.id, purpose };
    },

    /**
     * Replace all groups in the workspace by writing with LocalAdapter + refreshing caches.
     *
     * @param workspaceId Target workspace identifier.
     * @param groups Categorized groups to persist.
     */
    async saveGroupsToWorkspace(
      workspaceId: string,
      groups: CategorizedGroup[]
    ): Promise<void> {
      const bookmarkGroups = mapToBookmarkGroups(groups);
      if (!bookmarkGroups.length) return;

      // Build the fully-qualified chrome.storage key for this *user* + workspace
      const groupsKey = getGroupsStorageKey(userId);
      const fullStorageKey = wsKey(
        workspaceId as any,
        groupsKey
      );

      // 1) Write all groups for this workspace
      await LocalAdapter.writeAllGroups(
        workspaceId as any,
        fullStorageKey,
        bookmarkGroups
      );

      // 2) Update first-paint + session mirrors for fast reopen / WS switching
      await LocalAdapter.persistCachesIfNonEmpty(
        workspaceId as any,
        bookmarkGroups
      );
    },

    /**
     * Append new groups to existing workspace data.
     *
     * @param workspaceId Target workspace identifier.
     * @param groups Categorized groups to append.
     */
    async appendGroupsToWorkspace(workspaceId: string, groups: CategorizedGroup[]): Promise<void> {
      const newGroups = mapToBookmarkGroups(groups);
      if (!newGroups.length) return;

      const groupsKey = getGroupsStorageKey(userId);
      const fullStorageKey = wsKey(workspaceId as any, groupsKey);

      // Read existing groups (whatever LocalAdapter.writeAllGroups stores)
      const obj = await chrome.storage.local.get(fullStorageKey);
      const existing = (obj?.[fullStorageKey] as BookmarkGroupType[] | undefined) ?? [];

      const merged = [...existing, ...newGroups];

      await LocalAdapter.writeAllGroups(workspaceId as any, fullStorageKey, merged);
      await LocalAdapter.persistCachesIfNonEmpty(workspaceId as any, merged);
    }
  };
}
