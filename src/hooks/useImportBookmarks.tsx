/* -------------------- Imports -------------------- */
import React, { useCallback, useMemo, useState } from 'react';

/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Components */
import ImportBookmarksModal from '@/components/modals/ImportBookmarksModal';

/* Utils */
import { createUniqueID } from '@/core/utils/ids';

/* Types */
import type { BookmarkGroupType } from '@/core/types/bookmarks';
import type { ImportChromeOpts } from '@/core/types/import';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type ImportPipelines = {
  importChromeBookmarksAsSingleGroup?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importMirrorFolders?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importByDomain?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importByTopic?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importOpenTabsAsSingleGroup?: (
    append:(gs:any[])=>Promise<void>,
    opts?: { scope?: 'current'|'all'; }
  ) => Promise<void> | void,
};
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
      emptyIndex = i;           // keep the first one we see
      return true;
    }
    return false;               // drop duplicates
  });

  if (emptyIndex === -1) return withoutDups; // none present

  if (!moveToEnd) return withoutDups;

  // Move the kept empty group to the end (common UX)
  const keptEmpty = withoutDups.find(isEmptyGroup)!;
  const rest = withoutDups.filter((g) => !isEmptyGroup(g));
  return [...rest, keptEmpty];
}

/**
 * Normalize raw import payloads into BookmarkGroupType structures.
 *
 * @param incoming Untrusted raw groups (e.g., from JSON).
 * @returns Array of bookmark groups with generated ids and normalized bookmarks.
 */
function normalizeGroups(incoming: any[]): BookmarkGroupType[] {
  return (incoming || []).map((g) => ({
    id: g.id ?? createUniqueID(),
    groupName: g.groupName ?? EMPTY_GROUP_IDENTIFIER,
    bookmarks: (g.bookmarks || []).map((b: any) => ({
      id: b.id ?? createUniqueID(),
      name: b.name || b.url || "Untitled",
      url: b.url,
      faviconUrl: b.faviconUrl,
      dateAdded: b.dateAdded,
    })),
  }));
}
/* ---------------------------------------------------------- */

/* -------------------- Public hook -------------------- */
/**
 * Hook that coordinates import flows (Chrome, JSON, tabs) and renders the associated modal.
 *
 * @param pipelines Optional pipeline adapters that define how to process each import path.
 * @returns Actions/state for opening/closing the modal and rendering it.
 */
export function useImportBookmarks(pipelines?: ImportPipelines) {
  const [isOpen, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { updateAndPersistGroups } = useBookmarkManager?.() ?? { updateAndPersistGroups: null };

  /**
   * Shared helper for inserting new groups into the bookmark state while preserving the empty placeholder behavior.
   *
   * @param groups Normalized group payloads to insert.
   */
  const insertGroups = useCallback(async (groups: any[]) => {
    if (typeof updateAndPersistGroups !== "function") {
      console.warn("updateAndPersistGroups not available; wire this to your state updater.");
      return;
    }
    await updateAndPersistGroups((prev: BookmarkGroupType[]) => {
      const normalized = normalizeGroups(groups);
  
      // insert before EMPTY, then collapse empties and move one to end
      const idx = prev.findIndex(isEmptyGroup);
      const merged =
        idx === -1
          ? [...prev, ...normalized]
          : [...prev.slice(0, idx), ...normalized, ...prev.slice(idx)];
  
      return ensureSingleEmpty(merged, /* moveToEnd */ true);
    });
  }, [updateAndPersistGroups]);

  /**
   * JSON import handler that appends groups to existing state.
   *
   * @param file Uploaded bookmarks HTML file.
   */
  const handleUploadJson = useCallback(async (file: File) => {
    const text = await file.text();
    const raw = JSON.parse(text);
    const normalized = normalizeGroups(raw);
    await updateAndPersistGroups?.((prev: BookmarkGroupType[]) =>
      ensureSingleEmpty(
        // reuse your insert-before-empty behavior:
        (() => {
          const idx = prev.findIndex(isEmptyGroup);
          return idx === -1
            ? [...prev, ...normalized]
            : [...prev.slice(0, idx), ...normalized, ...prev.slice(idx)];
        })(),
        true
      )
    );
  }, [updateAndPersistGroups]);

  /**
   * Chrome import handler that dispatches to the selected pipeline.
   *
   * @param param0 Options describing flat/smart mode and strategy.
   */
  const handleImportChrome = useCallback(async ({ mode, smartStrategy }: ImportChromeOpts) => {
    if (mode === 'flat' && pipelines?.importChromeBookmarksAsSingleGroup) {
      return pipelines.importChromeBookmarksAsSingleGroup(insertGroups);
    }
    if (mode === 'smart') {
      if (smartStrategy === 'folders' && pipelines?.importMirrorFolders) return pipelines.importMirrorFolders(insertGroups);
      if (smartStrategy === 'domain' && pipelines?.importByDomain) return pipelines.importByDomain(insertGroups);
      if (smartStrategy === 'topic' && pipelines?.importByTopic) return pipelines.importByTopic(insertGroups);
    }
    console.warn('No chrome import pipeline provided for', { mode, smartStrategy });
  }, [insertGroups, pipelines]);

  /**
   * Open tabs import handler that calls the relevant pipeline.
   *
   * @param opts Scope for tab capture and filtering flags.
   */
  const handleImportOpenTabs = useCallback(async (opts:{scope?:'current'|'all' }) => {
    if (pipelines?.importOpenTabsAsSingleGroup) {
      return pipelines.importOpenTabsAsSingleGroup(insertGroups, opts);
    }
    console.warn('No open-tabs import pipeline provided.');
  }, [insertGroups, pipelines]);

  const openImport = useCallback(() => setOpen(true), []);
  const closeImport = useCallback(() => setOpen(false), []);

  const renderModal = useCallback(() => (
    <ImportBookmarksModal
      isOpen={isOpen}
      onClose={closeImport}
      onUploadJson={async (f) => { setBusy(true); try { await handleUploadJson(f); closeImport(); } finally { setBusy(false); } }}
      onImportChrome={async (opts) => { setBusy(true); try { await handleImportChrome(opts); closeImport(); } finally { setBusy(false); } }}
      onImportOpenTabs={async (opts) => { setBusy(true); try { await handleImportOpenTabs(opts); closeImport(); } finally { setBusy(false); } }}
    />
  ), [isOpen, closeImport, handleUploadJson, handleImportChrome, handleImportOpenTabs]);

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
