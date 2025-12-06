/* -------------------- Imports -------------------- */
import React, { useEffect, useState } from "react";
import {
  Wand2,
  PlusSquare,
} from "lucide-react";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ImportBookmarksStepProps = {
  /** Callback from the onboarding shell to control the primary button */
  setPrimaryDisabled?: (disabled: boolean) => void;
  /** Surface selected purposes back to parent */
  onSelectionChange?: (ids: string[]) => void;
};

type ImportChoice = "auto" | "manual" | null;
/* ---------------------------------------------------------- */

/**
 * Onboarding step that lets users pick between smart or manual bookmark import flows.
 *
 * @param props.setPrimaryDisabled Callback exposed by the onboarding shell to disable progression.
 * @param props.onSelectionChange Callback invoked when an import option is selected.
 */
export const ImportBookmarksStep: React.FC<ImportBookmarksStepProps> = ({
  setPrimaryDisabled,
  onSelectionChange,
}) => {
  /* -------------------- Context / state -------------------- */
  const [importChoice, setImportChoice] = useState<ImportChoice>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Disable the primary onboarding button whenever no import choice is selected.
   */
  useEffect(() => {
    const disabled = importChoice === null;
    setPrimaryDisabled?.(disabled);
  }, [importChoice, setPrimaryDisabled, onSelectionChange]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component logic -------------------- */
  return (
    <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
      <div className="mt-4 space-y-3">
        <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800" />
        <div className="space-y-2">
          {/* Smart Import */}
          <button
            type="button"
            onClick={() => setImportChoice("auto")}
            className={`chip import-chip ${
              importChoice === "auto" ? "chip--active" : ""
            }`}
          >
            <div className="import-chip__icon">
              <Wand2 className="h-5 w-5" />
            </div>
            <div className="import-chip__body">
              <div className="flex items-center gap-2">
                <p className="import-chip__title">Smart import</p>
                <span className="import-chip__pill">Recommended</span>
              </div>
              <p className="import-chip__subtitle">
                Let Mindful do the hard work to auto-import from your
                bookmarks, tabs, and history.
              </p>
            </div>
          </button>

          {/* Manual Import */}
          <button
            type="button"
            onClick={() => setImportChoice("manual")}
            className={`chip import-chip ${
              importChoice === "manual" ? "chip--active" : ""
            }`}
          >
            <div className="import-chip__icon">
              <PlusSquare className="h-5 w-5" />
            </div>
            <div className="import-chip__body">
              <p className="import-chip__title">Manual import</p>
              <p className="import-chip__subtitle">
                Manually decide exactly what you want to bring into
                Mindful, one step at a time.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
};
