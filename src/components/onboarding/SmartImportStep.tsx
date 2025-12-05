/* -------------------- Imports -------------------- */
import React, {
  useEffect,
  useMemo,
  useContext,
  useRef,
  useState,
} from "react";
import { Loader2, Wand2 } from "lucide-react";

/* Types */
import type { PurposeId } from "@/core/types/purposeId";

/* Constants */
import { PHASE_MESSAGES } from "@/core/constants/smartImportPhase";

/* Hooks */
import { useSmartImport } from "@/hooks/useSmartImport";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Service implementations */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";
import { chromeBrowserSourceService } from "@/scripts/import/browserSourceServiceChrome";
import { basicNsfwFilter } from "@/scripts/import/nsfwFilter";
import { stubGroupingLLM } from "@/scripts/import/groupingLLMStub";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";
/* ---------------------------------------------------------- */

/* -------------------- Types -------------------- */
type SmartImportStepProps = {
  purposes: PurposeId[];
};
/* ---------------------------------------------------------- */

/** Ordered list of phases for the *visual* progress bar. */
const PHASE_SEQUENCE = [
  "initializing",
  "collecting",
  "filtering",
  "categorizing",
  "persisting",
  "done",
] as const;
type VisualPhase = (typeof PHASE_SEQUENCE)[number];

const MIN_PHASE_DURATION_MS = 800;

export const SmartImportStep: React.FC<SmartImportStepProps> = ({
  purposes
}) => {
  const { userId, bumpWorkspacesVersion } = useContext(AppContext);

  // Build a user-scoped WorkspaceService
  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );

  const baseOptions = useMemo(
    () => ({
      workspaceService,
      browserSourceService: chromeBrowserSourceService,
      nsfwFilter: basicNsfwFilter,
      llm: remoteGroupingLLM, 
    }),
    [workspaceService]
  );

  const { phase: backendPhase, message, start } = useSmartImport(baseOptions);

  // Guard so we only kick off Smart Import once per mount
  const startedRef = useRef(false);

  // 🔹 visual phase index for the loading UI
  const [visualPhaseIndex, setVisualPhaseIndex] = useState(0);
  const visualPhase: VisualPhase = PHASE_SEQUENCE[visualPhaseIndex];

  /* -------------------- Kick off the import -------------------- */
  useEffect(() => {
    if (!purposes || purposes.length === 0) {
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        await start(purposes);
        if (!cancelled) {
          bumpWorkspacesVersion();  // Tell the rest of the app registry changed
        }
      } catch (err) {
        console.error("[SmartImportStep] error during smart import", err);
        if (!cancelled) {
          bumpWorkspacesVersion();  // In case we created any workspaces before failing
        }
      } finally {
        // Backend is finished; visual phase will "catch up" below
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purposes, start, bumpWorkspacesVersion]);
  /* ---------------------------------------------------------- */

  /* -------------------- Visual phase smoothing -------------------- */
  // Whenever the backend phase moves ahead in the sequence, walk the
  // visual phase forward one step every MIN_PHASE_DURATION_MS until
  // it catches up. This guarantees intermediate steps are visible.
  useEffect(() => {
    const backendIndex = PHASE_SEQUENCE.indexOf(
      backendPhase as VisualPhase
    );
    if (backendIndex === -1) return;

    if (backendIndex <= visualPhaseIndex) return;

    const timeout = setTimeout(() => {
      setVisualPhaseIndex((prev) =>
        Math.min(prev + 1, backendIndex)
      );
    }, MIN_PHASE_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [backendPhase, visualPhaseIndex]);
  /* ---------------------------------------------------------- */

  const effectiveMessage =
    visualPhase === "done"
      ? message || PHASE_MESSAGES[visualPhase]
      : PHASE_MESSAGES[visualPhase] || "Working on your Smart Import…";

  // Map visual phases → progress width
  const progressWidthClass =
    visualPhase === "initializing"
      ? "w-1/6"
      : visualPhase === "collecting"
      ? "w-2/6"
      : visualPhase === "filtering"
      ? "w-3/6"
      : visualPhase === "categorizing"
      ? "w-4/6"
      : visualPhase === "persisting"
      ? "w-5/6"
      : visualPhase === "done"
      ? "w-full"
      : "w-0";

  /* -------------------- Main component logic -------------------- */
  return (
    <div className="flex flex-col items-center text-center p-8 min-h-[300px]">
      {/* Icon */}
      <div className="mb-6">
        {visualPhase === "done" ? (
          <Wand2 className="h-10 w-10 text-blue-500 animate-in fade-in" />
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        )}
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold mb-2">
        {visualPhase === "done" ? "You're all set!" : "Preparing your space ..."}
      </h2>

      {/* Dynamic message from backend/visual progress */}
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        {effectiveMessage}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-xs h-1 rounded-full bg-neutral-800/50 dark:bg-neutral-700/50 overflow-hidden">
        <div
          className={`h-full bg-blue-500 transition-all duration-700 ${progressWidthClass}`}
        />
      </div>

      {/* Tiny reassurance text */}
      {visualPhase !== "done" && (
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-4">
          This only takes a few seconds.
        </p>
      )}
    </div>
  );
};
