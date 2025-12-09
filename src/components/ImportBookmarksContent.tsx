/* -------------------- Imports -------------------- */
import React, { useEffect, useRef, useState } from "react";

import type { 
  ImportSource,
  ChromeImportOptions, 
  OpenTabsOptions 
} from "@/core/types/import";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;
  onUploadJson: (file: File) => Promise<void> | void;
  onImportChrome: (options: ChromeImportOptions) => Promise<void> | void;
  onImportOpenTabs?: (options: OpenTabsOptions) => Promise<void> | void;
};

type WizardStep = 1 | 2 | 3;

type YesCheckboxRowProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
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

   // Sub-wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const isLastStep = step === 3;
  const [jsonYes, setJsonYes] = useState(false);
  const [bookmarksYes, setBookmarksYes] = useState(false);
  const [tabsYes, setTabsYes] = useState(false);
 
  // Busy + errors
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // JSON 
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  // Bookmarks 
  const [mode] = useState<"flat" | "smart">("flat"); // still only flat for now
  const [smartStrategy] = useState<"folders" | "domain" | "topic">("folders");
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  // Tabs 
  const [tabScope, setTabScope] = useState<"current" | "all">("current");
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset state whenever the component unmounts or reopens. 
   */
  useEffect(() => {
    return () => {
      setError(null);
      setBusy(false);
      setJsonFile(null);
      setJsonYes(false);
      setBookmarksYes(false);
      setTabsYes(false);
      setPermGranted(null);
      setTabScope("current");
      setStep(1);
    };
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
  async function runJsonImport(): Promise<boolean> {
    if (!jsonFile) return false;
    try {
      setBusy(true);
      setError(null);
      await onUploadJson(jsonFile);
      return true;
    } catch (e: any) {
      setError(e?.message || "Import failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Handle Chrome bookmarks import flow.
   */
  async function runBookmarksImport(): Promise<boolean> {
    try {
      setBusy(true);
      setError(null);
      const ok = await ensureBookmarksPermission();
      setPermGranted(ok);
      if (!ok) throw new Error("Permission to read Chrome bookmarks was not granted.");

      if (mode === "flat") {
        await onImportChrome({ mode: "flat" });
      } else {
        await onImportChrome({ mode: "smart", smartStrategy });
      }
      return true;
    } catch (e: any) {
      setError(e?.message || "Import failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

   /**
   * Handle open tabs import flow.
   */
  async function runTabsImport(): Promise<boolean> {
    if (!onImportOpenTabs) return true; // nothing to do
    try {
      setBusy(true);
      setError(null);
      const ok = await ensureTabsPermission();
      if (!ok) throw new Error("Permission to read open tabs was not granted.");
      await onImportOpenTabs({ scope: tabScope });
      return true;
    } catch (e: any) {
      setError(e?.message || "Import failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimary() {
    if (busy) return;

    // Step 1: JSON
    if (step === 1) {
      if (jsonYes) {
        setStep(2);
        return;
      }
      const ok = await runJsonImport();
      if (ok) setStep(2);
      return;
    }

    // Step 2: Chrome bookmarks
    if (step === 2) {
      if (bookmarksYes) {
        setStep(3);
        return;
      }
      const ok = await runBookmarksImport();
      if (ok) setStep(3);
      return;
    }

    // Step 3: open tabs
    if (step === 3) {
      if (tabsYes) {
        const ok = await runTabsImport();
        if (!ok) return;
      }
      // Done – close modal if present
      onClose?.();
    }
  }

  function handleBack() {
    if (busy) return;
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  }

  const primaryLabel = (() => {
    if (busy) return "Importing…";
    if (step === 1) {
      return jsonYes 
        ? "Import JSON & continue"
        : "Skip";
    }
    if (step === 2) {
      return bookmarksYes 
      ? "Import bookmarks & continue"
      : "Skip";
    }
    if (step === 3) {
      if (tabsYes) {
        return tabScope === "all"
          ? "Import open tabs (all windows)"
          : "Import open tabs";
      }
      return "Skip";
    }
  })();

  const primaryDisabled =
    busy || (step === 1 && jsonYes && !jsonFile);

  function renderStepHeader() {
    const title =
      step === 1
        ? "Do you have a JSON file to import?"
        : step === 2
        ? "Do you want to import your Chrome bookmarks?"
        : "Do you want to import your open tabs?";

    const subtitle =
      step === 1
        ? "If you exported from another bookmark manager (or from Mindful), you can bring that file in now. If you’re not sure what this is, just skip."
        : "";

    return (
      <>
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-500">
          <span>
            Step {step} of 3
          </span>
        </div>
        <h3 className="text-sm font-medium text-neutral-50">
          {title}
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          {subtitle}
        </p>
      </>
    );
  }

  function YesCheckboxRow({ checked, onToggle, label, description }: YesCheckboxRowProps) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={
          "mt-4 w-full text-left flex items-start gap-3 rounded-xl px-4 py-3 text-sm cursor-pointer transition " +
          (checked
            ? "bg-blue-500/10"
            : "bg-transparent hover:bg-neutral-900/40")
        }
      >
        {/* Square checkbox */}
        <span
          className={
            "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[11px] " +
            (checked
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-neutral-500 bg-transparent text-transparent")
          }
          aria-hidden="true"
        >
          ✓
        </span>

        <span className="flex flex-col">
          <span className="font-medium text-neutral-50">{label}</span>
          {description && (
            <span className="mt-0.5 text-xs text-neutral-400">
              {description}
            </span>
          )}
        </span>
      </button>
    );
  }

  function renderBody() {
    if (step === 1) {
      return (
        <div className="space-y-4">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={jsonYes}
            onToggle={() => setJsonYes((v) => !v)}
            label="Yes"
          />

          {jsonYes && (
            <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-4">
              <input
                id="json-file-input"
                type="file"
                accept="application/json,.json"
                onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                className="
                  file:cursor-pointer
                  block w-full text-xs
                  text-neutral-100
                  file:mr-3 file:rounded-lg file:border-0
                  file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-100
                  hover:file:bg-neutral-700
                "
              />
            </div>
          )}
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-4">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={bookmarksYes}
            onToggle={() => setBookmarksYes((v) => !v)}
            label="Yes"
          />

          {bookmarksYes && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                className="cursor-pointer flex items-start gap-3 rounded-2xl border border-neutral-700 p-4 text-left transition hover:border-neutral-500"
              >
                <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500 ring-2 ring-blue-900" />
                <div>
                  <div className="text-sm font-medium text-neutral-50">
                    Flat import
                  </div>
                  <div className="text-xs text-neutral-400">
                    Put everything into a single group:{" "}
                    <span className="italic">Imported from Chrome</span>.
                  </div>
                </div>
              </button>
              {/* Smart modes can come back later here */}
            </div>
          )}

          {permGranted === false && (
            <div className="rounded-xl border border-rose-900/60 bg-rose-900/30 px-4 py-3 text-xs text-rose-200">
              Permission to access Chrome bookmarks was not granted.
            </div>
          )}
        </div>
      );
    }

    // step === 3
    return (
      <div className="space-y-4">
        {renderStepHeader()}
        <YesCheckboxRow
          checked={tabsYes}
          onToggle={() => setTabsYes((v) => !v)}
          label="Yes"
        />

        {tabsYes && (
          <div className="mt-4 max-w-md">
            <div className="rounded-xl border border-neutral-700 p-4 text-left">
              <div className="mb-2 text-xs font-medium text-neutral-100">
                Which tabs?
              </div>
              <div className="flex flex-col items-start gap-1">
                <label className="inline-flex items-center leading-tight text-xs text-neutral-300">
                  <input
                    type="radio"
                    name="tabScope"
                    checked={tabScope === "current"}
                    onChange={() => setTabScope("current")}
                    className="cursor-pointer h-3 w-3 accent-blue-500 mr-2.5"
                  />
                  Current window
                </label>
                <label className="inline-flex items-center leading-tight text-xs text-neutral-300">
                  <input
                    type="radio"
                    name="tabScope"
                    checked={tabScope === "all"}
                    onChange={() => setTabScope("all")}
                    className="cursor-pointer h-3 w-3 accent-blue-500 mr-2.5"
                  />
                  All windows
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    );
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
          : "relative w-full rounded-2xl border border-neutral-800/70 bg-neutral-950/90 shadow-sm overflow-hidden"
      }
    >
      <div className="grid grid-rows-[auto,1fr,auto] max-h-[85vh]">
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
              ✕
            </button>
          </div>
        )}

        <div className="px-5 pt-3 pb-1 overflow-y-auto">
          {renderBody()}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-900/60 bg-rose-900/30 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pt-1 pb-3">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {busy
              ? "Importing… This may take a moment for large sets."
              : ""}
          </div>
          <div className="flex items-center gap-2">
            {variant === "modal" && (
              <button
                onClick={() => !busy && onClose?.()}
                className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-850 dark:hover:text-neutral-800"
              >
                Cancel
              </button>
            )}

            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={busy}
                className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-transparent px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handlePrimary}
              disabled={primaryDisabled}
              className="cursor-pointer inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
