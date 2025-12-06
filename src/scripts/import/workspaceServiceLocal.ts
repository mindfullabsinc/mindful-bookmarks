/* -------------------- Imports -------------------- */
/* Types */
import type { WorkspaceService } from "@/core/types/workspaces";
import type {
  BookmarkGroupType,
  BookmarkType,
} from "@/core/types/bookmarks";
import type { PurposeId } from "@shared/types/purposeId";
import type { CategorizedGroup } from "@shared/types/llmGrouping";

/* Constants */
import { wsKey } from "@/core/constants/workspaces";

/* Scripts and utils */
import { createLocalWorkspace } from "@/scripts/workspaces/registry";
import { getGroupsStorageKey } from "@/core/utils/storageKeys";
import { LocalAdapter } from "@/scripts/storageAdapters/local";
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
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
export function createWorkspaceServiceLocal(userId: string): WorkspaceService {
  return {
    async createWorkspaceForPurpose(purpose: PurposeId) {
      // Friendly default names per purpose
      const name =
        purpose === "work"
          ? "Work"
          : purpose === "school"
          ? "School"
          : "Personal";

      const ws = await createLocalWorkspace(name);

      return { id: ws.id, purpose };
    },

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
  };
}