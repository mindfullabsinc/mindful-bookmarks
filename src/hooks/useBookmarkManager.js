import { useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import { AppContext } from '@/scripts/AppContextProvider';
import { EMPTY_GROUP_IDENTIFIER, StorageType } from '@/scripts/Constants';
import { refreshOtherMindfulTabs } from '@/scripts/Utilities';
import { Storage } from '@/scripts/Storage';
import amplify_outputs from '/amplify_outputs.json';

const API_HOST_PATTERN = `https://${new URL(amplify_outputs.custom.API.bookmarks.endpoint).host}/*`;

// Ask for host_permissions only when needed & only once
async function ensureApiHostPermission() {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true; // in tests, etc.
  const has_permissions = await chrome.permissions.contains({ origins: [API_HOST_PATTERN] });
  if (has_permissions) return true;
  // Must be called from a user gesture (e.g., the click that triggers changeStorageType)
  return chrome.permissions.request({ origins: [API_HOST_PATTERN] });
}

// Tidy up host_permissions when leaving cloud storage
async function maybeRemoveApiHostPermission() {
  if (typeof chrome === 'undefined' || !chrome.permissions) return;
  const has_permissions = await chrome.permissions.contains({ origins: [API_HOST_PATTERN] });
  if (has_permissions) await chrome.permissions.remove({ origins: [API_HOST_PATTERN] });
}

// --- The Custom Hook ---

export const useBookmarkManager = () => {
  const { bookmarkGroups, setBookmarkGroups, userId, storageType, setStorageType, setIsMigrating } = useContext(AppContext);
  const storage = new Storage(storageType);

  const updateAndPersistGroups = (updater) => {
    return new Promise((resolve, reject) => {
      setBookmarkGroups(currentGroups => {
        const newGroups = updater(currentGroups);
  
        if (!userId) {
          const error = new Error("Cannot save: userId is not available.");
          console.error(error.message);
          reject(error);
          return newGroups;
        }
  
        storage.save(newGroups, userId)
          .then(() => {
            // Always notify other views (new tab, options, other popups)
            refreshOtherMindfulTabs();
            resolve(newGroups); // resolve with the updated value for convenience
          })
          .catch(error => {
            console.error(`Failed to save bookmarks to ${storageType}:`, error);
            reject(error);
          });
  
        return newGroups; // immediate UI update in this view (the popup)
      });
    });
  }; 

  const changeStorageType = async (newStorageType) => {
    if (!userId) {
      throw new Error("Cannot change storage type: User not signed in.");
    }

    const oldStorageType = storageType;
    if (newStorageType === oldStorageType) {
      return;
    }
    
    console.log(`Migrating bookmarks from ${oldStorageType} to ${newStorageType}...`);
    setIsMigrating(true);

    try {
      // If enabling cloud/remote, make sure we have the optional host permission
      if (newStorageType === StorageType.REMOTE) {
        const granted = await ensureApiHostPermission();
        if (!granted) {
          console.warn("User denied API host permission; staying on local storage.");
          return; // bail without changing storageType
        }
      }

      const oldStorage = new Storage(oldStorageType);
      const newStorage = new Storage(newStorageType);

      // Instead of using the potentially stale 'bookmarkGroups' from React state,
      // we load the fresh data directly from the source before migrating.
      const dataToMigrate = await oldStorage.load(userId);
      console.log("Data to migrate:", dataToMigrate);

      // 1. Save fresh data to the new location
      await newStorage.save(dataToMigrate, userId);

      // 2. Delete data from the old location
      await oldStorage.delete(userId);

      // 3. Update the application's context to reflect the change
      setStorageType(newStorageType);

      console.log("Storage migration completed successfully.");

      // If leaving remote for local, drop the host_permission
      if (oldStorageType === StorageType.REMOTE && newStorageType !== StorageType.REMOTE) {
        await maybeRemoveApiHostPermission();
      }

    } catch (error) {
      console.error(`Failed to migrate storage from ${oldStorageType} to ${newStorageType}:`, error);
      throw error;
    } finally {
      setIsMigrating(false);
    }
  };

  // --- ALL OTHER FUNCTIONS REMAIN UNCHANGED ---

  const addEmptyBookmarkGroup = async () => {
    await updateAndPersistGroups(prevGroups => {
        const newGroup = {
            groupName: EMPTY_GROUP_IDENTIFIER,
            bookmarks: [],
            id: uuidv4(),
        };
        return [...prevGroups, newGroup];
    });
  };

  const addNamedBookmarkGroup = async (groupName) => {
    await updateAndPersistGroups(prevGroups => {
      console.log("Calling addNamedBookmarkGroup");
      
      const newGroup = {
          groupName: groupName,
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

  const deleteBookmarkGroup = async (groupIndex) => {
    await updateAndPersistGroups(prevGroups => prevGroups.filter((_, index) => index !== groupIndex));
  };

  const editBookmarkGroupHeading = async (groupIdentifier, newHeadingName) => {
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

  const reorderBookmarkGroups = async (oldIndex, newIndex) => {
    await updateAndPersistGroups(prevGroups => arrayMove(prevGroups, oldIndex, newIndex));
  };

  const deleteBookmark = async (bookmarkIndex, groupIndex) => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = JSON.parse(JSON.stringify(prevGroups));
      if (updatedGroups[groupIndex]?.bookmarks[bookmarkIndex]) {
        updatedGroups[groupIndex].bookmarks.splice(bookmarkIndex, 1);
      } else {
        console.error("Error: Tried to delete a bookmark that doesn't exist.", { groupIndex, bookmarkIndex });
      }
      return updatedGroups;
    });
  };

  const editBookmarkName = async (groupIndex, bookmarkIndex, newBookmarkName) => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = JSON.parse(JSON.stringify(prevGroups));
      if (updatedGroups[groupIndex]?.bookmarks[bookmarkIndex]) {
        updatedGroups[groupIndex].bookmarks[bookmarkIndex].name = newBookmarkName;
      } else {
        console.error("Error: Tried to edit a bookmark name for an item that doesn't exist.", { groupIndex, bookmarkIndex });
      }
      return updatedGroups;
    });
  };

  const addNamedBookmark = async (bookmarkName, url, groupName) => {
    await updateAndPersistGroups(prevGroups => {
      const newBookmark = { name: bookmarkName, url: url, id: uuidv4() };
      const updatedGroups = JSON.parse(JSON.stringify(prevGroups));
      const groupIndex = updatedGroups.findIndex(g => g.groupName === groupName);

      if (groupIndex !== -1) {
        updatedGroups[groupIndex].bookmarks.push(newBookmark);
      } else {
        const newGroup = { groupName: groupName, id: uuidv4(), bookmarks: [newBookmark] };
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

  const reorderBookmarks = async (oldBookmarkIndex, newBookmarkIndex, groupIndex) => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = JSON.parse(JSON.stringify(prevGroups));
      const group = updatedGroups[groupIndex];
      if (group) {
        group.bookmarks = arrayMove(group.bookmarks, oldBookmarkIndex, newBookmarkIndex);
      } else {
        console.error("Reorder failed: could not find the group.");
      }
      return updatedGroups;
    });
  };

  const moveBookmark = async (source, destination) => {
    await updateAndPersistGroups(prevGroups => {
      const updatedGroups = JSON.parse(JSON.stringify(prevGroups));
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

  const exportBookmarksToJSON = () => {
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

  const importBookmarksFromJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const contents = e.target.result;
          const data = JSON.parse(contents);
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
    changeStorageType,
    updateAndPersistGroups,
  };
};
