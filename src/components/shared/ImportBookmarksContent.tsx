import React, { useEffect, useRef, useState } from "react";

/* Types */
import type { ManualImportSelectionType } from "@/core/types/import";

/* Shared step body + constants */
import {
  ImportBookmarksStepBody,
  LAST_STEP,
  type WizardStep,
} from "@/components/shared/ImportBookmarksStepBody";

/* Hook to share state + selection mapping */
import { useManualImportWizardState } from "@/hooks/useManualImportWizardState";

/* Styles */
import "@/styles/components/shared/ImportBookmarksContent.css";

export type ImportBookmarksContentProps = {
  variant: "modal" | "embedded";
  onClose?: () => void;
  onComplete?: () => void | Promise<void>;
  onSelectionChange?: (selection: ManualImportSelectionType) => void;

  busy?: boolean;
  busyMessage?: string;
  errorMessage?: string;
};

const BUSY_MESSAGE = "Thinking ...";

export function ImportBookmarksContent({
  variant,
  onClose,
  onComplete,
  onSelectionChange,
  busy = false,
  busyMessage = BUSY_MESSAGE,
  errorMessage,
}: ImportBookmarksContentProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<WizardStep>(1);

  const { state, selection, reset } = useManualImportWizardState();

  // Emit selection upward
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  // Reset state on unmount (matches your previous behavior)
  useEffect(() => {
    return () => {
      reset();
      setStep(1);
    };
  }, [reset]);

  // Escape closes modal (embedded ignores if onClose not provided)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const primaryLabel =
    step === 1 ? (state.jsonYes ? "Continue" : "Skip") :
    step === 2 ? (state.bookmarksYes ? "Continue" : "Skip") :
    step === 3 ? (state.tabsYes ? "Continue" : "Skip") :
    "Finish";

  const primaryDisabled = step === 1 && state.jsonYes && !state.jsonData;

  async function handlePrimary() {
    if (busy) return;

    if (step < LAST_STEP) {
      setStep((s) => (s + 1) as WizardStep);
      return;
    }

    // Finish
    try {
      await onComplete?.();
      if (variant === "modal") onClose?.();
    } catch {
      // parent sets errorMessage; don't close
    }
  }

  function handleBack() {
    if (busy) return;
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  }

  return (
    <div className="import-styles">
      <div
        ref={dialogRef}
        role={variant === "modal" ? "dialog" : undefined}
        aria-modal={variant === "modal" ? "true" : undefined}
        aria-labelledby="import-title"
        className="container"
      >
        <div className="subcontainer">
          {errorMessage && <div className="error-message">{errorMessage}</div>}

          <ImportBookmarksStepBody
            step={step}
            showInternalHeader={true}
            busy={busy}
            state={state}
          />

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

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2">
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
    </div>
  );
}
