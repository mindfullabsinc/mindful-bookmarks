/* -------------------- Imports -------------------- */
import React, { useEffect, useState } from "react";
import {
  Wand2,
  PlusSquare,
} from "lucide-react";

/* Components */
import { AiDisclosure } from "@/components/privacy/AiDisclosure";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ImportBookmarksStepProps = {
  /** Callback from the onboarding shell to control the primary button */
  setPrimaryDisabled?: (disabled: boolean) => void;
  /** Surface selected purposes back to parent */
  onSelectionChange?: (mode: "smart" | "manual") => void;
};

type ImportChoice = "smart" | "manual" | null;
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

  /* -------------------- Handler helper functions -------------------- */
  const handleSmartClick = () => {
    setImportChoice("smart");
    onSelectionChange?.("smart");
  };

  const handleManualClick = () => {
    setImportChoice("manual");
    onSelectionChange?.("manual");
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Disable the primary onboarding button whenever no import choice is selected.
   */
  useEffect(() => {
    const disabled = importChoice === null;
    setPrimaryDisabled?.(disabled);
  }, [importChoice, setPrimaryDisabled]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component logic -------------------- */
  return (
    <div className="import-container">
      <div className="import-top-margin">
        <div className="divider" />
        <div className="import-bottom-margin">

          {/* Smart Import */}
          <button
            type="button"
            onClick={handleSmartClick}
            className={`chip import-chip ${
              importChoice === "smart" ? "chip--active" : ""
            }`}
          >
            <div className="import-chip__icon_container">
              <Wand2 className="import-chip__icon"/>
            </div>
            <div className="import-chip__body">
              <div className="flex items-center gap-2">
                <p className="import-chip__title">Smart import</p>
                <span className="import-chip__pill">Recommended</span>
              </div>
              <p className="import-chip__subtitle">
                Let Mindful do the hard work to auto-import from your bookmarks,
                tabs, and history.
              </p>
            </div>
          </button>

          {/* Informational disclosure (no gating) */}
          {importChoice === "smart" && (
            <div className="mt-3">
              <AiDisclosure variant="inline" serviceName="OpenAI" />
            </div>
          )}

          {/* Manual Import */}
          <button
            type="button"
            onClick={handleManualClick}
            className={`chip import-chip ${
              importChoice === "manual" ? "chip--active" : ""
            }`}
          >
            <div className="import-chip__icon_container">
              <PlusSquare className="import-chip__icon"/>
            </div>
            <div className="import-chip__body">
              <p className="import-chip__title">Manual import</p>
              <p className="import-chip__subtitle">
                Manually decide exactly what you want to bring into Mindful,
                one step at a time.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
};
