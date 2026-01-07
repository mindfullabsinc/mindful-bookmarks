/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useRef } from "react";

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

  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );

  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string>(""); // optional

  const onDoneRef = useRef(onDone);
  // Create a stable key for purposes so deps don't thrash
  const purposesKey = useMemo(() => (purposes ?? []).join("|"), [purposes]);
  const hasRunRef = useRef(false);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!purposes || purposes.length === 0) return;

    // Prevent duplicates (StrictMode double-mount, re-renders, back/forward)
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let cancelled = false;

    (async () => {
      setCommitError(null);
      setIsCommitting(true);
      onError?.(null);
      onBusyChange?.(true);
      onProgress?.("Preparing workspaces ...");

      try {
        const refs: { id: string; purpose: PurposeIdType }[] = [];
        for (const p of purposes) {
          refs.push(await workspaceService.createWorkspaceForPurpose(p));
        }
        if (cancelled) return;

        bumpWorkspacesVersion();

        const primary = refs[0];
        if (!primary) throw new Error("Workspace not ready yet.");

        await commitManualImportIntoWorkspace({
          selection,
          purposes,
          workspaceId: primary.id,
          purpose: primary.purpose,
          workspaceService,
          onProgress: (msg) => {
            if (cancelled) return;
            setCommitMessage(msg);
            onProgress?.(msg);
          },
        });

        if (cancelled) return;

        bumpWorkspacesVersion();
        onProgress?.("Import complete.");
        onDoneRef.current(primary.id);
      } catch (e: any) {
        const msg = e?.message || "Import failed";
        if (!cancelled) {
          setCommitError(msg);
          onError?.(msg);
        }
      } finally {
        if (!cancelled) {
          setIsCommitting(false);
          setCommitMessage("");
          onBusyChange?.(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };

    // IMPORTANT: depend on purposesKey, not purposes array identity
  }, [purposesKey, workspaceService, bumpWorkspacesVersion, selection]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  return (
    <div className="m_import-container">
      {commitError ? (
        <div className="text-sm text-red-600">{commitError}</div>
      ) : (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {isCommitting
            ? (commitMessage || "Importing ...")
            : "All set — you can open Mindful."}
        </div>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
