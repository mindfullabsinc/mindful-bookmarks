/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppContext, OnboardingStatus } from "@/scripts/AppContextProvider";


/* Constants */
import { ImportPostProcessMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type { OpenTabsScopeType } from "@/core/types/import";

/* File format detection */
import {
  type FilePreview,
  detectFileFormat,
  formatFilePreviewText,
} from "@/scripts/import/fileFormatDetection";
import { parseFileToRawItems } from "@/scripts/import/commitManualImportIntoWorkspace";

/* Hooks */
import { useManualImportWizardState } from "@/hooks/useManualImportWizardState";

/* Components */
import { ThemeSelectorStep } from "@/components/onboarding/ThemeSelectorStep";
import { PurposeStep } from "@/components/onboarding/PurposeStep";
import { ImportBookmarksStep } from "@/components/onboarding/ImportBookmarksStep";
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";
import { ManualImportStep } from "@/components/onboarding/ManualImportStep";
import { PinExtensionStep } from "@/components/onboarding/PinExtensionStep";
/* ---------------------------------------------------------- */

/* -------------------- Local types / interfaces -------------------- */
type OnboardingStepId =
  | "selectTheme"
  | "setPurpose"
  | "selectImportSources"
  | "onboardingFileUpload"
  | "importBookmarks"
  | "smartImport"
  | "manualImportCommit"
  | "pinExtension"
  | "tips";

type OnboardingStepConfig = {
  id: OnboardingStepId;
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  hideBack?: boolean;
  isFinal?: boolean;
  primaryDisabled?: boolean;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export const OnboardingOverlay: React.FC = () => {
  /* -------------------- Context / state -------------------- */
  const {
    onboardingStatus,
    onboardingReopen,
    shouldShowOnboarding,
    completeOnboarding,
    closeOnboarding,
    skipOnboarding,
    onboardingPurposes,
    setActiveWorkspaceId,
    bookmarkGroups,
    workspaces,
    bumpPostImport,
  } = useContext(AppContext);

  const hasExistingData = bookmarkGroups.some(
    (g) => g.id !== "EMPTY_GROUP_IDENTIFIER" && g.groupName !== "EMPTY_GROUP_IDENTIFIER" && g.bookmarks?.length > 0
  );

  // Local-only step index; AppContext just knows "in_progress vs done".
  const [stepIndex, setStepIndex] = useState(0);

  // Shared "disable primary" flag that individual steps control
  const [importPrimaryDisabled, setImportPrimaryDisabled] = useState(true);

  // Track the primary workspace id produced by Smart Import
  const [smartImportPrimaryWorkspaceId, setSmartImportPrimaryWorkspaceId] =
    useState<string | null>(null);

  // Track the primary workspace id produced by Manual Import
  const [manualImportPrimaryWorkspaceId, setManualImportPrimaryWorkspaceId] =
    useState<string | null>(null);

  // Track which import flow the user picked on the ImportBookmarksStep
  const [importFlow, setImportFlow] = useState<"smart" | "manual" | null>(null);

  // Track what sources the user wants to import (step before importBookmarks)
  const [importSources, setImportSources] = useState({
    chromeBookmarks: true,
    openTabs: true,
    importFromFile: false,
  });
  const [tabScope, setTabScope] = useState<OpenTabsScopeType>(OpenTabsScope.All);

  // File upload state (for the onboardingFileUpload step)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadIsDragOver, setFileUploadIsDragOver] = useState(false);
  const [fileUploadPreview, setFileUploadPreview] = useState<FilePreview | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | undefined>();

  // Manual import state
  const {
    state: manualState,
    selection: manualSelection,
    reset: resetManualWizard
  } = useManualImportWizardState({
    bookmarksYes: false,
    tabsYes: false,
    postProcessMode: ImportPostProcessMode.PreserveStructure,
  });

  const [manualCommitBusy, setManualCommitBusy] = useState(false);
  const [manualCommitMessage, setManualCommitMessage] = useState<string>("");
  const [manualCommitError, setManualCommitError] = useState<string | null>(null);

  // Smart import state
  const [smartImportBusy, setSmartImportBusy] = useState(false);

  // Parse the uploaded file into RawItems once so SmartImportStep can include them
  const fileRawItems = useMemo(() => {
    if (!manualState.jsonData || !manualState.jsonFileName) return undefined;
    return parseFileToRawItems(manualState.jsonData, manualState.jsonFileName);
  }, [manualState.jsonData, manualState.jsonFileName]);
  /* ---------------------------------------------------------- */

  /* -------------------- File upload helpers -------------------- */
  async function processUploadedFile(file: File) {
    const isJson = file.name.endsWith(".json") || file.type === "application/json";
    const isHtml =
      file.name.endsWith(".html") ||
      file.name.endsWith(".htm") ||
      file.type === "text/html";
    if (!isJson && !isHtml) {
      setFileUploadError("Please choose a .json or .html file.");
      return;
    }
    try {
      const text = await file.text();
      if (isJson) JSON.parse(text);
      manualState.setJsonFileName(file.name);
      manualState.setJsonData(text);
      manualState.setJsonYes(true);
      setFileUploadPreview(detectFileFormat(file.name, text));
      setFileUploadError(undefined);
    } catch {
      setFileUploadError("Invalid file. Please choose a valid .json or .html file.");
    }
  }

  function clearFileUpload() {
    manualState.setJsonFileName(null);
    manualState.setJsonData(null);
    manualState.setJsonYes(false);
    setFileUploadPreview(null);
    setFileUploadError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Sync importSources → manualState -------------------- */
  // When the user picks "Keep my existing structure", pre-populate manualState
  // from the answers they already gave in the selectImportSources / onboardingFileUpload steps.
  useEffect(() => {
    if (importFlow !== "manual") return;
    manualState.setBookmarksYes(importSources.chromeBookmarks);
    manualState.setTabsYes(importSources.openTabs);
    manualState.setTabScope(tabScope);
    manualState.setPostProcessMode(ImportPostProcessMode.PreserveStructure);
    // jsonYes / jsonData / jsonFileName are already set by processUploadedFile during onboardingFileUpload
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importFlow]);
  /* ---------------------------------------------------------- */

  /* -------------------- Step config (dynamic) -------------------- */
  const STEPS: OnboardingStepConfig[] = [];

  // 1. Theme
  STEPS.push({
    id: "selectTheme",
    title: "Welcome to Mindful!",
    subtitle:
      'Create visual groups for different projects, save pages into those groups, and see your "board" every time you open a new tab.',
    body: <ThemeSelectorStep />,
    primaryLabel: "Next",
    hideBack: true,
  });

  // 2. Purpose
  STEPS.push({
    id: "setPurpose",
    title: "What brings you to Mindful?",
    body: <PurposeStep setPrimaryDisabled={setImportPrimaryDisabled} />,
    primaryLabel: "Next",
    secondaryLabel: "Back",
    primaryDisabled: importPrimaryDisabled,
  });

  // 3. What to import
  STEPS.push({
    id: "selectImportSources",
    title: "What should we import?",
    body: (
      <div className="import-styles">
        {/* Chrome bookmarks */}
        <button
          type="button"
          onClick={() => setImportSources((prev) => ({ ...prev, chromeBookmarks: !prev.chromeBookmarks }))}
          className={"checkbox-row " + (importSources.chromeBookmarks ? "checkbox-row--checked" : "checkbox-row--unchecked")}
          role="checkbox"
          aria-checked={importSources.chromeBookmarks}
        >
          <span className={"checkbox-box " + (importSources.chromeBookmarks ? "checkbox-box--checked" : "checkbox-box--unchecked")} aria-hidden="true">✓</span>
          <span className="checkbox-label-container">
            <span className="checkbox-label">Chrome bookmarks</span>
          </span>
        </button>

        {/* Open tabs + animated scope picker */}
        <button
          type="button"
          onClick={() => setImportSources((prev) => ({ ...prev, openTabs: !prev.openTabs }))}
          className={"checkbox-row " + (importSources.openTabs ? "checkbox-row--checked" : "checkbox-row--unchecked")}
          role="checkbox"
          aria-checked={importSources.openTabs}
        >
          <span className={"checkbox-box " + (importSources.openTabs ? "checkbox-box--checked" : "checkbox-box--unchecked")} aria-hidden="true">✓</span>
          <span className="checkbox-label-container">
            <span className="checkbox-label">Open tabs</span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {importSources.openTabs && (
            <motion.div
              key="tab-scope"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="pl-12 pt-1 pb-1">
                <p className="text-xs font-normal text-neutral-600 dark:text-neutral-400 mb-1">Which tabs?</p>
                <div className="space-y-0.5">
                  {([
                    { value: OpenTabsScope.All, label: "All open tabs" },
                    { value: OpenTabsScope.Current, label: "Just this window" },
                  ] as const).map(({ value, label }) => {
                    const selected = tabScope === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTabScope(value)}
                        className={`tabs-radio-button-row !p-1.5 !rounded-lg ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`}
                      >
                        <div className={`tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`}>
                          {selected && <div className="tabs-radio-button-inner-circle" />}
                        </div>
                        <span className="tabs-radio-button-text !text-xs">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import from a file */}
        <button
          type="button"
          onClick={() => setImportSources((prev) => ({ ...prev, importFromFile: !prev.importFromFile }))}
          className={"checkbox-row " + (importSources.importFromFile ? "checkbox-row--checked" : "checkbox-row--unchecked")}
          role="checkbox"
          aria-checked={importSources.importFromFile}
        >
          <span className={"checkbox-box " + (importSources.importFromFile ? "checkbox-box--checked" : "checkbox-box--unchecked")} aria-hidden="true">✓</span>
          <span className="checkbox-label-container">
            <span className="checkbox-label">Import from a file (.json or .html export)</span>
            <span className="checkbox-label-description">We'll ask you to upload it next</span>
          </span>
        </button>
      </div>
    ),
    primaryLabel: "Next",
    secondaryLabel: "Back",
  });

  // 4. File upload (only when user checked "Import from a file")
  if (importSources.importFromFile) {
    STEPS.push({
      id: "onboardingFileUpload",
      title: "Import from a file",
      subtitle:
        "If you exported from another bookmark manager (or from Mindful), bring that file in now.",
      body: (
        <div className="import-styles mt-4">
          {manualState.jsonData && fileUploadPreview ? (
            /* ── File selected: preview card ── */
            <>
              <div className="file-preview-card">
                <p className="file-preview-label">{formatFilePreviewText(fileUploadPreview).label}</p>
                <p className="file-preview-summary">{formatFilePreviewText(fileUploadPreview).summary}</p>
              </div>
              <button type="button" className="json-file-remove" onClick={clearFileUpload}>
                Choose a different file
              </button>
            </>
          ) : (
            /* ── No file yet: drop zone ── */
            <>
              <p className="json-format-hint">Supported formats: Chrome (.html), Toby (.json), TabMe (.json), Mindful (.json)</p>
              <div
                className={`json-drop-zone${fileUploadIsDragOver ? " json-drop-zone--active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setFileUploadIsDragOver(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileUploadIsDragOver(false); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setFileUploadIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) await processUploadedFile(file);
                }}
              >
                <span className="json-drop-zone-label">Drag &amp; drop a file here, or</span>
                <button
                  type="button"
                  className="json-drop-zone-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose File
                </button>
                <span className="json-drop-zone-hint">.json or .html</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json,text/html,.html,.htm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await processUploadedFile(file);
                  }}
                  className="json-input-hidden"
                />
              </div>
              {fileUploadError && <div className="error-message">{fileUploadError}</div>}
            </>
          )}
        </div>
      ),
      primaryLabel: manualState.jsonData ? "Next" : "Skip",
      secondaryLabel: "Back",
    });
  }

  // 5. Choice between Smart vs Manual import
  STEPS.push({
    id: "importBookmarks",
    title: "How should we organize your links?",
    body: (
      <ImportBookmarksStep
        setPrimaryDisabled={setImportPrimaryDisabled}
        // Surface the user's choice up to the shell
        onSelectionChange={(mode) => {
          // mode is "smart" or "manual"
          setImportFlow(mode);
        }}
      />
    ),
    primaryLabel: "Next",
    secondaryLabel: "Back",
    primaryDisabled: importPrimaryDisabled,
  });

  // 6. Final step depends on importFlow
  if (importFlow === "smart") {
    STEPS.push({
      id: "smartImport",
      title: "Setting things up ...",
      subtitle:
        "We’re pulling in your bookmarks, tabs, and history to build your Mindful workspace.",
      body: (
        <SmartImportStep
          purposes={onboardingPurposes}
          onBusyChange={setSmartImportBusy}
          singleWorkspace
          fileItems={fileRawItems}
          // When Smart Import finishes, capture the primary workspace id
          onDone={(primaryWorkspaceId) => {
            setSmartImportPrimaryWorkspaceId(primaryWorkspaceId);
          }}
        />
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
      // We'll compute disabled dynamically for this step below
    });

  } else if (importFlow === "manual") {
    STEPS.push({
      id: "manualImportCommit",
      title: "Setting things up ...",
      body: (
        <ManualImportStep
          purposes={onboardingPurposes}
          selection={manualSelection}
          onBusyChange={setManualCommitBusy}
          onProgress={setManualCommitMessage}
          onError={setManualCommitError}
          singleWorkspace
          onDone={(primaryWorkspaceId) => setManualImportPrimaryWorkspaceId(primaryWorkspaceId)}
        />
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
    });
  }

  STEPS.push({
    id: "pinExtension",
    title: "Pin Mindful to your toolbar",
    subtitle: "So Mindful is always one click away.",
    body: <PinExtensionStep />,
    primaryLabel: "Open Mindful",
    secondaryLabel: "Back",
    isFinal: true,
  });
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  // Reset step state when overlay opens
  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = shouldShowOnboarding;

    if (!wasOpen && shouldShowOnboarding) {
      setStepIndex(0);
      setSmartImportPrimaryWorkspaceId(null);
      setManualImportPrimaryWorkspaceId(null);
      setImportPrimaryDisabled(true);
      setImportFlow(null);
      setImportSources({ chromeBookmarks: true, openTabs: true, importFromFile: false });
      setTabScope(OpenTabsScope.All);
      setFileUploadPreview(null);
      setFileUploadError(undefined);
      setFileUploadIsDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = "";

      resetManualWizard();

      setManualCommitBusy(false);
      setManualCommitMessage("");
      setManualCommitError(null);
    }
  }, [shouldShowOnboarding, resetManualWizard]);

  // Don’t render if onboarding is done or not supposed to show.
  if (!shouldShowOnboarding) return null;
  if (
    !onboardingReopen &&
    (onboardingStatus === OnboardingStatus.COMPLETED ||
      onboardingStatus === OnboardingStatus.SKIPPED)
  ) {
    return null;
  }
  /* ---------------------------------------------------------- */

  const totalSteps = STEPS.length;
  const clampedIndex = Math.min(Math.max(stepIndex, 0), totalSteps - 1);
  const step = STEPS[clampedIndex];
  const isFirst = clampedIndex === 0;
  const isLast = !!step.isFinal || clampedIndex === totalSteps - 1;

  const lockNav =
    (step.id === "manualImportCommit" && manualCommitBusy) ||
    (step.id === "smartImport" && smartImportBusy);

  const isFinishGatedStep =
    step.id === "smartImport" || step.id === "manualImportCommit";

  const canFinish =
    step.id === "smartImport"
      ? !!smartImportPrimaryWorkspaceId
      : step.id === "manualImportCommit"
      ? !!manualImportPrimaryWorkspaceId
      : false;

  // Primary button disabled logic:
  //   - For Smart and Manual Import steps: disabled until we have a primary workspace id
  //   - For others: use step.primaryDisabled
  const primaryDisabled =
    lockNav ||
    (step.id === "smartImport" || step.id === "manualImportCommit"
      ? !canFinish
      : !!step.primaryDisabled);

  /* -------------------- Handlers -------------------- */
  const handlePrimary = async () => {
    if (primaryDisabled) return;

    if (isLast) {
      // ✅ pick whichever workflow produced a workspace id
      const primaryWorkspaceId =
        smartImportPrimaryWorkspaceId ?? manualImportPrimaryWorkspaceId;

      if (primaryWorkspaceId) {
        await setActiveWorkspaceId(primaryWorkspaceId as any);
      }

      // Capture workspace IDs before completing so WorkspaceSwitcher can
      // animate newly created ones (same mechanism as standalone import).
      const previousIds = Object.keys(workspaces);
      await completeOnboarding();
      bumpPostImport(previousIds);
      return;
    }

    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const handleSecondary = async () => {
    // On the first screen, secondary is "Skip for now"
    if (isFirst && step.secondaryLabel === "Skip for now") {
      await skipOnboarding();
      return;
    }
    // Otherwise treat it as Back
    if (!isFirst) {
      setStepIndex((prev) => Math.max(prev - 1, 0));
    }
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering -------------------- */
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 dark:bg-white/40 backdrop-blur-sm">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-xl rounded-2xl bg-white/95 dark:bg-black/95 p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/5"
        >
          {/* Header / progress */}
          <div className="mb-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-500">
            <span>
              Step {clampedIndex + 1} of {totalSteps}
            </span>
            {onboardingReopen ? (
              <button type="button" onClick={closeOnboarding} className="underline-offset-2 hover:underline cursor-pointer">
                Close
              </button>
            ) : (
              <button onClick={() => void skipOnboarding()} className="underline-offset-2 hover:underline cursor-pointer">
                Skip onboarding
              </button>
            )}
          </div>

          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {step.title}
          </h2>
          {step.subtitle && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {step.subtitle}
            </p>
          )}

          {/* Body */}
          <div className="mt-4">{step.body}</div>

          {/* Footer: navigation + dots */}
          <div className="mt-6 flex items-center justify-end">
            <div className="flex items-center gap-3">
              {/* Dots */}
              <div className="flex gap-1">
                {STEPS.map((s, idx) => (
                  <span
                    key={s.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      idx === clampedIndex
                        ? "bg-neutral-900 dark:bg-neutral-100"
                        : "bg-neutral-300 dark:bg-neutral-700"
                    }`}
                  />
                ))}
              </div>

              {/* Primary / secondary buttons */}
              <div className="flex items-center gap-2">
                {step.secondaryLabel && (
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-950 cursor-pointer"
                    onClick={handleSecondary}
                    disabled={lockNav}
                  >
                    {step.secondaryLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 cursor-pointer disabled:opacity-60 disabled:cursor-default"
                  onClick={handlePrimary}
                  disabled={primaryDisabled}
                >
                  {isFinishGatedStep
                    ? (canFinish ? step.primaryLabel : "Finishing up ...")
                    : step.primaryLabel}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
