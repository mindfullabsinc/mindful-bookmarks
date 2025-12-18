/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";

/* Types */
import type { ManualImportSelectionType, ImportSourceType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";

/* Components */
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksEmbedded";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ManualImportStepProps = {
  setPrimaryDisabled?: (disabled: boolean) => void;
  purposes: PurposeIdType[];
  onDone: (primaryWorkspaceId: string) => void;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export const ManualImportStep: React.FC<ManualImportStepProps> = ({
  setPrimaryDisabled,
  purposes,
  onDone,
}) => {
  /* -------------------- Context / state -------------------- */
  const { userId, bumpWorkspacesVersion } = useContext(AppContext);

  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );

  const [wizardDone, setWizardDone] = useState(false);
  const [selection, setSelection] = useState<ManualImportSelectionType>({});

  const [workspaceRefs, setWorkspaceRefs] = useState<
    { id: string; purpose: PurposeIdType }[]
  >([]);

  const primaryWorkspace = workspaceRefs[0] ?? null;
  const primaryWorkspaceId = primaryWorkspace?.id ?? null;

  const hasAnySelection =
    !!selection.jsonData ||
    !!selection.importBookmarks ||
    selection.tabScope !== undefined; // tabScope can be a stringy enum; check explicitly

  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string>(""); // optional
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const commitAllImports = useCallback(async () => {
    if (!primaryWorkspace) throw new Error("Workspace not ready yet.");

    setCommitError(null);
    setIsCommitting(true);

    try {
      await commitManualImportIntoWorkspace({
        selection,
        purposes,
        workspaceId: primaryWorkspace.id,
        purpose: primaryWorkspace.purpose,
        workspaceService,
        onProgress: setCommitMessage,
      });

      bumpWorkspacesVersion();
      setWizardDone(true);
    } catch (e: any) {
      console.error("[ManualImportStep] commit failed", e);
      setCommitError(e?.message || "Import failed");
    } finally {
      setIsCommitting(false);
      setCommitMessage("");
    }
  }, [primaryWorkspace, selection, purposes, workspaceService, bumpWorkspacesVersion]);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!purposes || purposes.length === 0) return;

      try {
        const refs: { id: string; purpose: PurposeIdType }[] = [];
        for (const p of purposes) {
          refs.push(await workspaceService.createWorkspaceForPurpose(p));
        }
        if (!cancelled) {
          setWorkspaceRefs(refs);
          bumpWorkspacesVersion();
        }
      } catch (e) {
        console.error("[ManualImportStep] failed to create workspaces", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purposes, workspaceService, bumpWorkspacesVersion]);

  useEffect(() => {
    // Disable primary button until:
    // - they’ve made a selection AND wizard is not done
    setPrimaryDisabled?.(!hasAnySelection && !wizardDone);
  }, [hasAnySelection, wizardDone, setPrimaryDisabled]);

  useEffect(() => {
    if (!wizardDone || !primaryWorkspaceId) return;
    onDone(primaryWorkspaceId);
  }, [wizardDone, primaryWorkspaceId, onDone]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  if (!primaryWorkspaceId) {
    return <div className="m_import-container">Preparing your workspaces…</div>;
  }

  return (
    <div className="m_import-container">
      <ImportBookmarksEmbedded
        onSelectionChange={setSelection}
        onComplete={commitAllImports}
        busy={isCommitting}
        busyMessage={commitMessage}
        errorMessage={commitError ?? undefined}
      />
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
