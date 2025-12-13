/* -------------------- Imports -------------------- */
import React, { useEffect, useRef, useState } from "react";

/* Types */
import { type ManualImportSelectionType } from "@/core/types/import";

/* Styles */
import '@/styles/components/shared/ImportBookmarksContent.css'
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;     // Closing the modal
  onComplete?: () => void;  // Wizard finished (embedded or modal)
  onSelectionChange?: (selection: ManualImportSelectionType) => void;
};

type WizardStep = 1 | 2 | 3 | 4;

type YesCheckboxRowProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
};
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const LAST_STEP: WizardStep = 4;
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
  onSelectionChange,
}: ImportBookmarksContentProps) {
  /* -------------------- Context / state -------------------- */
  const dialogRef = useRef<HTMLDivElement | null>(null);

   // Sub-wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const isLastStep = step === LAST_STEP;
  const [jsonYes, setJsonYes] = useState(false);
  const [bookmarksYes, setBookmarksYes] = useState(false);
  const [tabsYes, setTabsYes] = useState(false);
 
  // JSON 
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  // Bookmarks 
  const [mode] = useState<"flat" | "smart">("flat"); // still only flat for now
  const [smartStrategy] = useState<"folders" | "domain" | "topic">("folders");

  // Tabs 
  const [tabScope, setTabScope] = useState<"current" | "all">("current");

  // Grouping choice
  const [bookmarkGroupingMode, setBookmarkGroupingMode] = useState<"flat" | "smart">("flat");
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset state whenever the component unmounts or reopens. 
   */
  useEffect(() => {
    return () => {
      setJsonFile(null);      setJsonYes(false);
      setBookmarksYes(false);
      setTabsYes(false);
      setTabScope("current");
      setStep(1);
    };
  }, []);

  /**
   * Close the modal on Escape key (embedded variant ignores because onClose may be undefined).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    onSelectionChange?.({
      jsonFile: jsonYes ? jsonFile : null,
      importBookmarks: bookmarksYes,
      tabScope: tabsYes ? tabScope : undefined,
    });
  }, [jsonYes, jsonFile, bookmarksYes, tabsYes, tabScope, onSelectionChange]);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */

  /**
   * Primary CTA click handler for navigating the wizard.
   */
  async function handlePrimary() {
    if (step < 3) {
      setStep((s) => (s + 1) as WizardStep);
      return;
    }

    finishWizard();
  }

  /**
   * Navigate to the previous wizard step when possible.
   */
  function handleBack() {
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  }

  /**
   * Centralized logic to notify that the manual import wizard is complete. 
   */
  function finishWizard() {
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
    if (step === 1) {
      return jsonYes ? "Continue" : "Skip";
    }
    if (step === 2) {
      return bookmarksYes ? "Continue" : "Skip";
    }
    if (step === 3) {
      return tabsYes ? "Continue" : "Skip";
    }
  })();

  const primaryDisabled = (step === 1 && jsonYes && !jsonFile);

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
            onToggle={() => {
              setJsonYes((v) => {
                const next = !v;
                if (!next) setJsonFile(null);
                return next;
              });
            }}
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
        </div>
      );
    }

    // step === 3
    return (
      <div className="body-container">
        {renderStepHeader()}
        <YesCheckboxRow
          checked={tabsYes}
          onToggle={() => {
            setTabsYes((v) => {
              const next = !v;
              if (!next) setTabScope("current");
              return next;
            });
          }}
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
              onClick={() => onClose?.()}
              className="import-button close-button"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        <div className="body-container">
          {renderBody()}
        </div>

        <div className="footer-container">
          <div className="flex w-full items-center justify-end gap-2">
            {variant === "modal" && (
              <button
                onClick={() => onClose?.()}
                className="import-button cancel-button"
              >
                Cancel
              </button>
            )}

            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
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
