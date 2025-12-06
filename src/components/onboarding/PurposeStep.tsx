/* -------------------- Imports -------------------- */
import React, { useEffect, useState, useContext, Dispatch, SetStateAction } from "react";
import { User, Briefcase, GraduationCap, Loader2 } from "lucide-react";

/* Scripts */
import { AppContext } from "@/scripts/AppContextProvider";

/* Types */
import type { PurposeId } from "@shared/types/purposeId";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type PurposeChipProps = {
  id: PurposeId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  selectedIds: PurposeId[];
  setSelectedIds: Dispatch<SetStateAction<PurposeId[]>>;
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
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
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
  const { onboardingPurposes, setOnboardingPurposes } = useContext(AppContext);
  const [selectedIds, setSelectedIds] = useState<PurposeId[]>(
    onboardingPurposes ?? []
  );

  const singleSelection = selectedIds.length === 1 ? selectedIds[0] : null;
  const hasPurpose = selectedIds.length > 0;

  const labelMap: Record<PurposeId, string> = {
    personal: "Personal",
    work: "Work",
    school: "School",
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Disable the primary button when no purpose is set and notify parent components.
   */
  useEffect(() => {
    const disabled = selectedIds.length === 0;
    setPrimaryDisabled?.(disabled);
    onSelectionChange?.(selectedIds);
  }, [selectedIds, setPrimaryDisabled, onSelectionChange]);

  /**
   * Whenever chips change, push the selection into global onboarding state.
   */
  useEffect(() => {
    setOnboardingPurposes(selectedIds);
  }, [selectedIds, setOnboardingPurposes]);
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
