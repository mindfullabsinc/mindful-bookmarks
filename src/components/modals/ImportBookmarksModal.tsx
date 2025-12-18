/* -------------------- Imports -------------------- */
import React, { useContext, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/* Types */
import type { ImportBookmarksContentProps } from "@/components/shared/ImportBookmarksContent";
import type { ManualImportSelectionType } from "@/core/types/import";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";

/* Services */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Styling */
import '@/styles/components/modals/ImportBookmarksModal.css';

/* Components */
import { ImportBookmarksContent } from '@/components/shared/ImportBookmarksContent'
import { PurposeId } from "@shared/constants/purposeId";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type ImportBookmarksModalProps = {
  isOpen: boolean;
  onClose: () => void;
} & Omit<ImportBookmarksContentProps, "variant" | "onClose" | "onComplete">;
/* ---------------------------------------------------------- */

export default function ImportBookmarksModal({
  isOpen,
  onClose,
}: ImportBookmarksModalProps): React.ReactElement | null {
  /* -------------------- Context -------------------- */
  const {
    userId,
    activeWorkspaceId,
    workspaces,
    bumpWorkspacesVersion,
  } = useContext(AppContext);

  const activeWorkspace =
    activeWorkspaceId && workspaces
      ? workspaces[activeWorkspaceId]
      : null;
  /* ---------------------------------------------------------- */
    
  /* -------------------- Local state -------------------- */
  const [selection, setSelection] = useState<ManualImportSelectionType>({});
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  /* ---------------------------------------------------------- */

  /* -------------------- Services -------------------- */
  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Commit handler -------------------- */
  const onComplete = async () => {
    if (!activeWorkspace) throw new Error("No active workspace.");
    setErrorMessage(undefined);
    setBusy(true);

    try {
      await commitManualImportIntoWorkspace({
        selection,
        purposes: [PurposeId.Personal], // or onboardingPurposes if you want
        workspaceId: activeWorkspace.id,
        purpose: PurposeId.Personal,
        workspaceService,
        onProgress: setBusyMessage,
      });

      bumpWorkspacesVersion();
    } catch (e: any) {
      setErrorMessage(e?.message ?? "Import failed");
      throw e; // important: prevents auto-close
    } finally {
      setBusy(false);
      setBusyMessage(undefined);
    }
  };
  /* ---------------------------------------------------------- */
  
  /* -------------------- Main component rendering -------------------- */
  if (!isOpen) return null;
  const modal = (
    <div className="modal-import-styles">
      <div className="modal-container" role="dialog" aria-modal="true">
        <div
          className="modal-backdrop"
          onClick={() => !busy && onClose()}
        />
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header-container">
            <h2 id="import-title" className="modal-title">
              Import bookmarks
            </h2>
            <button
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="close-button"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Wizard */}
          <ImportBookmarksContent
            variant="modal"
            onClose={onClose}
            onSelectionChange={setSelection}
            onComplete={onComplete}
            busy={busy}
            busyMessage={busyMessage}
            errorMessage={errorMessage}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
  /* ---------------------------------------------------------- */
}