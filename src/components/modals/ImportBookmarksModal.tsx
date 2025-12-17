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
  if (!isOpen) return null;

  const modal = (
    <div className="modal-container">
      <div className="modal-backdrop" onClick={onClose} />
      <ImportBookmarksContent {...contentProps} variant="modal" onClose={onClose} />
    </div>
  );

  return createPortal(modal, document.body);
}