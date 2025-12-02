import React, { useEffect, useState } from "react";
import { User, Briefcase, GraduationCap, Loader2 } from "lucide-react";

/* -------------------- Local types -------------------- */
type PurposeChipProps = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
};

type PurposeStepProps = {
  setPrimaryDisabled?: (disabled: boolean) => void;
  onSelectionChange?: (ids: string[]) => void;
};
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

export const PurposeStep: React.FC<PurposeStepProps> = ({
  setPrimaryDisabled,
  onSelectionChange,
}) => {
  /* -------------------- State -------------------- */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const singleSelection = selectedIds.length === 1 ? selectedIds[0] : null;
  const hasPurpose = selectedIds.length > 0;

  const labelMap: Record<string, string> = {
    personal: "Personal",
    work: "Work",
    school: "School",
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  // Disable "Next" when no purpose is set
  useEffect(() => {
    const disabled = selectedIds.length === 0;
    setPrimaryDisabled?.(disabled);
    onSelectionChange?.(selectedIds);
  }, [selectedIds, setPrimaryDisabled, onSelectionChange]);

  // Little "tailoring" thinking animation
  useEffect(() => {
    let timeoutId: number | undefined;

    if (selectedIds.length > 0) {
      setIsThinking(true);

      timeoutId = window.setTimeout(() => {
        setIsThinking(false);
      }, 1200);
    } else {
      setIsThinking(false);
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

      <p className="tip">Tip: You can select more than one category.</p>

    </div>
  );
};
