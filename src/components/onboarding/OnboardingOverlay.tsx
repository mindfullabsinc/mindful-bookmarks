/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppContext, OnboardingStatus } from "@/scripts/AppContextProvider";

/* Constants */
import { ImportPostProcessMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type { OpenTabsScopeType, ImportPostProcessModeType } from "@/core/types/import";

/* Components */
import { ThemeSelectorStep } from "@/components/onboarding/ThemeSelectorStep";
import { PurposeStep } from "@/components/onboarding/PurposeStep";
import { ImportBookmarksStep } from "@/components/onboarding/ImportBookmarksStep";
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";
import { ManualImportStep } from "@/components/onboarding/ManualImportStep";
import { FinishUpStep } from "@/components/onboarding/FinishUpStep";
import { ImportBookmarksStepBody } from "@/components/shared/ImportBookmarksStepBody";
/* ---------------------------------------------------------- */

/* -------------------- Local types / interfaces -------------------- */
type OnboardingStepId =
  | "selectTheme"
  | "setPurpose"
  | "importBookmarks"
  | "smartImport"
  | "manualImportJson"
  | "manualImportBookmarks"
  | "manualImportTabs"
  | "manualImportOrganize"
  | "manualImportCommit"
  | "finishUp"
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
  } = useContext(AppContext);

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

  // Manual import selection state (onboarding-only)
  const [manualJsonYes, setManualJsonYes] = useState(false);
  const [manualJsonFileName, setManualJsonFileName] = useState<string | null>(null);
  const [manualJsonData, setManualJsonData] = useState<string | null>(null);
  const [manualBookmarksYes, setManualBookmarksYes] = useState(false);
  const [manualTabsYes, setManualTabsYes] = useState(false);
  const [manualTabScope, setManualTabScope] = useState<OpenTabsScopeType>(OpenTabsScope.All);
  const [manualPostProcessMode, setManualPostProcessMode] =
    useState<ImportPostProcessModeType>(ImportPostProcessMode.PreserveStructure);
  const [manualCommitBusy, setManualCommitBusy] = useState(false);
  const [manualCommitMessage, setManualCommitMessage] = useState<string>("");
  const [manualCommitError, setManualCommitError] = useState<string | null>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Step config (dynamic) -------------------- */
  const STEPS: OnboardingStepConfig[] = [];

  const manualStepBodyState = {
    jsonYes: manualJsonYes,
    setJsonYes: setManualJsonYes,
    jsonFileName: manualJsonFileName,
    setJsonFileName: setManualJsonFileName,
    jsonData: manualJsonData,
    setJsonData: setManualJsonData,

    bookmarksYes: manualBookmarksYes,
    setBookmarksYes: setManualBookmarksYes,

    tabsYes: manualTabsYes,
    setTabsYes: setManualTabsYes,
    tabScope: manualTabScope,
    setTabScope: setManualTabScope,

    postProcessMode: manualPostProcessMode,
    setPostProcessMode: setManualPostProcessMode,
  };

  // 1. Theme
  STEPS.push({
    id: "selectTheme",
    title: "Welcome to Mindful!",
    subtitle:
      'Create visual groups for different projects, save pages into those groups, and see your "board" every time you open a new tab.',
    body: <ThemeSelectorStep />,
    primaryLabel: "Next",
    secondaryLabel: "Skip for now",
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

  // 3. Choice between Smart vs Manual import
  STEPS.push({
    id: "importBookmarks",
    title: "Bring Mindful up to speed.",
    subtitle:
      "Choose how you'd like to get your existing web life into Mindful.",
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

  // 4. Final step depends on importFlow
  if (importFlow === "smart") {
    STEPS.push({
      id: "smartImport",
      title: "Setting things up ...",
      subtitle:
        "We’re pulling in your bookmarks, tabs, and history to build your Mindful workspace.",
      body: (
        <SmartImportStep
          purposes={onboardingPurposes}
          // When Smart Import finishes, capture the primary workspace id
          onDone={(primaryWorkspaceId) => {
            setSmartImportPrimaryWorkspaceId(primaryWorkspaceId);
          }}
        />
      ),
      primaryLabel: "Open Mindful",
      secondaryLabel: "Back",
      isFinal: true,
      // We'll compute disabled dynamically for this step below
    });
  } else if (importFlow === "manual") {
    STEPS.push({
      id: "manualImportJson" as any,
      title: "Import a JSON file?",
      subtitle: "If you exported from another bookmark manager (or Mindful), you can bring it in now.",
      body: (
        <div className="import-styles">
          <ImportBookmarksStepBody
            step={1}
            showInternalHeader={false}
            state={manualStepBodyState}
          />
        </div>
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
      primaryDisabled: manualJsonYes && !manualJsonData, // require file if they said yes
    });

    STEPS.push({
      id: "manualImportBookmarks" as any,
      title: "Import Chrome bookmarks?",
      subtitle: "We can pull in your bookmarks. You can skip this if you want.",
      body: (
        <div className="import-styles">
          <ImportBookmarksStepBody
            step={2}
            showInternalHeader={false}
            state={manualStepBodyState}
          />
        </div>
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
    });

    STEPS.push({
      id: "manualImportTabs" as any,
      title: "Import open tabs?",
      subtitle: "Bring in your currently open tabs into Mindful.",
      body: (
        <div className="import-styles">
          <ImportBookmarksStepBody
            step={3}
            showInternalHeader={false}
            state={manualStepBodyState}
          />
        </div>
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
    });

    STEPS.push({
      id: "manualImportOrganize" as any,
      title: "Auto-organize what you import?",
      subtitle: "We can keep your structure, or automatically group imported items.",
      body: (
        <div className="import-styles">
          <ImportBookmarksStepBody
            step={4}
            showInternalHeader={false}
            state={manualStepBodyState}
          />
        </div>
      ),
      primaryLabel: "Next",
      secondaryLabel: "Back",
    });

    STEPS.push({
      id: "manualImportCommit" as any,
      title: "Importing…",
      subtitle: "Hang tight while we set up your workspaces and bring everything in.",
      body: (
        <ManualImportStep
          purposes={onboardingPurposes}
          selection={{
            jsonFileName: manualJsonYes ? manualJsonFileName : null,
            jsonData: manualJsonYes ? manualJsonData : null,
            importBookmarks: manualBookmarksYes,
            tabScope: manualTabsYes ? manualTabScope : undefined,
            importPostProcessMode: manualPostProcessMode,
          }}
          onBusyChange={setManualCommitBusy}
          onProgress={setManualCommitMessage}
          onError={setManualCommitError}
          onDone={(primaryWorkspaceId) => setManualImportPrimaryWorkspaceId(primaryWorkspaceId)}
        />
      ),
      primaryLabel: "Open Mindful",
      secondaryLabel: "Back",
      isFinal: true,
    });
  }
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
      setManualJsonYes(false);
      setManualJsonFileName(null);
      setManualJsonData(null);
      setManualBookmarksYes(false);
      setManualTabsYes(false);
      setManualTabScope(OpenTabsScope.All);
      setManualPostProcessMode(ImportPostProcessMode.PreserveStructure);
      setManualCommitBusy(false);
      setManualCommitMessage("");
      setManualCommitError(null);
    }
  }, [shouldShowOnboarding]);

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
  const lockNav = step.id === "manualImportCommit" && manualCommitBusy;

  // Primary button disabled logic:
  //   - For Smart and Manual Import steps: disabled until we have a primary workspace id
  //   - For others: use step.primaryDisabled
  const primaryDisabled =
    lockNav || 
    (step.id === "smartImport"
      ? !smartImportPrimaryWorkspaceId
      : step.id === "manualImportCommit"
      ? !manualImportPrimaryWorkspaceId || !!step.primaryDisabled
      : !!step.primaryDisabled);

  /* -------------------- Handlers -------------------- */
  const handlePrimary = async () => {
    // If the button is disabled, do nothing (extra safety)
    if (primaryDisabled) return;

    if (isLast) {
      // On the final Smart or Manual Import step, set the active workspace before completing onboarding
      if (step.id === "smartImport" && smartImportPrimaryWorkspaceId) {
        await setActiveWorkspaceId(smartImportPrimaryWorkspaceId as any);
      }
      if (step.id === "manualImportCommit" && manualImportPrimaryWorkspaceId) {
        await setActiveWorkspaceId(manualImportPrimaryWorkspaceId as any);
      }
      await completeOnboarding();
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
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-white/40 backdrop-blur-sm">
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
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              className={`text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer ${
                isFirst || step.hideBack ? "invisible" : ""
              }`}
              onClick={() => setStepIndex((prev) => Math.max(prev - 1, 0))}
              disabled={isFirst || step.hideBack || lockNav}
            >
              Back
            </button>

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
                  {step.primaryLabel}
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
