/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

/* Types */
import type { ManualImportSelectionType } from "@/core/types/import";
import type { ImportPhase } from "@/core/types/importPhase";

/* Constants */
import { ImportPostProcessMode } from "@/core/constants/import";
import { PurposeId } from "@shared/constants/purposeId";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";
import { pruneNewWorkspacePlaceholders } from "@/scripts/workspaces/registry";

/* Components */
import { ImportProgress } from "@/components/shared/ImportProgress";
import { AiDisclosure } from "@/components/privacy/AiDisclosure";
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const MANUAL_AI_PHASES: readonly ImportPhase[] = [
  "initializing",
  "importing",
  "categorizing",
  "finalizing",
  "done",
];

const MANUAL_NOAI_PHASES: readonly ImportPhase[] = [
  "initializing",
  "importing",
  "finalizing",
  "done",
];
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ManualImportStepProps = {
  selection: ManualImportSelectionType;
  onDone: (primaryWorkspaceId: string) => void;

  onBusyChange?: (busy: boolean) => void;
  onProgress?: (msg: string) => void;
  onError?: (err: string | null) => void;
  singleWorkspace?: boolean;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export const ManualImportStep: React.FC<ManualImportStepProps> = ({
  selection,
  onDone,
  onBusyChange,
  onProgress,
  onError,
  singleWorkspace,
}) => {
  /* -------------------- Context / state -------------------- */
  const { userId, bumpWorkspacesVersion } = useContext(AppContext);

  const workspaceService = useMemo(() => createWorkspaceServiceLocal(userId), [userId]);

  const autoOrganizeEnabled =
    selection.importPostProcessMode === ImportPostProcessMode.SemanticGrouping;

  const phaseSequence = autoOrganizeEnabled ? MANUAL_AI_PHASES : MANUAL_NOAI_PHASES;

  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string>("");

  // Backend phase for progress UI
  const [backendPhase, setBackendPhase] = useState<ImportPhase>("initializing");

  const [visualDone, setVisualDone] = useState(false);
  const [pendingDoneWorkspaceId, setPendingDoneWorkspaceId] = useState<string | null>(null);

  // Keep latest callbacks/selection without re-triggering effect
  const onDoneRef = useRef(onDone);
  const selectionRef = useRef(selection);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

   // StrictMode-safe run token
  const runTokenRef = useRef(0);

  useEffect(() => {
    const token = ++runTokenRef.current;
    let cancelled = false;

    (async () => {
      setCommitError(null);
      setIsCommitting(true);
      setCommitMessage("");
      setBackendPhase("initializing");
      setPendingDoneWorkspaceId(null);
      setVisualDone(false);
      onError?.(null);
      onBusyChange?.(true);
      onProgress?.("Preparing workspaces...");

      try {
        const primary = await workspaceService.createWorkspaceForPurpose(PurposeId.Personal);

        if (cancelled || token !== runTokenRef.current) return;

        bumpWorkspacesVersion();

        // Now committing the import payload
        setBackendPhase("importing");

        await commitManualImportIntoWorkspace({
          selection: selectionRef.current,
          workspaceId: primary.id,
          purpose: primary.purpose,
          singleWorkspace,
          workspaceService,
          onProgress: (msg) => {
            if (cancelled || token !== runTokenRef.current) return;

            // Optional heuristic until commitManualImportIntoWorkspace emits phases:
            if (autoOrganizeEnabled && /organ|group|categor/i.test(msg)) {
              setBackendPhase("categorizing");
            }

            setCommitMessage(msg);
            onProgress?.(msg);
          },

          // Best: if you add this optional callback in commitManualImportIntoWorkspace later:
          // onPhaseChange: (phase: ImportPhase) => {
          //   if (cancelled || token !== runTokenRef.current) return;
          //   setBackendPhase(phase);
          // },
        });

        if (cancelled || token !== runTokenRef.current) return;

        await pruneNewWorkspacePlaceholders();
        bumpWorkspacesVersion();
        setBackendPhase("finalizing");
        setCommitMessage("Import complete.");
        onProgress?.("Import complete.");

        // Done
        setBackendPhase("done");
        setPendingDoneWorkspaceId(primary.id);
      } catch (e: any) {
        if (cancelled || token !== runTokenRef.current) return;
        const msg = e?.message || "Import failed";
        setCommitError(msg);
        onError?.(msg);
      } finally {
        if (cancelled || token !== runTokenRef.current) return;
        setIsCommitting(false);
        // Keep last commit message around so the UI doesn't go empty while it smooths to done.
        onBusyChange?.(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    workspaceService,
    bumpWorkspacesVersion,
    onBusyChange,
    onProgress,
    onError,
    autoOrganizeEnabled,
  ]);

  useEffect(() => {
    if (!pendingDoneWorkspaceId) return;
      // If AI is enabled, wait until the progress UI finishes its visual "done" animation.
      if (autoOrganizeEnabled) {
        if (!visualDone) return;
      }
      // If AI is NOT enabled, we never render ImportProgress, so visualDone will never flip.
      // In that case, notify immediately once the commit is complete.
      onDoneRef.current(pendingDoneWorkspaceId);
    }, [pendingDoneWorkspaceId, visualDone, autoOrganizeEnabled]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  // If AI is enabled, show the shared SmartImport-style UI
  if (autoOrganizeEnabled) {
    return (
      <div className="space-y-3">
        <ImportProgress
          phaseSequence={phaseSequence}
          backendPhase={backendPhase}
          backendMessage={commitMessage}
          donePhaseId="done"
          onVisualDoneChange={setVisualDone}
        />
      </div>
    );
  }

  // Otherwise keep the simpler UI for non-AI manual commit
  return (
    <div className="m_import-container">
      {commitError ? (
        <div className="text-sm text-red-600">{commitError}</div>
      ) : (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {isCommitting ? (commitMessage || "Importing ...") : "Your space is ready."}
        </div>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
