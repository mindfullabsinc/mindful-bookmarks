/* -------------------- Imports -------------------- */
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Components */
import ImportBookmarksModal from '@/components/modals/ImportBookmarksModal';

/* Types */
import type { BookmarkGroupType, BookmarkType } from '@/core/types/bookmarks';
import type { ManualImportSelectionType } from "@/core/types/import";

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";
import { StorageMode } from "@/core/constants/storageMode";

/* Context */
import { AppContext } from '@/scripts/AppContextProvider';
import type { AppContextValue } from '@/scripts/AppContextProvider';

/* Storage */
import { Storage } from '@/scripts/Storage';
import { createLocalWorkspace } from '@/scripts/workspaces/registry';

/* Importers */
import {
  importChromeBookmarksPreserveStructure,
  importOpenTabsAsSingleGroup,
} from "@/scripts/import/importers";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type InsertGroupsFn = (groups: BookmarkGroupType[]) => Promise<void>;
/* ---------------------------------------------------------- */

/* -------------------- Internal helper functions -------------------- */
/**
 * Determine whether a bookmark group is the empty placeholder.
 *
 * @param g Bookmark group to inspect.
 * @returns True when the group is the empty placeholder.
 */
const isEmptyGroup = (g: BookmarkGroupType) =>
  g.id === EMPTY_GROUP_IDENTIFIER || g.groupName === EMPTY_GROUP_IDENTIFIER;

/**
 * Ensure only one empty group exists and optionally move it to the end for UX consistency.
 *
 * @param groups Bookmark groups to normalize.
 * @param moveToEnd Whether to relocate the placeholder group to the end.
 * @returns Normalized bookmark group array.
 */
function ensureSingleEmpty(groups: BookmarkGroupType[], moveToEnd = true): BookmarkGroupType[] {
  let emptyIndex = -1;
  const withoutDups = groups.filter((g, i) => {
    if (!isEmptyGroup(g)) return true;
    if (emptyIndex === -1) {
      emptyIndex = i;
      return true;
    }
    return false;
  });

  if (emptyIndex === -1) return withoutDups;
  if (!moveToEnd) return withoutDups;

  // Move the kept empty group to the end (common UX)
  const keptEmpty = withoutDups.find(isEmptyGroup)!;
  const rest = withoutDups.filter((g) => !isEmptyGroup(g));
  return [...rest, keptEmpty];
}
/* ---------------------------------------------------------- */

/* -------------------- Public hook -------------------- */
/**
 * Hook that coordinates import flows (Chrome, JSON, tabs) and renders the associated modal.
 *
 * @param pipelines Optional pipeline adapters that define how to process each import path.
 * @returns Actions/state for opening/closing the modal and rendering it.
 */
export function useImportBookmarks(opts?: { insertGroupsOverride?: InsertGroupsFn }) {
  /* -------------------- Local state -------------------- */
  const [isOpen, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<ManualImportSelectionType>({});

  const { updateAndPersistGroups } = useBookmarkManager();
  const { userId } = useContext(AppContext) as AppContextValue;

  /**
   * Parse a JSON string and either create per-workspace entries (Tabme/Mindful
   * multi-workspace format) or fall back to inserting a flat group array.
   */
  const importJSON = useCallback(async (jsonText: string, fallbackInsert: InsertGroupsFn) => {
    const parsed = JSON.parse(jsonText);
    if (parsed && parsed.isTabme && (Array.isArray(parsed.workspaces) || Array.isArray(parsed.spaces))) {
      const spaces: any[] = Array.isArray(parsed.workspaces) ? parsed.workspaces : parsed.spaces;
      const localStorage = new Storage(StorageMode.LOCAL);
      for (const space of spaces) {
        const folders: any[] = Array.isArray(space.groups) ? space.groups : (space.folders ?? []);
        const groups: BookmarkGroupType[] = folders
          .filter((f: any) => f.objectType !== 'group')
          .map((folder: any) => ({
            id: uuidv4(),
            groupName: folder.title ?? 'Imported',
            bookmarks: ((folder.items ?? []) as any[])
              .filter((it) => it.objectType === 'bookmark' || it.type === 'bookmark')
              .map((it): BookmarkType => ({
                id: String(it.id ?? uuidv4()),
                name: (it.title as string) || (it.url as string) || '',
                url: (it.url as string) || '',
                ...(it.favIconUrl ? { faviconUrl: it.favIconUrl as string } : {}),
              })),
          }));
        if (groups.length === 0) continue;
        const ws = await createLocalWorkspace(space.title || 'Imported', { setActive: false });
        await localStorage.save(groups, userId!, ws.id);
      }
    } else if (Array.isArray(parsed)) {
      await fallbackInsert(parsed as BookmarkGroupType[]);
    } else {
      throw new Error("Unrecognized JSON format");
    }
  }, [userId]);
  /* ---------------------------------------------------------- */

  const defaultInsertGroups = useCallback<InsertGroupsFn>(async (groups) => {
    await updateAndPersistGroups((prev: BookmarkGroupType[]) => {
      const idx = prev.findIndex(isEmptyGroup);
      const merged =
        idx === -1
          ? [...prev, ...groups]
          : [...prev.slice(0, idx), ...groups, ...prev.slice(idx)];

      return ensureSingleEmpty(merged, true);
    });
  }, [updateAndPersistGroups]);

  const insertGroups = opts?.insertGroupsOverride ?? defaultInsertGroups;

  const openImport = useCallback(() => setOpen(true), []);
  const closeImport = useCallback(() => setOpen(false), []);

  const runWithBusy = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    }, []
  );

  /**
   * JSON import handler that appends groups to existing state.
   *
   * @param file Uploaded bookmarks HTML file.
   */
  const handleUploadJson = useCallback(async (file: File) => {
    const text = await file.text();
    await importJSON(text, insertGroups);
  }, [importJSON, insertGroups]);

  /**
   * Chrome import handler that dispatches to the selected pipeline.
   */
  const handleImportChrome = useCallback(async () => {
    // Preserve structure import (you can thread opts through if desired)
    await importChromeBookmarksPreserveStructure(insertGroups, {
      includeParentFolderBookmarks: true,
    });
  }, [insertGroups]);

  /**
   * Open tabs import handler that calls the relevant pipeline.
   *
   * @param tabOpts Scope for tab capture and filtering flags.
   */
  const handleImportOpenTabs = useCallback(
    async (tabOpts: { scope?: "current" | "all" }) => {
      await importOpenTabsAsSingleGroup(insertGroups, tabOpts);
    },
    [insertGroups]
  );

  const renderModal = useCallback(
    () => (
      <ImportBookmarksModal
        isOpen={isOpen}
        onClose={closeImport}
      />
    ),
    [isOpen, closeImport]
  );

  return {
    openImport,
    closeImport,
    renderModal,
    busy,
    handleUploadJson,
    handleImportChrome,
    handleImportOpenTabs,
  } as const;
}

export default useImportBookmarks;
/* ---------------------------------------------------------- */
