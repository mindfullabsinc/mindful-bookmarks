/* -------------------- Imports -------------------- */
import { useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';

import { AppContext } from '@/scripts/AppContextProvider';
import type { AppContextValue } from '@/scripts/AppContextProvider';
import { EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';
import { StorageMode, type StorageModeType } from '@/core/constants/storageMode';
import { DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';
import { refreshOtherMindfulTabs } from '@/core/utils/chrome';
import { Storage } from '@/scripts/Storage';
import type { BookmarkGroupType, BookmarkType } from '@/core/types/bookmarks';
import amplify_outputs from '../../amplify_outputs.json';
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const API_HOST_PATTERN = `https://${new URL(amplify_outputs.custom.API.bookmarks.endpoint).host}/*`;
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type BookmarkGroupsUpdater = (groups: BookmarkGroupType[]) => BookmarkGroupType[];
type BookmarkMoveLocation = { groupIndex: number; bookmarkIndex: number };

interface BookmarkManager {
  addEmptyBookmarkGroup: () => Promise<void>;
  addNamedBookmarkGroup: (groupName: string) => Promise<void>;
  deleteBookmarkGroup: (groupIndex: number) => Promise<void>;
  editBookmarkGroupHeading: (groupIdentifier: number | string, newHeadingName: string) => Promise<void>;
  reorderBookmarkGroups: (oldIndex: number, newIndex: number) => Promise<void>;
  addNamedBookmark: (bookmarkName: string, url: string, groupName: string) => Promise<void>;
  deleteBookmark: (bookmarkIndex: number, groupIndex: number) => Promise<void>;
  editBookmarkName: (groupIndex: number, bookmarkIndex: number, newBookmarkName: string) => Promise<void>;
  reorderBookmarks: (oldBookmarkIndex: number, newBookmarkIndex: number, groupIndex: number) => Promise<void>;
  moveBookmark: (source: BookmarkMoveLocation, destination: BookmarkMoveLocation) => Promise<void>;
  exportBookmarksToJSON: () => void;
  importBookmarksFromJSON: () => void;
  changeStorageMode: (newStorageMode: StorageModeType) => Promise<void>;
  updateAndPersistGroups: (updater: BookmarkGroupsUpdater) => Promise<BookmarkGroupType[]>;
}
/* ---------------------------------------------------------- */

/**
 * Create a deep-ish clone of bookmark groups so mutations do not taint the original state tree.
 *
 * @param groups Source bookmark groups array.
 * @returns New array with cloned group and bookmark objects.
 */
const cloneGroups = (groups: BookmarkGroupType[]): BookmarkGroupType[] =>
  groups.map(group => ({
    ...group,
    bookmarks: group.bookmarks.map(bookmark => ({ ...bookmark })),
  }));

/**
 * Ensure the browser has host permissions necessary for remote bookmark operations.
 *
 * @returns Promise resolving to true when permission exists or is granted.
 */
async function ensureApiHostPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true; // in tests, etc.
  const hasPermission = await chrome.permissions.contains({ origins: [API_HOST_PATTERN] });
  if (hasPermission) return true;
  // Must be called from a user gesture (e.g., the click that triggers changeStorageMode)
  return chrome.permissions.request({ origins: [API_HOST_PATTERN] });
}

/**
 * Remove optional remote API host permissions when no longer needed.
 *
 * @returns Promise that resolves after attempting to drop the permission.
 */
async function maybeRemoveApiHostPermission(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return;
  const hasPermission = await chrome.permissions.contains({ origins: [API_HOST_PATTERN] });
  if (hasPermission) await chrome.permissions.remove({ origins: [API_HOST_PATTERN] });
}

// --- The Custom Hook ---

/**
 * Expose bookmark CRUD helpers backed by the current storage mode (local or remote).
 *
 * @returns Collection of bookmark management helpers bound to app context.
 */
export const useBookmarkManager = (): BookmarkManager => {
  const {
    bookmarkGroups,
    setBookmarkGroups,
    userId,
    activeWorkspaceId,
    storageMode,
    setStorageMode,
    setIsMigrating,
  } = useContext(AppContext) as AppContextValue;

  const resolvedWorkspaceId = activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID;
  const storage = new Storage(storageMode);

  /**
   * Apply a transformation to the current bookmark groups and persist the result.
   *
   * @param updater Pure function that returns the next bookmark groups array.
   * @returns Promise resolving to the updated bookmark groups.
   */
  const updateAndPersistGroups = (updater: BookmarkGroupsUpdater): Promise<BookmarkGroupType[]> => {
    return new Promise((resolve, reject) => {
      setBookmarkGroups(currentGroups => {
        const safeGroups = currentGroups ?? [];
        const newGroups = updater(safeGroups);

        if (!userId) {
          const error = new Error("Cannot save: userId is not available.");
          console.error(error.message);
          reject(error);
          return safeGroups;
        }

        storage
          .save(newGroups, userId, resolvedWorkspaceId)
          .then(() => {
            // Always notify other views (new tab, options, other popups)
            refreshOtherMindfulTabs();
            resolve(newGroups); // resolve with the updated value for convenience
          })
          .catch(error => {
            console.error(`Failed to save bookmarks to ${storageMode}:`, error);
            reject(error);
          });

        return newGroups; // immediate UI update in this view (the popup)
      });
    });
  };

  /**
   * Migrate user bookmarks between storage modes, optionally requesting host permissions.
   *
   * @param newStorageMode Target storage mode the user selected.
   * @returns Promise that resolves once migration completes.
   */
  const changeStorageMode = async (newStorageMode: StorageModeType): Promise<void> => {
    if (!userId) {
      throw new Error("Cannot change storage type: User not signed in.");
    }

    const oldStorageMode = storageMode;
    if (newStorageMode === oldStorageMode) {
      return;
    }

    console.log(`Migrating bookmarks from ${oldStorageMode} to ${newStorageMode}...`);
    setIsMigrating(true);

    try {
      // If enabling cloud/remote, make sure we have the optional host permission
      if (newStorageMode === StorageMode.REMOTE) {
        const granted = await ensureApiHostPermission();
        if (!granted) {
          console.warn("User denied API host permission; staying on local storage.");
          return; // bail without changing storageMode
        }
      }

      const oldStorage = new Storage(oldStorageMode ?? StorageMode.LOCAL);
      const newStorage = new Storage(newStorageMode);

      // Instead of using the potentially stale 'bookmarkGroups' from React state,
      // we load the fresh data directly from the source before migrating.
      const dataToMigrate = await oldStorage.load(userId, resolvedWorkspaceId);
      console.log("Data to migrate:", dataToMigrate);

      // 1. Save fresh data to the new location
      await newStorage.save(dataToMigrate, userId, resolvedWorkspaceId);

      // 2. Delete data from the old location
      await oldStorage.delete(userId, resolvedWorkspaceId);

      // 3. Update the application's context to reflect the change
      await setStorageMode(newStorageMode);

      console.log("Storage migration completed successfully.");

      // If leaving remote for local, drop the host_permission
      if (oldStorageMode === StorageMode.REMOTE && newStorageMode !== StorageMode.REMOTE) {
        await maybeRemoveApiHostPermission();
      }
    } catch (error) {
      console.error(`Failed to migrate storage from ${oldStorageMode} to ${newStorageMode}:`, error);
      throw error;
    } finally {
      setIsMigrating(false);
    }
  };

  /**
   * Ensure there is an empty placeholder group available for new bookmark creation.
   *
   * @returns Promise that resolves after the empty group exists.
   */
  const addEmptyBookmarkGroup = async (): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const newGroup: BookmarkGroupType = {
        groupName: EMPTY_GROUP_IDENTIFIER,
        bookmarks: [],
        id: uuidv4(),
      };
      return [...prevGroups, newGroup];
    });
  };

  /**
   * Create a new bookmark group with the provided name.
   *
   * @param groupName Name for the new group.
   * @returns Promise resolving when the group has been added.
   */
  const addNamedBookmarkGroup = async (groupName: string): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const newGroup: BookmarkGroupType = {
        groupName,
        bookmarks: [],
        id: uuidv4(),
      };
      const updatedGroups = [...prevGroups];
      const emptyGroupIndex = updatedGroups.findIndex(g => g.groupName === EMPTY_GROUP_IDENTIFIER);
      if (emptyGroupIndex !== -1) {
        updatedGroups.splice(emptyGroupIndex, 0, newGroup);
      } else {
        updatedGroups.push(newGroup);
      }
      return updatedGroups;
    });
  };

  /**
   * Delete a bookmark group by its index.
   *
   * @param groupIndex Index of the group to remove.
   * @returns Promise that resolves once the group is removed.
   */
  const deleteBookmarkGroup = async (groupIndex: number): Promise<void> => {
    await updateAndPersistGroups(prevGroups => prevGroups.filter((_, index) => index !== groupIndex));
  };

  /**
   * Rename an existing bookmark group by index or id.
   *
   * @param groupIdentifier Numeric index or string id of the group.
   * @param newHeadingName New group name to apply.
   * @returns Promise that resolves after the heading is updated.
   */
  const editBookmarkGroupHeading = async (
    groupIdentifier: number | string,
    newHeadingName: string
  ): Promise<void> => {
    await updateAndPersistGroups(prevGroups =>
      prevGroups.map((group, index) => {
        const isMatch =
          typeof groupIdentifier === "number"
            ? index === groupIdentifier
            : group.id === groupIdentifier;

        return isMatch ? { ...group, groupName: newHeadingName } : group;
      })
    );
  };

  /**
   * Reorder bookmark groups using a drag-and-drop style move.
   *
   * @param oldIndex Original group index.
   * @param newIndex Target group index.
   * @returns Promise resolving once the order has been persisted.
   */
  const reorderBookmarkGroups = async (oldIndex: number, newIndex: number): Promise<void> => {
    await updateAndPersistGroups(prevGroups => arrayMove(prevGroups, oldIndex, newIndex));
  };

  /**
   * Delete a bookmark from a specific group.
   *
   * @param bookmarkIndex Index of the bookmark to remove.
  * @param groupIndex Index of the group containing the bookmark.
   * @returns Promise that resolves after deletion.
   */
  const deleteBookmark = async (bookmarkIndex: number, groupIndex: number): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = cloneGroups(prevGroups);
      if (updatedGroups[groupIndex]?.bookmarks[bookmarkIndex]) {
        updatedGroups[groupIndex].bookmarks.splice(bookmarkIndex, 1);
      } else {
        console.error("Error: Tried to delete a bookmark that doesn't exist.", { groupIndex, bookmarkIndex });
      }
      return updatedGroups;
    });
  };

  /**
   * Update the display name for an existing bookmark.
   *
   * @param groupIndex Index of the parent group.
   * @param bookmarkIndex Index of the bookmark within that group.
   * @param newBookmarkName New bookmark name to set.
   * @returns Promise resolving once the bookmark is updated.
   */
  const editBookmarkName = async (
    groupIndex: number,
    bookmarkIndex: number,
    newBookmarkName: string
  ): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = cloneGroups(prevGroups);
      if (updatedGroups[groupIndex]?.bookmarks[bookmarkIndex]) {
        updatedGroups[groupIndex].bookmarks[bookmarkIndex].name = newBookmarkName;
      } else {
        console.error("Error: Tried to edit a bookmark name for an item that doesn't exist.", { groupIndex, bookmarkIndex });
      }
      return updatedGroups;
    });
  };

  /**
   * Append a new bookmark to the specified group, creating the group if necessary.
   *
   * @param bookmarkName Display name for the bookmark.
   * @param url Bookmark URL.
   * @param groupName Group to place the bookmark in.
   * @returns Promise resolving when the bookmark has been added.
   */
  const addNamedBookmark = async (bookmarkName: string, url: string, groupName: string): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const newBookmark: BookmarkType = { name: bookmarkName, url, id: uuidv4() };
      const updatedGroups = cloneGroups(prevGroups);
      const groupIndex = updatedGroups.findIndex(g => g.groupName === groupName);

      if (groupIndex !== -1) {
        updatedGroups[groupIndex].bookmarks.push(newBookmark);
      } else {
        const newGroup: BookmarkGroupType = { groupName, id: uuidv4(), bookmarks: [newBookmark] };
        const emptyGroupIndex = updatedGroups.findIndex(g => g.groupName === EMPTY_GROUP_IDENTIFIER);
        if (emptyGroupIndex !== -1) {
          updatedGroups.splice(emptyGroupIndex, 0, newGroup);
        } else {
          updatedGroups.push(newGroup);
        }
      }
      return updatedGroups;
    });
  };

  /**
   * Reorder bookmarks within a group.
   *
   * @param oldBookmarkIndex Original bookmark index.
   * @param newBookmarkIndex Destination bookmark index.
   * @param groupIndex Index of the group to reorder within.
   * @returns Promise resolving once persisted.
   */
  const reorderBookmarks = async (
    oldBookmarkIndex: number,
    newBookmarkIndex: number,
    groupIndex: number
  ): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = cloneGroups(prevGroups);
      const group = updatedGroups[groupIndex];
      if (group) {
        group.bookmarks = arrayMove(group.bookmarks, oldBookmarkIndex, newBookmarkIndex);
      } else {
        console.error("Reorder failed: could not find the group.");
      }
      return updatedGroups;
    });
  };

  /**
   * Move a bookmark between groups (or within the same group) at a specific index.
   *
   * @param source Source group/index information.
   * @param destination Destination group/index information.
   * @returns Promise that resolves when the move is complete.
   */
  const moveBookmark = async (
    source: BookmarkMoveLocation,
    destination: BookmarkMoveLocation
  ): Promise<void> => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = cloneGroups(prevGroups);
      const sourceGroup = updatedGroups[source.groupIndex];
      const destinationGroup = updatedGroups[destination.groupIndex];
      if (!sourceGroup || !destinationGroup || !sourceGroup.bookmarks[source.bookmarkIndex]) {
        console.error("Move failed: invalid source or destination.", { source, destination });
        return prevGroups; // Return original state if move is invalid
      }
      const [movedBookmark] = sourceGroup.bookmarks.splice(source.bookmarkIndex, 1);
      destinationGroup.bookmarks.splice(destination.bookmarkIndex, 0, movedBookmark);
      return updatedGroups;
    });
  };

  /**
   * Download the current bookmark groups as a formatted JSON file.
   */
  const exportBookmarksToJSON = (): void => {
    if (!bookmarkGroups || bookmarkGroups.length === 0) {
        console.warn("No bookmarks to export.");
        return;
    }
    const jsonData = JSON.stringify(bookmarkGroups, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindful_bookmarks.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Prompt the user for a JSON export file and load bookmarks from its contents.
   */
  const importBookmarksFromJSON = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const contents = e.target?.result;
          if (typeof contents !== 'string') {
            throw new Error("Unexpected file contents");
          }
          const data = JSON.parse(contents) as BookmarkGroupType[];
          updateAndPersistGroups(() => data);
          console.log("Bookmarks successfully imported and saved.");
        } catch (error) {
          console.error("Failed to read or parse the bookmarks file:", error);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    addEmptyBookmarkGroup,
    addNamedBookmarkGroup,
    deleteBookmarkGroup,
    editBookmarkGroupHeading,
    reorderBookmarkGroups,
    addNamedBookmark,
    deleteBookmark,
    editBookmarkName,
    reorderBookmarks,
    moveBookmark,
    exportBookmarksToJSON,
    importBookmarksFromJSON,
    changeStorageMode,
    updateAndPersistGroups,
  };
};
