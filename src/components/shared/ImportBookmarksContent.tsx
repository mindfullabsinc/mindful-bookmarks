/* -------------------- Imports -------------------- */
import React, { useEffect, useRef, useState } from "react";

/* Types */
import type { 
  ChromeImportOptions, 
  OpenTabsOptions 
} from "@/core/types/import";

/* Styles */
import '@/styles/components/shared/ImportBookmarksContent.css'
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;     // Closing the modal
  onComplete?: () => void;  // Wizard finished (embedded or modal)
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
  onComplete,
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

  /**
   * Primary CTA click handler for navigating the wizard and kicking off imports.
   */
  async function handlePrimary() {
    if (busy) return;

    // Step 1: JSON
    if (step === 1) {
      if (!jsonYes) {
        // User said "No" --> genuinely skip JSON import
        setStep(2);
        return;
      }
      // User said "Yes" --> try to import
      const ok = await runJsonImport();
      if (ok) setStep(2);
      return;
    }

    // Step 2: Chrome bookmarks
    if (step === 2) {
      console.log("Got to step 2: Chrome bookmarks");
      if (!bookmarksYes) {
        // User said "No" --> genuinely skip bookmarks import
        setStep(3);
        return;
      }
      // User said "Yes" --> try to import
      const ok = await runBookmarksImport();
      if (ok) setStep(3);
      return;
    }

    // Step 3: open tabs
    if (step === 3) {
      console.log("Got to step 3: open tabs");
      if (tabsYes) {
        const ok = await runTabsImport();
        if (!ok) return;
      }
      // Done -- completes the manual onboarding process. If modal, also closes the modal.
      finishWizard();
    }
  }

  /**
   * Navigate to the previous wizard step when possible.
   */
  function handleBack() {
    if (busy) return;
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  }

  /**
   * Centralized logic to notify that the manual import wizard is complete. 
   */
  function finishWizard() {
    console.log("Calling finishWizard");

    // Always notify completion if provided
    onComplete?.();

    // In modal mode, also close the dialog
    if (variant === "modal") {
      onClose?.();
    }
  }

  /**
   * Compute the primary button label based on the current wizard step and selections.
   */
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
          : "Import open tabs (current window)";
      }
      return "Skip";
    }
  })();

  const primaryDisabled =
    busy || (step === 1 && jsonYes && !jsonFile);

  /**
   * Render the wizard step header for the current step.
   */
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
        <div className="step-progress">
          <span>
            Step {step} of 3
          </span>
        </div>
        <h3 className="step-title">
          {title}
        </h3>
        <p className="step-subtitle">
          {subtitle}
        </p>
      </>
    );
  }

  /**
   * Checkbox row component used to capture yes/no answers on each import step.
   */
  function YesCheckboxRow({ checked, onToggle, label, description }: YesCheckboxRowProps) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={
          "checkbox-row " +
          (checked
            ? "checkbox-row--checked"
            : "checkbox-row--unchecked")
        }
      >
        {/* Square checkbox */}
        <span
          className={
            "checkbox-box " +
            (checked
              ? "checkbox-box--checked"
              : "checkbox-box--unchecked")
          }
          aria-hidden="true"
        >
          ✓
        </span>

        <span className="checkbox-label-container">
          <span className="checkbox-label">{label}</span>
          {description && (
            <span className="checkbox-label-description">
              {description}
            </span>
          )}
        </span>
      </button>
    );
  }

  /**
   * Render the body content for the current wizard step.
   */
  function renderBody() {
    if (step === 1) {
      return (
        <div className="body-container">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={jsonYes}
            onToggle={() => setJsonYes((v) => !v)}
            label="Yes"
          />

          {jsonYes && (
            <div className="json-input-container">
              <input
                id="json-file-input"
                type="file"
                accept="application/json,.json"
                onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                className="json-input"
              />
            </div>
          )}
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="body-container">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={bookmarksYes}
            onToggle={() => setBookmarksYes((v) => !v)}
            label="Yes"
          />

          {permGranted === false && (
            <div className="bookmarks-permissions-warning error-message">
              Permission to access Chrome bookmarks was not granted.
            </div>
          )}
        </div>
      );
    }

    // step === 3
    return (
      <div className="body-container">
        {renderStepHeader()}
        <YesCheckboxRow
          checked={tabsYes}
          onToggle={() => setTabsYes((v) => !v)}
          label="Yes"
        />

        {tabsYes && (
          <div className="tabs-container">
            <h3 className="tabs-header">
              Which tabs?
            </h3>

            <div className="tabs-windows-container">

              {/* All windows */}
              <button
                type="button"
                onClick={() => setTabScope("all")}
                className={`tabs-radio-button-row
                  ${tabScope === "all"
                    ? "tabs-radio-button-row--selected"
                    : "tabs-radio-button-row--unselected"
                  }
                `}
              >
                <div
                  className={`
                    tabs-radio-button-outer-circle
                    ${tabScope === "all"
                      ? "tabs-radio-button-outer-circle--selected"
                      : "tabs-radio-button-outer-circle--unselected"
                    }
                  `}
                >
                  {tabScope === "all" && (
                    <div className="tabs-radio-button-inner-circle" />
                  )}
                </div>
                <span className="tabs-radio-button-text">All windows</span>
              </button>

              {/* Current window */}
              <button
                type="button"
                onClick={() => setTabScope("current")}
                className={`tabs-radio-button-row
                  ${tabScope === "current"
                    ? "tabs-radio-button-row--selected"
                    : "tabs-radio-button-row--unselected"
                  }
                `}
              >
                <div
                  className={`
                    tabs-radio-button-outer-circle 
                    ${tabScope === "current"
                      ? "tabs-radio-button-outer-circle--selected"
                      : "tabs-radio-button-outer-circle--unselected"
                    }
                  `}
                >
                  {tabScope === "current" && (
                    <div className="tabs-radio-button-inner-circle" />
                  )}
                </div>
                <span className="tabs-radio-button-text">Current window</span>
              </button>
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
          ? "modal-container"
          : "embedded-container"
      }
    >
      <div className="modal-subcontainer">
        {variant === "modal" && (
          <div className="modal-header-container">
            <h2
              id="import-title"
              className="modal-title"
            >
              Import bookmarks
            </h2>
            <button
              onClick={() => !busy && onClose?.()}
              className="import-button close-button"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        <div className="body-container">
          {renderBody()}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="footer-container">
          <div className="busy-message">
            {busy
              ? "Importing… This may take a moment for large sets."
              : ""}
          </div>
          <div className="flex items-center gap-2">
            {variant === "modal" && (
              <button
                onClick={() => !busy && onClose?.()}
                className="import-button cancel-button"
              >
                Cancel
              </button>
            )}

            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={busy}
                className="import-button back-button"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handlePrimary}
              disabled={primaryDisabled}
              className="import-button next-button"
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
