/* -------------------- Imports -------------------- */
import React, {
  useEffect,
  useMemo,
  useContext,
  useRef,
  useState,
} from "react";

/* Types */
import type { PurposeIdType } from "@shared/types/purposeId";
import type { ImportPhase } from "@/core/types/importPhase";

/* Hooks */
import { useSmartImport } from "@/hooks/useSmartImport";

/* App context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Service implementations */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";
import { chromeBrowserSourceService } from "@/scripts/import/browserSourceServiceChrome";
import { basicNsfwFilter } from "@/scripts/import/nsfwFilter";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";

/* Components */
import { ImportProgress } from "@/components/shared/ImportProgress";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type SmartImportStepProps = {
  purposes: PurposeIdType[];
  onDone: (primaryWorkspaceId: string) => void;
  onBusyChange?: (busy: boolean) => void;
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

/**
 * Smart import progress step that orchestrates the background import and shows visual phase updates.
 *
 * @param props.purposes Ordered list of purposes selected in the onboarding flow.
 */
export const SmartImportStep: React.FC<SmartImportStepProps> = ({
  purposes,
  onDone,
  onBusyChange,
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

  const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState<string | null>(
    null
  );

  /**
   * Kick off the smart import job once the component mounts and purposes are available.
   */
  useEffect(() => {
    if (!purposes || purposes.length === 0) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    onBusyChange?.(true);

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
      } finally {
        if (!cancelled) {
          onBusyChange?.(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      onBusyChange?.(false);
    };
  }, [purposes, start, bumpWorkspacesVersion, onBusyChange]);  

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
      onBusyChange?.(false);
      onDone(primaryWorkspaceId);
    }
  }, [backendPhase, primaryWorkspaceId, onDone, onBusyChange]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component logic -------------------- */
  return (
    <ImportProgress
      phaseSequence={PHASE_SEQUENCE}
      backendPhase={backendPhase as ImportPhase}
      backendMessage={message}
      donePhaseId="done"
    /> 

    // <div className="s_import-container">
      
    //   {/* Icon */}
    //   <div className="s_import-icon-container">
    //     {visualPhase === "done" ? (
    //       <Wand2 className="s_import-icon s_import-icon-wand" />
    //     ) : (
    //       <Loader2 className="s_import-icon s_import-icon-loader" />
    //     )}
    //   </div>

    //   {/* Title */}
    //   <h2 className="s_import-title">
    //     {visualPhase === "done" ? "You're all set!" : "Preparing your space ..."}
    //   </h2>

    //   {/* Dynamic message from backend/visual progress */}
    //   <p className="s_import-dynamic-message">
    //     {effectiveMessage}
    //   </p>

    //   {/* Progress bar */}
    //   <div className="s_import-progress-bar-container">
    //     <div
    //       className={`s_import-progress-bar ${progressWidthClass}`}
    //     />
    //   </div>

    //   {/* Tiny reassurance text */}
    //   {visualPhase !== "done" && (
    //     <p className="s_import-reassurance-text">
    //       This only takes a few seconds.
    //     </p>
    //   )}

    // </div>
  );
};
