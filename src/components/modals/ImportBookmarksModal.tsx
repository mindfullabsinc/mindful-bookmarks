/* -------------------- Imports -------------------- */
import React from "react";
import { createPortal } from "react-dom";

/* Types */
import type { ChromeImportOptions, OpenTabsOptions } from "@/core/types/import";
import type { ImportBookmarksContentProps } from "@/components/shared/ImportBookmarksContent";

/* Styling */
import '@/styles/components/modals/ImportBookmarksModal.css';

/* Components */
import { ImportBookmarksContent } from '@/components/shared/ImportBookmarksContent'
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
interface ImportBookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadJson: (file: File) => Promise<void> | void;
  onImportChrome: (options: ChromeImportOptions) => Promise<void> | void;
  onImportOpenTabs?: (options: OpenTabsOptions) => Promise<void> | void;
}
/* ---------------------------------------------------------- */

/**
 * Portal-based modal wrapper around ImportBookmarksContent.
 *
 * @param props.isOpen Whether the modal is visible.
 * @param props.onClose Handler to close the modal.
 * @param props.onUploadJson Handler to process uploaded JSON files.
 * @param props.onImportChrome Handler to import from Chrome storage.
 * @param props.onImportOpenTabs Optional handler to import currently open tabs.
 */
export default function ImportBookmarksModal({
  isOpen,
  onClose,
  onUploadJson,
  onImportChrome,
  onImportOpenTabs,
}: ImportBookmarksModalProps): React.ReactElement | null {
  if (!isOpen) return null;

  const modal = (
    <div className="modal-container">
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={onClose}
      />

      {/* Panel */}
      <ImportBookmarksContent
        variant="modal"
        onClose={onClose}
        onUploadJson={onUploadJson}
        onImportChrome={onImportChrome}
        onImportOpenTabs={onImportOpenTabs}
      />
    </div>
  );

  return createPortal(modal, document.body);
}

/**
 * Embedded variant of the import flow used inside onboarding without overlays/cancel.
 *
 * @param props Import content props minus the variant, which is forced to "embedded".
 */
export function ImportBookmarksEmbedded(
  props: Omit<ImportBookmarksContentProps, "variant"> 
) {
  return (
    <ImportBookmarksContent
      {...props}
      variant="embedded"
    />
  );
}
