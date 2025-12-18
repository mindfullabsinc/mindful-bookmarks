/* -------------------- Imports -------------------- */
import React from "react";
import { createPortal } from "react-dom";

/* Types */
import type { ImportBookmarksContentProps } from "@/components/shared/ImportBookmarksContent";

/* Styling */
import '@/styles/components/modals/ImportBookmarksModal.css';

/* Components */
import { ImportBookmarksContent } from '@/components/shared/ImportBookmarksContent'
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type ImportBookmarksModalProps = {
  isOpen: boolean;
  onClose: () => void;
} & Omit<ImportBookmarksContentProps, "variant" | "onClose">;
/* ---------------------------------------------------------- */

export default function ImportBookmarksModal({
  isOpen,
  onClose,
  ...contentProps
}: ImportBookmarksModalProps): React.ReactElement | null {
  const { busy } = contentProps;
  
  if (!isOpen) return null;
  const modal = (
    <div className="modal-import-styles">
      <div className="modal-container" role="dialog" aria-modal="true">
        <div className="modal-backdrop" onClick={onClose} />
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          
          {/* Modal-specific header and close button */}
          <div className="modal-header-container">
            <h2
              id="import-title"
              className="modal-title"
            >
              Import bookmarks
            </h2>
            <button
              onClick={() => !busy && onClose?.()}
              disabled={busy}
              className="close-button"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          
          {/* Shared ImportBookmarksContent */}
          <ImportBookmarksContent {...contentProps} variant="modal" onClose={onClose} />
        
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}