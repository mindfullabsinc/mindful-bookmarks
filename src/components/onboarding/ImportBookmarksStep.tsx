import React, { useEffect, useState } from "react";
import {
  User,
  Briefcase,
  GraduationCap,
  Loader2,
  Wand2,
  PlusSquare,
} from "lucide-react";

/* -------------------- Local types -------------------- */
type PurposeChipProps = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
};

type ImportBookmarksStepProps = {
  /** Callback from the onboarding shell to control the primary button */
  setPrimaryDisabled?: (disabled: boolean) => void;
  /** Surface selected purposes back to parent */
  onSelectionChange?: (ids: string[]) => void;
};

type ImportChoice = "auto" | "manual" | null;
/* ---------------------------------------------------------- */

/* -------------------- Helper components -------------------- */
const PurposeChip: React.FC<PurposeChipProps> = ({
  id,
  label,
  icon: Icon,
  selectedIds,
  setSelectedIds,
}) => {
  const active = selectedIds.includes(id);

  const handleClick = () => {
    if (active) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={`chip purpose-chip ${active ? "chip--active" : ""}`}
    >
      <Icon className="chip-icon" />
      <span>{label}</span>
    </button>
  );
};
/* ---------------------------------------------------------- */

export const ImportBookmarksStep: React.FC<ImportBookmarksStepProps> = ({
  setPrimaryDisabled,
  onSelectionChange,
}) => {
  /* -------------------- Purpose state -------------------- */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  const singleSelection = selectedIds.length === 1 ? selectedIds[0] : null;
  const hasPurpose = selectedIds.length > 0;

  const labelMap: Record<string, string> = {
    personal: "Personal",
    work: "Work",
    school: "School",
  };

  /* -------------------- Import choice state -------------------- */
  const [importChoice, setImportChoice] = useState<ImportChoice>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  // Disable "Next" when no purpose OR no import choice
  useEffect(() => {
    const disabled = selectedIds.length === 0 || importChoice === null;
    setPrimaryDisabled?.(disabled);
    onSelectionChange?.(selectedIds);
  }, [selectedIds, importChoice, setPrimaryDisabled, onSelectionChange]);

  useEffect(() => {
    let timeoutId: number | undefined;

    if (selectedIds.length > 0) {
      setIsThinking(true);
      setShowImportSection(false);

      timeoutId = window.setTimeout(() => {
        setIsThinking(false);
        setShowImportSection(true);
      }, 1200);
    } else {
      setIsThinking(false);
      setShowImportSection(false);
      setImportChoice(null); // reset if they deselect everything
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [selectedIds]);
  /* ---------------------------------------------------------- */

  return (
    <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
      {/* Divider */}
      <div className="divider" />

      {/* Prompt */}
      <p className="prompt-title">What brings you to Mindful?</p>

      {/* Purpose chips */}
      <div className="purpose-chip-grid">
        <PurposeChip
          id="personal"
          label="Personal"
          icon={User}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
        <PurposeChip
          id="work"
          label="Work"
          icon={Briefcase}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
        <PurposeChip
          id="school"
          label="School"
          icon={GraduationCap}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
      </div>

      {singleSelection && (
        <p className="tip">Tip: You can select more than one category.</p>
      )}

      {/* ---------- Import section (only after at least one purpose) ---------- */}
      {hasPurpose && (
        <>
          {isThinking && (
            <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Tailoring Mindful for{" "}
                {selectedIds.length === 1 ? labelMap[selectedIds[0]] : "you"}
                {" …"}
              </span>
            </div>
          )}

          {showImportSection && (
            <div className="mt-4 space-y-3">
              <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800" />

              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Bring Mindful up to speed.
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Choose how you'd like to get your existing web life into
                Mindful.
              </p>

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
          )}
        </>
      )}
    </div>
  );
};
