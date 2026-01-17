/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

/* Types */
import type { ManualImportSelectionType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";
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

  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string>("");

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
      onError?.(null);
      onBusyChange?.(true);
      onProgress?.("Preparing workspaces...");

      try {
        const refs: { id: string; purpose: PurposeIdType }[] = [];
        for (const p of purposes) {
          refs.push(await workspaceService.createWorkspaceForPurpose(p));
        }

        // Abort if superseded / unmounted
        if (cancelled || token !== runTokenRef.current) return;

        bumpWorkspacesVersion();

        const primary = refs[0];
        if (!primary) throw new Error("Workspace not ready yet.");

        await commitManualImportIntoWorkspace({
          selection: selectionRef.current,
          purposes,
          workspaceId: primary.id,
          purpose: primary.purpose,
          workspaceService,
          onProgress: (msg) => {
            if (cancelled || token !== runTokenRef.current) return;
            setCommitMessage(msg);
            onProgress?.(msg);
          },
        });

        if (cancelled || token !== runTokenRef.current) return;

        bumpWorkspacesVersion();
        onProgress?.("Import complete.");
        onDoneRef.current(primary.id);
      } catch (e: any) {
        if (cancelled || token !== runTokenRef.current) return;
        const msg = e?.message || "Import failed";
        setCommitError(msg);
        onError?.(msg);
      } finally {
        if (cancelled || token !== runTokenRef.current) return;
        setIsCommitting(false);
        setCommitMessage("");
        onBusyChange?.(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purposesKey, workspaceService, bumpWorkspacesVersion, onBusyChange, onProgress, onError]); 
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
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
