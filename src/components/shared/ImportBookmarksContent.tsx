/* -------------------- Imports -------------------- */
import React, { useEffect, useRef, useState } from "react";

/* Constants */
import { 
  ImportPostProcessMode,
  OpenTabsScope,
} from "@/core/constants/import";

/* Types */
import type { 
  ManualImportSelectionType, 
  ImportPostProcessModeType,
  OpenTabsScopeType,
} from "@/core/types/import";

/* Styles */
import '@/styles/components/shared/ImportBookmarksContent.css'
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;     // Closing the modal
  onComplete?: () => void;  // Wizard finished (embedded or modal)
  onSelectionChange?: (selection: ManualImportSelectionType) => void;
  busy?: boolean;
  busyMessage?: string;
  errorMessage?: string;
};

type WizardStep = 1 | 2 | 3 | 4;

type YesCheckboxRowProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
};
/* --------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const LAST_STEP: WizardStep = 4;
const BUSY_MESSAGE: string = "Thinking ...";
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
  busy = false,
  busyMessage = BUSY_MESSAGE,
  errorMessage,
}: ImportBookmarksContentProps) {
  /* -------------------- Context / state -------------------- */
  const dialogRef = useRef<HTMLDivElement | null>(null);

   // Sub-wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [jsonYes, setJsonYes] = useState(false);
  const [bookmarksYes, setBookmarksYes] = useState(false);
  const [tabsYes, setTabsYes] = useState(false);
  const [semanticGroupingYes, setSemanticGroupingYes] = useState(false);
  
  // JSON 
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonData, setJsonData] = useState<string | null>(null);

  // Tabs 
  const [tabScope, setTabScope] = useState<OpenTabsScopeType>(OpenTabsScope.All);

  // Post-process mode  
  const [postProcessMode, setPostProcessMode] =
    useState<ImportPostProcessModeType>(ImportPostProcessMode.PreserveStructure);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset state whenever the component unmounts or reopens. 
   */
  useEffect(() => {
    return () => {
      setJsonYes(false);
      setJsonFileName(null);      
      setJsonData(null);

      setBookmarksYes(false);
      setTabsYes(false);
      
      setTabScope(OpenTabsScope.All);

      setSemanticGroupingYes(false);
      setPostProcessMode(ImportPostProcessMode.PreserveStructure);
      
      setStep(1);
    };
  }, []);

  /**
   * Close the modal on Escape key (embedded variant ignores because onClose may be undefined).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  useEffect(() => {
    onSelectionChange?.({
      jsonFileName: jsonYes ? jsonFileName : null,
      jsonData: jsonYes ? jsonData : null,
      importBookmarks: bookmarksYes,
      tabScope: tabsYes ? tabScope : undefined,
      importPostProcessMode: postProcessMode,
    });
  }, [jsonYes, jsonFileName, jsonData, bookmarksYes, tabsYes, tabScope, postProcessMode, onSelectionChange]);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setJsonFileName(null);
      setJsonData(null);
      return;
    }

    const text = await file.text();
    JSON.parse(text); // throws if invalid
    setJsonFileName(file.name);
    setJsonData(text);
  }

  function clearJsonSelection() {
    setJsonFileName(null);
    setJsonData(null);
  }

  /**
   * Primary CTA click handler for navigating the wizard.
   */
  async function handlePrimary() {
    if (busy) return;
    if (step < LAST_STEP) {
      setStep((s) => (s + 1) as WizardStep);
    } else {
      finishWizard();
    }
  }

  /**
   * Navigate to the previous wizard step when possible.
   */
  function handleBack() {
    if (busy) return;
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
    return "Finish";  // Step 4
  })();

  const primaryDisabled = (step === 1 && jsonYes && !jsonData);

  /**
   * Render the wizard step header for the current step.
   */
  function renderStepHeader() {
    const titles: Record<number, string> = {
      1: "Do you have a JSON file to import?",
      2: "Do you want to import your Chrome bookmarks?",
      3: "Do you want to import your open tabs?",
      4: "Do you want Mindful to automatically organize everything you imported?",
    };
    const title = titles[step] ?? "";

    const subtitles: Record<number, string> = {
      1: "If you exported from another bookmark manager (or from Mindful), you can bring that file in now. If you’re not sure what this is, just skip.",
    }
    const subtitle = subtitles[step];

    return (
      <>
        <div className="step-progress">
          <span>
            Step {step} of {LAST_STEP}
          </span>
        </div>
        <h3 className="step-title">
          {title}
        </h3>
        {subtitle && 
          <p className="step-subtitle">
            {subtitle}
          </p>
        }
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
    {errorMessage && (
      <div className="error-message">
        {errorMessage}
      </div>
    )}

    if (step === 1) {
      return (
        <div className="body-container">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={jsonYes}
            onToggle={() => {
              setJsonYes((v) => {
                const next = !v;
                if (!next) clearJsonSelection();
                return next;
              });
            }}
            label="Yes"
          />

          {jsonYes && (
            <div className="json-input-container">
              {jsonData ? (
                <div className="json-selected-file-container">
                  Selected:{" "}
                  <span className="json-file-name">
                    {jsonFileName ?? "file"}
                  </span>
                  <button
                    type="button"
                    className="json-file-remove"
                    onClick={clearJsonSelection}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  id="json-file-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleJsonFileChange}
                  className="json-input"
                />
              )}
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

    if (step === 3) {
      return (
        <div className="body-container">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={tabsYes}
            onToggle={() => {
              setTabsYes((v) => {
                const next = !v;
                if (!next) setTabScope(OpenTabsScope.All);
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
                  onClick={() => setTabScope(OpenTabsScope.All)}
                  className={`tabs-radio-button-row
                    ${tabScope === OpenTabsScope.All
                      ? "tabs-radio-button-row--selected"
                      : "tabs-radio-button-row--unselected"
                    }
                  `}
                >
                  <div
                    className={`
                      tabs-radio-button-outer-circle
                      ${tabScope === OpenTabsScope.All
                        ? "tabs-radio-button-outer-circle--selected"
                        : "tabs-radio-button-outer-circle--unselected"
                      }
                    `}
                  >
                    {tabScope === OpenTabsScope.All && (
                      <div className="tabs-radio-button-inner-circle" />
                    )}
                  </div>
                  <span className="tabs-radio-button-text">All windows</span>
                </button>

                {/* Current window */}
                <button
                  type="button"
                  onClick={() => setTabScope(OpenTabsScope.Current)}
                  className={`tabs-radio-button-row
                    ${tabScope === OpenTabsScope.Current
                      ? "tabs-radio-button-row--selected"
                      : "tabs-radio-button-row--unselected"
                    }
                  `}
                >
                  <div
                    className={`
                      tabs-radio-button-outer-circle 
                      ${tabScope === OpenTabsScope.Current
                        ? "tabs-radio-button-outer-circle--selected"
                        : "tabs-radio-button-outer-circle--unselected"
                      }
                    `}
                  >
                    {tabScope === OpenTabsScope.Current && (
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
    };

    if (step === 4) {
      return (
        <div className="body-container">
          {renderStepHeader()}
          <YesCheckboxRow
            checked={semanticGroupingYes}
            onToggle={() => {
              setSemanticGroupingYes((v) => {
                const next = !v;
                setPostProcessMode(
                  next ? ImportPostProcessMode.SemanticGrouping : ImportPostProcessMode.PreserveStructure
                );
                return next;
              });
            }}
            label="Yes"
          />
        </div>
      );
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
              disabled={busy}
              className="import-button close-button"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        <div className="body-container">
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}
          {renderBody()}
        </div>

        <div className="footer-container">
          <div className="flex w-full items-center justify-end gap-2">
            {/* Busy message */}
            <div className="min-h-[20px]">
              {busy && (
                <div className="busy-message">
                  <span className="spinner" aria-hidden="true" />
                  <span>{busyMessage}</span>
                </div>
              )}
            </div>

            {/* Buttons: Cancel, Back, Next */}
            <div className="flex items-center justify-end gap-2"> 
              {variant === "modal" && (
                <button
                  onClick={() => !busy && onClose?.()}
                  disabled={busy}
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
                disabled={primaryDisabled || busy}
                className="import-button next-button"
              >
                {busy ? BUSY_MESSAGE : primaryLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
