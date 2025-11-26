import React, { useEffect, useState } from "react";
import { User, Briefcase, GraduationCap, Wand2, PlusSquare } from "lucide-react";

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
      className={`chip purpose-chip ${
        active ? "purpose-chip--active" : ""
      }`}
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
  /* -------------------- Context / state -------------------- */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importChoice, setImportChoice] = useState<ImportChoice>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  // Disable "Continue" when nothing selected
  useEffect(() => {
    setPrimaryDisabled?.(selectedIds.length === 0);
    onSelectionChange?.(selectedIds);
  }, [selectedIds, setPrimaryDisabled, onSelectionChange]);
  /* ---------------------------------------------------------- */

  const singleSelection = selectedIds.length === 1 ? selectedIds[0] : null;
  const hasPurpose = selectedIds.length > 0;

  const labelMap: Record<string, string> = {
    personal: "Personal",
    work: "Work",
    school: "School",
  };

  /* -------------------- Main component rendering -------------------- */
  return (
    <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
      {/* Divider */}
      <div className="divider"></div>

      {/* Prompt */}
      <p className="prompt-title">
        What brings you to Mindful?
      </p>

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

      {/* Recommended hint when exactly one is selected */}
      {singleSelection && (
        <p className="tip">
          Tip: You can select more than one category. 
        </p>
      )}

      {/* ---------- Import section (only after at least one purpose) ---------- */}
      {hasPurpose && (
        <div className="mt-4 space-y-3">
          <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800" />

          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Bring Mindful up to speed.
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Choose how you’d like to start: we can automatically import and
            sort what you already have, or you can build things up from scratch.
          </p>

          <div className="space-y-2">
            {/* Auto import option */}
            <button
              type="button"
              onClick={() => setImportChoice("auto")}
              className={`w-full text-left import-option ${
                importChoice === "auto" ? "import-option--active" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Wand2 className="h-5 w-5 opacity-80" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Quick start (recommended)
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Auto-import your existing bookmarks and organize them into
                    groups. You’ll be able to review and tidy things up later.
                  </p>
                </div>
              </div>
            </button>

            {/* Manual option */}
            <button
              type="button"
              onClick={() => setImportChoice("manual")}
              className={`w-full text-left import-option ${
                importChoice === "manual" ? "import-option--active" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <PlusSquare className="h-5 w-5 opacity-80" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Start fresh
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Don’t import anything yet. You’ll create a few focused
                    groups and add links as you go.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <p className="text-[11px] text-neutral-500 dark:text-neutral-500">
            Your choices stay on this device unless you later turn on sync.
          </p>
        </div>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
}