import { jsx as _jsx } from "react/jsx-runtime";
/* -------------------- Imports -------------------- */
import { useCallback, useState } from 'react';
/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
/* Components */
import ImportBookmarksModal from '@/components/modals/ImportBookmarksModal';
/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";
/* Importers */
import { importChromeBookmarksPreserveStructure, importOpenTabsAsSingleGroup, } from "@/scripts/import/importers";
/* ---------------------------------------------------------- */
/* -------------------- Internal helper functions -------------------- */
/**
 * Determine whether a bookmark group is the empty placeholder.
 *
 * @param g Bookmark group to inspect.
 * @returns True when the group is the empty placeholder.
 */
const isEmptyGroup = (g) => g.id === EMPTY_GROUP_IDENTIFIER || g.groupName === EMPTY_GROUP_IDENTIFIER;
/**
 * Ensure only one empty group exists and optionally move it to the end for UX consistency.
 *
 * @param groups Bookmark groups to normalize.
 * @param moveToEnd Whether to relocate the placeholder group to the end.
 * @returns Normalized bookmark group array.
 */
function ensureSingleEmpty(groups, moveToEnd = true) {
    let emptyIndex = -1;
    const withoutDups = groups.filter((g, i) => {
        if (!isEmptyGroup(g))
            return true;
        if (emptyIndex === -1) {
            emptyIndex = i;
            return true;
        }
        return false;
    });
    if (emptyIndex === -1)
        return withoutDups;
    if (!moveToEnd)
        return withoutDups;
    // Move the kept empty group to the end (common UX)
    const keptEmpty = withoutDups.find(isEmptyGroup);
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
export function useImportBookmarks(opts) {
    /* -------------------- Local state -------------------- */
    const [isOpen, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selection, setSelection] = useState({});
    const { updateAndPersistGroups } = useBookmarkManager();
    /* ---------------------------------------------------------- */
    const defaultInsertGroups = useCallback(async (groups) => {
        await updateAndPersistGroups((prev) => {
            const idx = prev.findIndex(isEmptyGroup);
            const merged = idx === -1
                ? [...prev, ...groups]
                : [...prev.slice(0, idx), ...groups, ...prev.slice(idx)];
            return ensureSingleEmpty(merged, true);
        });
    }, [updateAndPersistGroups]);
    const insertGroups = opts?.insertGroupsOverride ?? defaultInsertGroups;
    const openImport = useCallback(() => setOpen(true), []);
    const closeImport = useCallback(() => setOpen(false), []);
    const runWithBusy = useCallback(async (fn) => {
        setBusy(true);
        try {
            await fn();
        }
        finally {
            setBusy(false);
        }
    }, []);
    /**
     * JSON import handler that appends groups to existing state.
     *
     * @param file Uploaded bookmarks HTML file.
     */
    const handleUploadJson = useCallback(async (file) => {
        const text = await file.text();
        const data = JSON.parse(text);
        await insertGroups(data);
    }, [insertGroups]);
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
    const handleImportOpenTabs = useCallback(async (tabOpts) => {
        await importOpenTabsAsSingleGroup(insertGroups, tabOpts);
    }, [insertGroups]);
    const renderModal = useCallback(() => (_jsx(ImportBookmarksModal, { isOpen: isOpen, onClose: closeImport })), [isOpen, closeImport]);
    return {
        openImport,
        closeImport,
        renderModal,
        busy,
        handleUploadJson,
        handleImportChrome,
        handleImportOpenTabs,
    };
}
export default useImportBookmarks;
