import React, { useCallback, useMemo, useState } from 'react';

/* Hooks */
import ImportBookmarksModal from '@/components/ImportBookmarksModal';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Scripts */
import { createUniqueID } from '@/core/utils/Utilities';
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/Constants";

export type SmartStrategy = 'folders' | 'domain' | 'topic';
export type ImportChromeOpts = { mode: 'flat' | 'smart'; smartStrategy?: SmartStrategy };

export type ImportPipelines = {
  // Provide one or many of these; the hook will call the ones you pass
  importChromeBookmarksAsSingleGroup?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importMirrorFolders?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importByDomain?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importByTopic?: (insertGroups: (groups: any[]) => Promise<void>) => Promise<void> | void,
  importOpenTabsAsSingleGroup?: (
    append:(gs:any[])=>Promise<void>,
    opts?: { scope?: 'current'|'all'; includePinned?: boolean; includeDiscarded?: boolean }
  ) => Promise<void> | void,
};

/**
 * useImportBookmarks
 * A reusable hook that:
 *  - exposes `openImport()` to trigger the modal
 *  - renders the `ImportBookmarksModal` for you via `renderModal()`
 *  - wires JSON + Chrome import handlers to your app state
 */
export function useImportBookmarks(pipelines?: ImportPipelines) {
  const [isOpen, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { updateAndPersistGroups } = useBookmarkManager?.() ?? { updateAndPersistGroups: null };

  const insertGroups = useCallback(async (groups: any[]) => {
    if (typeof updateAndPersistGroups !== "function") {
      console.warn("updateAndPersistGroups not available; wire this to your state updater.");
      return;
    }
    await updateAndPersistGroups((prev: Group[]) => {
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

  // Append mode
  const handleUploadJson = useCallback(async (file: File) => {
    const text = await file.text();
    const raw = JSON.parse(text);
    const normalized = normalizeGroups(raw);
    await updateAndPersistGroups?.((prev: Group[]) =>
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

  // Replace mode
  // const handleUploadJson = useCallback(async (file: File) => {
  //   const text = await file.text();
  //   const raw = JSON.parse(text);
  //   const normalized = normalizeGroups(raw);
  //   const cleaned = ensureSingleEmpty(normalized, /* moveToEnd */ true);
  //   await updateAndPersistGroups?.(() => cleaned);
  // }, [updateAndPersistGroups]);

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

  const handleImportOpenTabs = useCallback(async (opts:{scope?:'current'|'all'; includePinned?:boolean; includeDiscarded?:boolean}) => {
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
  } as const;
}

export default useImportBookmarks;


/* Helpers ------------------------------ */
type Group = {
  id: string;
  groupName: string;
  bookmarks: Array<{ id: string; name: string; url: string }>;
};

const isEmptyGroup = (g: Group) =>
  g.id === EMPTY_GROUP_IDENTIFIER || g.groupName === EMPTY_GROUP_IDENTIFIER;

function ensureSingleEmpty(groups: Group[], moveToEnd = true): Group[] {
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

function normalizeGroups(incoming: any[]): Group[] {
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
/* ------------------------------------- */