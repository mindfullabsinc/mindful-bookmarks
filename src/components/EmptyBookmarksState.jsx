import React, { useState, useEffect, useContext, useMemo } from "react";

/* Scripts */
import { AppContext } from "@/scripts/AppContextProvider";
import { importChromeBookmarksAsSingleGroup, importOpenTabsAsSingleGroup } from '@/scripts/Importers'; 

/* Hooks */
import useImportBookmarks from '@/hooks/useImportBookmarks';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/Constants";
import { StorageMode, StorageLabel } from "@/core/constants/storageMode";

const DISMISS_KEY = "mindful.emptyStateDismissed";

export default function EmptyBookmarksState({
  onCreateGroup,
  onImport, // optional
  onClose = () => {},
}) {
  const { bookmarkGroups, storageMode } = useContext(AppContext);

  const { openImport, renderModal } = useImportBookmarks({
    importChromeBookmarksAsSingleGroup,       // bookmarks → flat
    importOpenTabsAsSingleGroup,              // open tabs → flat   
  });

  const [checklist, setChecklist] = useState({
    createdGroup: false,
    addedBookmark: false,
    triedStorage: false,
  });

  /* Load saved checklist once */
  useEffect(() => {
    const saved = localStorage.getItem("mindful.emptyStateChecklist");
    if (saved) setChecklist(JSON.parse(saved));
  }, []);

  /* Persist checklist on change */
  useEffect(() => {
    localStorage.setItem(
      "mindful.emptyStateChecklist",
      JSON.stringify(checklist)
    );
  }, [checklist]);

  /* Has at least one real (named) group? */
  const hasNamedGroup = useMemo(
    () =>
      Array.isArray(bookmarkGroups) &&
      bookmarkGroups.some(
        (g) => g?.groupName && g.groupName !== EMPTY_GROUP_IDENTIFIER
      ),
    [bookmarkGroups]
  );

  /* Auto-check "Create a group" once a real group exists */
  useEffect(() => {
    if (hasNamedGroup) {
      setChecklist((c) => (c.createdGroup ? c : { ...c, createdGroup: true }));
    }
  }, [hasNamedGroup]);

  /* Has at least one real bookmark in a group? */
  const hasAnyBookmark = useMemo(
    () => (bookmarkGroups || []).some((g) => (g.bookmarks?.length || 0) > 0),
    [bookmarkGroups]
  );

  /* Auto-check "Add a bookmark" once at least one bookmark exists */
  useEffect(() => {
    if (hasAnyBookmark) {
      setChecklist((c) => (c.addedBookmark ? c : { ...c, addedBookmark: true }));
    }
  }, [hasAnyBookmark]);

  /* “Truly empty” = no groups OR only placeholder group(s) with zero bookmarks */
  const isTrulyEmpty = useMemo(
    () =>
      !Array.isArray(bookmarkGroups) ||
      bookmarkGroups.length === 0 ||
      bookmarkGroups.every(
        (g) =>
          g?.groupName === EMPTY_GROUP_IDENTIFIER &&
          (!g.bookmarks || g.bookmarks.length === 0)
      ),
    [bookmarkGroups]
  );

  /* Manual dismiss (X) */
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);
  const handleClose = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
    onClose?.();
  };

  /* Only self-dismiss when ALL steps are checked */
  const allChecked =
    checklist.createdGroup && checklist.addedBookmark && checklist.triedStorage;

  /* Visibility rule:
     - Hide if manually dismissed
     - Else show if dashboard is truly empty OR not all steps are checked */
  const shouldShow = !dismissed && (isTrulyEmpty || !allChecked);
  if (!shouldShow) return null;

  const Step = ({ id, label }) => (
    <label className="block">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          className="shrink-0 h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-blue-600
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          checked={checklist[id]}
          onChange={(e) =>
            setChecklist((c) => ({ ...c, [id]: e.target.checked }))
          }
        />
        <span
          className={
            (checklist[id]
              ? "line-through text-neutral-400 dark:text-neutral-500"
              : "text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100") +
            " text-sm leading-snug"
          }
        >
          {label}
        </span>
      </div>
    </label>
  );

  return (
    <section
      role="region"
      aria-label="Getting started with bookmarks"
      className="relative mx-auto mt-10 max-w-3xl rounded-2xl border bg-white/90 p-8 shadow-sm
                 border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/70
                 backdrop-blur supports-[backdrop-filter]:bg-white/70
                 dark:supports-[backdrop-filter]:bg-neutral-900/60"
    >
      {/* Close (X) */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close getting started panel"
        title="Close"
        className="cursor-pointer absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg
                   text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
                   dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800/60"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path
            fillRule="evenodd"
            d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 11-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full
                      border border-neutral-200 bg-white shadow-sm
                      dark:border-neutral-700 dark:bg-neutral-800">
        <img
          src="/assets/icon-no-bg-128.png"
          alt=""
          className="h-[30px] w-[30px] object-contain"
        />
      </div>

      {/* Copy */}
      <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        Welcome to Mindful
      </h2>
      <p className="mx-auto mt-3 max-w-prose text-center text-sm sm:text-left text-neutral-600 dark:text-neutral-400">
        Organize your links into groups. Create your first group to get
        started. Add unlimited bookmarks and switch between{" "}
        <span className="font-medium text-neutral-800 dark:text-neutral-200">
          {StorageLabel[storageMode]}
        </span>
        {" "}and{" "} 
        {storageMode === StorageMode.LOCAL ? StorageLabel[StorageMode.REMOTE] : StorageLabel[StorageMode.LOCAL]}
        {" "}storage modes.
      </p>

      {/* Primary actions */}
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          onClick={onCreateGroup}
          className="cursor-pointer inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-white shadow-sm
                     transition will-change-transform hover:-translate-y-0.5 hover:bg-blue-700
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 text-sm"
        >
          Create your first group
        </button>

        <button
          onClick={openImport}
          aria-label="Import bookmarks"
          className="cursor-pointer inline-flex items-center justify-center rounded-xl border px-5 py-2.5 transition
                    border-neutral-300 bg-white text-neutral-800 shadow-sm hover:bg-neutral-50
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70
                    dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-100
                    dark:shadow-[0_1px_3px_0_rgba(255,255,255,0.1)]
                    dark:hover:bg-neutral-700 dark:hover:border-neutral-400 text-sm"
        >
          Import bookmarks
        </button>
        {/* Import bookmarks modal, when visible */}
        {renderModal()}
      </div>

      {/* Mini checklist */}
      <div className="mt-8 rounded-xl border p-4
                      border-neutral-200 bg-neutral-50
                      dark:border-neutral-800 dark:bg-neutral-800/60 not-prose">
        <p className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Quick start
        </p>
        <div className="flex flex-col gap-2">
          <Step id="createdGroup" label="Create a group" />
          <Step id="addedBookmark" label="Add a link" />
          <Step id="triedStorage" label="Try Local ↔︎ Sync" />
        </div>
      </div>

      {/* Tiny help link */}
      {/* <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        New here?{" "}
        <a
          href="#how-it-works"
          className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          See how Mindful works
        </a>
      </p> */}
    </section>
  );
}
