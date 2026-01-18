/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

/* Types */
import type { ManualImportSelectionType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { ImportPhase } from "@/core/types/importPhase";

/* Constants */
import { ImportPostProcessMode } from "@/core/constants/import";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";

/* Components */
import { ImportProgress } from "@/components/shared/ImportProgress";
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
  purposes: PurposeIdType[];
  selection: ManualImportSelectionType;
  onDone: (primaryWorkspaceId: string) => void;

  onBusyChange?: (busy: boolean) => void;
  onProgress?: (msg: string) => void;
  onError?: (err: string | null) => void;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export const ManualImportStep: React.FC<ManualImportStepProps> = ({
  purposes,
  selection,
  onDone,
  onBusyChange,
  onProgress,
  onError,
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

   // Stable purpose key
  const purposesKey = useMemo(() => (purposes ?? []).join("|"), [purposes]);

  // StrictMode-safe run token
  const runTokenRef = useRef(0);

  useEffect(() => {
    if (!purposes || purposes.length === 0) return;

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
        const refs: { id: string; purpose: PurposeIdType }[] = [];
        for (const p of purposes) {
          refs.push(await workspaceService.createWorkspaceForPurpose(p));
        }

        if (cancelled || token !== runTokenRef.current) return;

        bumpWorkspacesVersion();

        const primary = refs[0];
        if (!primary) throw new Error("Workspace not ready yet.");

        // Now committing the import payload
        setBackendPhase("importing");

        await commitManualImportIntoWorkspace({
          selection: selectionRef.current,
          purposes,
          workspaceId: primary.id,
          purpose: primary.purpose,
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
    purposesKey,
    workspaceService,
    bumpWorkspacesVersion,
    onBusyChange,
    onProgress,
    onError,
    autoOrganizeEnabled,
  ]);

  useEffect(() => {
    if (!pendingDoneWorkspaceId) return;
    if (!visualDone) return;
    onDoneRef.current(pendingDoneWorkspaceId);
  }, [pendingDoneWorkspaceId, visualDone]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  // If AI is enabled, show the shared SmartImport-style UI
  if (autoOrganizeEnabled) {
    return (
      <ImportProgress
        phaseSequence={phaseSequence}
        backendPhase={backendPhase}
        backendMessage={commitMessage}
        donePhaseId="done"
        onVisualDoneChange={setVisualDone}
      />
    );
  }

  // Otherwise keep the simpler UI for non-AI manual commit
  return (
    <div className="m_import-container">
      {commitError ? (
        <div className="text-sm text-red-600">{commitError}</div>
      ) : (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {isCommitting ? (commitMessage || "Importing ...") : "All set! You can open Mindful."}
        </div>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
