/* -------------------- Imports -------------------- */
import React, { useEffect, useRef, useState } from "react";

import { ChromeImportOptions, OpenTabsOptions } from "@/core/types/import";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;
  onUploadJson: (file: File) => Promise<void> | void;
  onImportChrome: (options: ChromeImportOptions) => Promise<void> | void;
  onImportOpenTabs?: (options: OpenTabsOptions) => Promise<void> | void;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
/**
 * Reusable import bookmarks UI that supports both modal and embedded variants.
 *
 * @param props.variant Which presentation style to use.
 * @param props.onClose Optional close handler (used in modal mode).
 * @param props.onUploadJson Handler for Dropbox/HTML import.
 * @param props.onImportChrome Handler for Chrome bookmark imports.
 * @param props.onImportOpenTabs Optional handler for importing open tabs.
 */
export function ImportBookmarksContent({
  variant,
  onClose,
  onUploadJson,
  onImportChrome,
  onImportOpenTabs,
}: ImportBookmarksContentProps) {
  /* -------------------- Context / state -------------------- */
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Tabs: 'chrome' first as requested
  const [tab, setTab] = useState<"chrome" | "json">("chrome");

  // Busy + errors
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // JSON state
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  // Chrome (bookmarks) import state
  const [mode, setMode] = useState<"flat" | "smart">("flat");
  const [smartStrategy, setSmartStrategy] =
    useState<"folders" | "domain" | "topic">("folders");
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  // Source switch inside Chrome tab
  const [source, setSource] = useState<"bookmarks" | "tabs">("bookmarks");

  // Open tabs options
  const [tabScope, setTabScope] = useState<"current" | "all">("current");
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset state whenever the component unmounts or reopens (modal case).
   */
  useEffect(() => {
    return () => {
      setError(null);
      setBusy(false);
      setJsonFile(null);
      setMode("flat");
      setSmartStrategy("folders");
      setPermGranted(null);
      setSource("bookmarks");
      setTabScope("current");
      setTab("chrome");
    }
  }, []);

  /**
   * Close the modal on Escape key when not busy (embedded variant ignores because onClose may be undefined).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Request/confirm permission to read Chrome bookmarks.
   *
   * @returns True when permission is granted.
   */
  async function ensureBookmarksPermission(): Promise<boolean> {
    try {
      const has = await chrome.permissions.contains({ permissions: ["bookmarks"] });
      if (has) return true;
      return await chrome.permissions.request({ permissions: ["bookmarks"] });
    } catch (e) {
      console.warn("Permission check/request failed", e);
      return false;
    }
  }

  /**
   * Request/confirm permission to read open tabs.
   *
   * @returns True when permission is granted.
   */
  async function ensureTabsPermission(): Promise<boolean> {
    try {
      const has = await chrome.permissions.contains({
        permissions: ["tabs"],
        origins: ["<all_urls>"],
      });
      if (has) return true;
      return await chrome.permissions.request({
        permissions: ["tabs"],
        origins: ["<all_urls>"],
      });
    } catch (e) {
      console.warn("Tabs permission request failed", e);
      return false;
    }
  }

  /**
   * Handle the JSON import flow (button click + state updates).
   */
  async function handleJsonImport() {
    if (!jsonFile) return;
    try {
      setBusy(true);
      setError(null);
      await onUploadJson?.(jsonFile);
      onClose?.();
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Handle Chrome bookmarks or open tabs import flows based on the selected source.
   */
  async function handleChromeOrTabsImport() {
    try {
      setBusy(true);
      setError(null);

      if (source === "bookmarks") {
        const ok = await ensureBookmarksPermission();
        setPermGranted(ok);
        if (!ok) throw new Error("Permission to read Chrome bookmarks was not granted.");
        if (mode === "flat") {
          await onImportChrome?.({ mode: "flat" });
        } else {
          await onImportChrome?.({ mode: "smart", smartStrategy });
        }
      } else {
        // source === 'tabs'
        const ok = await ensureTabsPermission();
        if (!ok) throw new Error("Permission to read open tabs was not granted.");
        await onImportOpenTabs?.({
          scope: tabScope,
        });
      }

      onClose?.();
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering -------------------- */
  return (
    <div
      ref={dialogRef}
      role={variant === "modal" ? "dialog" : undefined}
      aria-modal={variant === "modal" ? "true" : undefined}
      aria-labelledby="import-title"
      className={
        variant === "modal"
          ? "relative z-10 w-[min(96vw,720px)] rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 max-h-[85vh] overflow-hidden"
          : "relative w-full rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 overflow-hidden"
      }
    >
      {/* Constrained internal layout */}
      <div className="grid grid-rows-[auto,auto,1fr,auto] max-h-[85vh]">
        {/* Header – hide in embedded; OnboardingOverlay already has a title */}
        {variant === "modal" && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h2
              id="import-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Import bookmarks
            </h2>
            <button
              onClick={() => !busy && onClose?.()}
              className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            {/* Chrome tab button */}
            <button
              className={
                "cursor-pointer px-3 py-1.5 rounded-lg transition " +
                (tab === "chrome"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200")
              }
              onClick={() => setTab("chrome")}
            >
              From Chrome
            </button>

            {/* JSON tab button */}
            <button
              className={
                "cursor-pointer ml-1 px-3 py-1.5 rounded-lg transition " +
                (tab === "json"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200")
              }
              onClick={() => setTab("json")}
            >
              Upload JSON
            </button>
          </div>
        </div>

        {/* Body (scrolls if tall) – this is your original content, unchanged */}
        <div className="px-5 py-4 overflow-y-auto">
          {/* JSON body */}
          {tab === "json" ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Import bookmarks from a JSON file exported from Mindful or another
                compatible manager.
              </p>
              <div className="rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
                <label
                  htmlFor="json-file-input"
                  className="block text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2"
                >
                  Choose JSON file
                </label>
                <input
                  id="json-file-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                  className="
                    file:cursor-pointer
                    block w-full text-sm
                    text-neutral-800 dark:text-neutral-100
                    file:mr-3 file:rounded-lg file:border-0
                    file:bg-neutral-100 file:px-4 file:py-2 file:text-neutral-800
                    hover:file:bg-neutral-200
                    dark:file:bg-neutral-800 dark:file:text-neutral-100
                    dark:hover:file:bg-neutral-700
                  "
                />

                {jsonFile && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Selected: {jsonFile.name}
                  </p>
                )}
              </div>
            </div>
          ) : (
            // Chrome body
            <div className="space-y-4">
              {/* Source selector */}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Source
                </span>
                <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <button
                    onClick={() => setSource("bookmarks")}
                    className={
                      "cursor-pointer px-3 py-1 rounded-md transition " +
                      (source === "bookmarks"
                        ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200")
                    }
                  >
                    Bookmarks
                  </button>
                  <button
                    onClick={() => setSource("tabs")}
                    className={
                      "cursor-pointer ml-1 px-3 py-1 rounded-md transition " +
                      (source === "tabs"
                        ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200")
                    }
                  >
                    Open Tabs
                  </button>
                </div>
              </div>

              {/* Help text */}
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {source === "bookmarks"
                  ? "Import directly from your existing Chrome bookmarks. You can add them into one group or categorize them automatically."
                  : "Import all visible http(s) tabs from the current or all windows into a single group."}
              </p>

              {/* Options */}
              {source === "bookmarks" ? (
                <>
                  {/* Mode selector */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setMode("flat")}
                      className={
                        "cursor-pointer flex items-start gap-3 rounded-2xl border p-4 text-left transition " +
                        (mode === "flat"
                          ? "border-blue-500 bg-blue-50/50 shadow-sm dark:border-blue-500/70 dark:bg-blue-950/30"
                          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700")
                      }
                    >
                      <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 ring-2 ring-blue-200 dark:bg-blue-400 dark:ring-blue-900" />
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          Flat import
                        </div>
                        <div className="text-sm text-neutral-600 dark:text-neutral-300">
                          Put everything into a single group:{" "}
                          <span className="italic">Imported from Chrome</span>.
                        </div>
                      </div>
                    </button>

                    {/* Smart mode remains commented out exactly as you had it */}
                    {/* ... */}
                  </div>

                  {permGranted === false && (
                    <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/30 dark:text-rose-200">
                      Permission to access Chrome bookmarks was not granted.
                    </div>
                  )}
                </>
              ) : (
                // Open tabs options
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {/* Scope card */}
                  <div className="cursor-pointer rounded-xl border border-neutral-200 p-4 text-left transition 
                                    dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700">
                    <div className="mb-2 text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      Scope
                    </div>
                    <div className="flex flex-col items-start gap-1 not-first:text-neutral-700 dark:not-first:text-neutral-300">
                      <label className="inline-flex items-center leading-tight">
                        <input
                          type="radio"
                          name="tabScope"
                          checked={tabScope === "current"}
                          onChange={() => setTabScope("current")}
                          className="cursor-pointer h-3 w-3 accent-blue-600 mr-2.5"
                        />
                        <span className="text-sm">Current window</span>
                      </label>
                      <label className="inline-flex items-center leading-tight">
                        <input
                          type="radio"
                          name="tabScope"
                          checked={tabScope === "all"}
                          onChange={() => setTabScope("all")}
                          className="cursor-pointer h-3 w-3 accent-blue-600 mr-2.5"
                        />
                        <span className="text-sm">All windows</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/30 dark:text-rose-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {busy
              ? "Importing… This may take a moment for large sets."
              : ""}
          </div>
          <div className="flex items-center gap-2">
            {/* Only show Cancel in modal variant */}
            {variant === "modal" && (
              <button
                onClick={() => !busy && onClose?.()}
                className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-850 dark:hover:text-neutral-800"
              >
                Cancel
              </button>
            )}

            {tab === "json" ? (
              <button
                onClick={handleJsonImport}
                disabled={!jsonFile || busy}
                className="cursor-pointer inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
              >
                {busy ? "Importing…" : "Import JSON"}
              </button>
            ) : (
              <button
                onClick={handleChromeOrTabsImport}
                disabled={busy}
                className="cursor-pointer inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
              >
                {busy
                  ? "Importing…"
                  : source === "bookmarks"
                  ? mode === "flat"
                    ? "Import (Flat from Bookmarks)"
                    : `Import (Smart: ${smartStrategy})`
                  : `Import from Open Tabs${
                      tabScope === "all" ? " (All)" : ""
                    }`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
