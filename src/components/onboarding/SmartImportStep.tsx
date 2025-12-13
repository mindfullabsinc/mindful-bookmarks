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
import type { PurposeIdType } from "@shared/types/purposeId";

/* Constants */
import { PHASE_MESSAGES } from "@/core/constants/smartImportPhase";

/* Hooks */
import { useSmartImport } from "@/hooks/useSmartImport";

/* App context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Service implementations */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";
import { chromeBrowserSourceService } from "@/scripts/import/browserSourceServiceChrome";
import { basicNsfwFilter } from "@/scripts/import/nsfwFilter";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type SmartImportStepProps = {
  purposes: PurposeIdType[];
  onDone: (primaryWorkspaceId: string) => void;
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

/**
 * Smart import progress step that orchestrates the background import and shows visual phase updates.
 *
 * @param props.purposes Ordered list of purposes selected in the onboarding flow.
 */
export const SmartImportStep: React.FC<SmartImportStepProps> = ({
  purposes,
  onDone,
}) => {
  const { userId, bumpWorkspacesVersion } = useContext(AppContext);

  // Build a user-scoped WorkspaceService
  /**
   * Memoize a user-scoped workspace service so imports land in the correct namespace.
   */
  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );

  /**
   * Memoize base options passed to the smart import hook (source adapters, filters, etc.)
   */
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

  // Guard so we only call onDone once per mount
  const notifiedRef = useRef(false);

  // Visual phase index for the loading UI
  const [visualPhaseIndex, setVisualPhaseIndex] = useState(0);
  const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState<string | null>(
    null
  );

  const visualPhase: VisualPhase = PHASE_SEQUENCE[visualPhaseIndex];

  /**
   * Kick off the smart import job once the component mounts and purposes are available.
   */
  useEffect(() => {
    if (!purposes || purposes.length === 0) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const id = await start(purposes);
        if (!cancelled) {
          if (id) setPrimaryWorkspaceId(id);
          bumpWorkspacesVersion();
        }
      } catch (err) {
        console.error("[SmartImportStep] error during smart import", err);
        if (!cancelled) {
          bumpWorkspacesVersion();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purposes, start, bumpWorkspacesVersion]);  

  /**
   * After backend is done, tell parent which workspace to activate.
   */
  useEffect(() => {
    if (
      !notifiedRef.current &&
      backendPhase === "done" &&
      primaryWorkspaceId
    ) {
      notifiedRef.current = true;
      onDone(primaryWorkspaceId);
    }
  }, [backendPhase, primaryWorkspaceId, onDone]);
  /* ---------------------------------------------------------- */

  /* -------------------- Visual phase smoothing -------------------- */
  // Whenever the backend phase moves ahead in the sequence, walk the
  // visual phase forward one step every MIN_PHASE_DURATION_MS until
  // it catches up. This guarantees intermediate steps are visible.
  /**
   * Smooth the UI progress by advancing one phase at a time until it catches up with the backend.
   */
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
    <div className="s_import-container">
      
      {/* Icon */}
      <div className="s_import-icon-container">
        {visualPhase === "done" ? (
          <Wand2 className="s_import-icon s_import-icon-wand" />
        ) : (
          <Loader2 className="s_import-icon s_import-icon-loader" />
        )}
      </div>

      {/* Title */}
      <h2 className="s_import-title">
        {visualPhase === "done" ? "You're all set!" : "Preparing your space ..."}
      </h2>

      {/* Dynamic message from backend/visual progress */}
      <p className="s_import-dynamic-message">
        {effectiveMessage}
      </p>

      {/* Progress bar */}
      <div className="s_import-progress-bar-container">
        <div
          className={`s_import-progress-bar ${progressWidthClass}`}
        />
      </div>

      {/* Tiny reassurance text */}
      {visualPhase !== "done" && (
        <p className="s_import-reassurance-text">
          This only takes a few seconds.
        </p>
      )}

    </div>
  );
};
