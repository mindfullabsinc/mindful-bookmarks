import React, { useEffect, useState } from "react";
import { type LucideIcon } from "lucide-react";
import { User, Briefcase, GraduationCap } from "lucide-react";

/* -------------------- Local types -------------------- */
type PurposeButtonProps = {
  id: string;
  label: string;
  icon: LucideIcon;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
};

type ImportBookmarksStepProps = {
  /** Callback from the onboarding shell to control the primary button */
  setPrimaryDisabled?: (disabled: boolean) => void;
  /** Surface selected purposes back to parent */
  onSelectionChange?: (ids: string[]) => void;
};
/* ---------------------------------------------------------- */

/* -------------------- Helper components -------------------- */
const PurposeButton: React.FC<PurposeButtonProps> = ({
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
      className={`purpose-button flex items-center gap-2 justify-center ${
        active ? "purpose-button--active" : ""
      }`}
    >
      <Icon className="h-5 w-5 opacity-80" />
      <span>{label}</span>
    </button>
  );
};
/* ---------------------------------------------------------- */

export const ImportBookmarksStep: React.FC<ImportBookmarksStepProps> = ({
  setPrimaryDisabled,
  onSelectionChange,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Disable "Continue" when nothing selected
  useEffect(() => {
    setPrimaryDisabled?.(selectedIds.length === 0);
    onSelectionChange?.(selectedIds);
  }, [selectedIds, setPrimaryDisabled, onSelectionChange]);

  const singleSelection = selectedIds.length === 1 ? selectedIds[0] : null;

  const labelMap: Record<string, string> = {
    personal: "Personal",
    work: "Work",
    school: "School",
  };

  return (
    <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
      {/* Divider */}
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 mb-4" />

      {/* Prompt */}
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        What brings you to Mindful?
      </p>

      {/* Purpose buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md mx-auto">
        <PurposeButton
          id="personal"
          label="Personal"
          icon={User}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
        <PurposeButton
          id="work"
          label="Work"
          icon={Briefcase}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
        <PurposeButton
          id="school"
          label="School"
          icon={GraduationCap}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
      </div>

      {/* Recommended hint when exactly one is selected */}
      {singleSelection && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Tip: You can select more than one category. 
        </p>
      )}
    </div>
  );
}