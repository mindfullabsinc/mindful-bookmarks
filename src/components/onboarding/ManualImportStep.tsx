/* -------------------- Imports -------------------- */
import React, { useEffect, useState } from "react";

/* Types */
import type { 
  ChromeImportOptions,
  OpenTabsOptions,
} from "@/core/types/import";

/* Hooks */
import useImportBookmarks from '@/hooks/useImportBookmarks';

/* Components */
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksModal";
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type ManualImportStepProps = {
  setPrimaryDisabled?: (disabled: boolean) => void;
};
/* ---------------------------------------------------------- */

/**
 * Onboarding step that guides users through manual import flows (Chrome, JSON, tabs).
 *
 * @param props.setPrimaryDisabled Callback allowing parent to disable the primary button until import completes.
 */
export const ManualImportStep: React.FC<ManualImportStepProps> = ({
  setPrimaryDisabled,
}) => {
  /* -------------------- Context / state -------------------- */
  const [hasImported, setHasImported] = useState(false);
  const [wizardDone, setWizardDone] = useState(false);

   const {
    handleUploadJson,
    handleImportChrome,
    handleImportOpenTabs,
  } = useImportBookmarks();
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Wrap JSON import to set the "hasImported" flag.
   *
   * @param file Bookmarks export file.
   */
  const handleUploadJsonWithFlag = async (file: File) => {
    try {
      await handleUploadJson(file);
      setHasImported(true);
    } catch (e) {
      console.error("JSON import failed in ManualImportStep", e);
      // ImportBookmarksContent will already show an error message
    }
  };

  /**
   * Wrap Chrome import to set the "hasImported" flag.
   *
   * @param options Import pipeline options describing mode/strategy.
   */
  const handleImportChromeWithFlag = async (options: ChromeImportOptions) => {
    try {
      await handleImportChrome(options);
      setHasImported(true);
    } catch (e) {
      console.error("Chrome import failed in ManualImportStep", e);
    }
  };

  /**
   * Wrap open-tabs import to set the "hasImported" flag.
   *
   * @param options Import options describing tab scope.
   */
  const handleImportOpenTabsWithFlag = async (options: OpenTabsOptions) => {
    try {
      await handleImportOpenTabs(options);
      setHasImported(true);
    } catch (e) {
      console.error("Open tabs import failed in ManualImportStep", e);
    }
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Disable primary until user *either* imported something or finished the wizard
   */
  useEffect(() => {
    const shouldDisable = !hasImported && !wizardDone;
    setPrimaryDisabled?.(shouldDisable);
  }, [hasImported, wizardDone, setPrimaryDisabled]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering -------------------- */
  return (
    <div className="m_import-container">
      <ImportBookmarksEmbedded
        onUploadJson={handleUploadJsonWithFlag}
        onImportChrome={handleImportChromeWithFlag}
        onImportOpenTabs={handleImportOpenTabsWithFlag}
        onComplete={() => setWizardDone(true)}
      />
    </div>
  );
  /* ---------------------------------------------------------- */
};
