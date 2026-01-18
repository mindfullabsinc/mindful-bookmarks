/* -------------------- Imports -------------------- */
import React, { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

/* Types */
import type { PhaseMessageMap } from "@/core/constants/importPhase";
import type { ImportPhase } from "@/core/types/importPhase";

/* Constants */
import { PHASE_MESSAGES } from "@/core/constants/importPhase";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type ImportProgressProps = {
  phaseSequence: readonly ImportPhase[];
  backendPhase: ImportPhase;
  backendMessage?: string;
  
  /**
   * Optional override (defaults to shared PHASE_MESSAGES).
   * Use only if a flow wants to override copy for some phases.
   */
  phaseMessages?: PhaseMessageMap;
  
  donePhaseId?: ImportPhase;
  idleTitle?: string;
  doneTitle?: string;
  reassuranceText?: string;
};
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const MIN_PHASE_DURATION_MS = 800;
/* ---------------------------------------------------------- */

export function useSmoothedPhase(
  phaseSequence: readonly ImportPhase[],
  backendPhase: ImportPhase
) {
  const [visualPhaseIndex, setVisualPhaseIndex] = useState(0);

  const visualPhase: ImportPhase =
    phaseSequence[visualPhaseIndex] ?? phaseSequence[0] ?? "initializing";

  useEffect(() => {
    const backendIndex = phaseSequence.indexOf(backendPhase);
    if (backendIndex === -1) return;
    if (backendIndex <= visualPhaseIndex) return;

    const t = setTimeout(() => {
      setVisualPhaseIndex((prev) => Math.min(prev + 1, backendIndex));
    }, MIN_PHASE_DURATION_MS);

    return () => clearTimeout(t);
  }, [backendPhase, visualPhaseIndex, phaseSequence]);

  const reset = () => setVisualPhaseIndex(0);

  return { visualPhaseIndex, visualPhase, reset };
}


function widthClass(index: number, total: number) {
  if (total <= 1) return "w-full";

  const buckets = 6;
  const pctBucket = Math.min(
    buckets,
    Math.max(1, Math.round(((index + 1) / total) * buckets))
  );

  return pctBucket === 1
    ? "w-1/6"
    : pctBucket === 2
    ? "w-2/6"
    : pctBucket === 3
    ? "w-3/6"
    : pctBucket === 4
    ? "w-4/6"
    : pctBucket === 5
    ? "w-5/6"
    : "w-full";
}

export const ImportProgress: React.FC<ImportProgressProps> = ({
  phaseSequence,
  backendPhase,
  backendMessage,
  phaseMessages = PHASE_MESSAGES,
  donePhaseId = "done",
  idleTitle = "Preparing your space ...",
  doneTitle = "You're all set!",
  reassuranceText = "This only takes a few seconds.",
}) => {
  const { visualPhase, visualPhaseIndex } = useSmoothedPhase(
    phaseSequence,
    backendPhase
  );

  const isDone = visualPhase === donePhaseId;

  const effectiveMessage =
    isDone
      ? backendMessage || phaseMessages[visualPhase] || "Done."
      : phaseMessages[visualPhase] || backendMessage || "Working…";

  return (
    <div className="s_import-container">
      {/* Icon */}
      <div className="s_import-icon-container">
        {isDone ? (
          <Wand2 className="s_import-icon s_import-icon-wand" />
        ) : (
          <Loader2 className="s_import-icon s_import-icon-loader" />
        )}
      </div>

      {/* Title */}
      <h2 className="s_import-title">{isDone ? doneTitle : idleTitle}</h2>

      {/* Dynamic message */}
      <p className="s_import-dynamic-message">{effectiveMessage}</p>

      {/* Progress bar */}
      <div className="s_import-progress-bar-container">
        <div
          className={`s_import-progress-bar ${widthClass(
            visualPhaseIndex,
            phaseSequence.length
          )}`}
        />
      </div>

      {/* Reassurance */}
      {!isDone && (
        <p className="s_import-reassurance-text">{reassuranceText}</p>
      )}
    </div>
  );
};
