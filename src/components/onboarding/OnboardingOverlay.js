import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppContext, OnboardingStatus } from "@/scripts/AppContextProvider";
/* Constants */
import { ImportPostProcessMode } from "@/core/constants/import";
/* Hooks */
import { useManualImportWizardState } from "@/hooks/useManualImportWizardState";
/* Components */
import { ThemeSelectorStep } from "@/components/onboarding/ThemeSelectorStep";
import { PurposeStep } from "@/components/onboarding/PurposeStep";
import { ImportBookmarksStep } from "@/components/onboarding/ImportBookmarksStep";
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";
import { ManualImportStep } from "@/components/onboarding/ManualImportStep";
import { PinExtensionStep } from "@/components/onboarding/PinExtensionStep";
import { ImportBookmarksStepBody } from "@/components/shared/ImportBookmarksStepBody";
import { getImportBookmarksStepCopy } from "@/components/shared/ImportBookmarksStepBody";
/* ---------------------------------------------------------- */
/* -------------------- Main component -------------------- */
export const OnboardingOverlay = () => {
    /* -------------------- Context / state -------------------- */
    const { onboardingStatus, onboardingReopen, shouldShowOnboarding, completeOnboarding, closeOnboarding, skipOnboarding, onboardingPurposes, setActiveWorkspaceId, bookmarkGroups, } = useContext(AppContext);
    const hasExistingData = (bookmarkGroups ?? []).some((g) => g.id !== "EMPTY_GROUP_IDENTIFIER" && g.groupName !== "EMPTY_GROUP_IDENTIFIER" && g.bookmarks?.length > 0);
    // Local-only step index; AppContext just knows "in_progress vs done".
    const [stepIndex, setStepIndex] = useState(0);
    // Shared "disable primary" flag that individual steps control
    const [importPrimaryDisabled, setImportPrimaryDisabled] = useState(true);
    // Track the primary workspace id produced by Smart Import
    const [smartImportPrimaryWorkspaceId, setSmartImportPrimaryWorkspaceId] = useState(null);
    // Track the primary workspace id produced by Manual Import
    const [manualImportPrimaryWorkspaceId, setManualImportPrimaryWorkspaceId] = useState(null);
    // Track which import flow the user picked on the ImportBookmarksStep
    const [importFlow, setImportFlow] = useState(null);
    // Manual import state
    const { state: manualState, selection: manualSelection, reset: resetManualWizard } = useManualImportWizardState();
    const [manualCommitBusy, setManualCommitBusy] = useState(false);
    const [manualCommitMessage, setManualCommitMessage] = useState("");
    const [manualCommitError, setManualCommitError] = useState(null);
    // Smart import state
    const [smartImportBusy, setSmartImportBusy] = useState(false);
    /* ---------------------------------------------------------- */
    /* -------------------- Step config (dynamic) -------------------- */
    const STEPS = [];
    // 1. Theme
    STEPS.push({
        id: "selectTheme",
        title: "Welcome to Mindful!",
        subtitle: 'Create visual groups for different projects, save pages into those groups, and see your "board" every time you open a new tab.',
        body: _jsx(ThemeSelectorStep, {}),
        primaryLabel: "Next",
        hideBack: true,
    });
    // 2. Purpose
    STEPS.push({
        id: "setPurpose",
        title: "What brings you to Mindful?",
        body: _jsx(PurposeStep, { setPrimaryDisabled: setImportPrimaryDisabled }),
        primaryLabel: "Next",
        secondaryLabel: "Back",
        primaryDisabled: importPrimaryDisabled,
    });
    // 3. Choice between Smart vs Manual import
    STEPS.push({
        id: "importBookmarks",
        title: "Bring Mindful up to speed.",
        subtitle: "Choose how you'd like to get your existing web life into Mindful.",
        body: (_jsx(ImportBookmarksStep, { setPrimaryDisabled: setImportPrimaryDisabled, 
            // Surface the user's choice up to the shell
            onSelectionChange: (mode) => {
                // mode is "smart" or "manual"
                setImportFlow(mode);
            } })),
        primaryLabel: "Next",
        secondaryLabel: "Back",
        primaryDisabled: importPrimaryDisabled,
    });
    // 4. Final step depends on importFlow
    if (importFlow === "smart") {
        STEPS.push({
            id: "smartImport",
            title: "Setting things up ...",
            subtitle: "We’re pulling in your bookmarks, tabs, and history to build your Mindful workspace.",
            body: (_jsx(SmartImportStep, { purposes: onboardingPurposes, onBusyChange: setSmartImportBusy, 
                // When Smart Import finishes, capture the primary workspace id
                onDone: (primaryWorkspaceId) => {
                    setSmartImportPrimaryWorkspaceId(primaryWorkspaceId);
                } })),
            primaryLabel: "Next",
            secondaryLabel: "Back",
            // We'll compute disabled dynamically for this step below
        });
    }
    else if (importFlow === "manual") {
        const step1Copy = getImportBookmarksStepCopy(1);
        STEPS.push({
            id: "manualImportJson",
            title: step1Copy.title,
            subtitle: step1Copy.subtitle,
            body: (_jsx("div", { className: "import-styles", children: _jsx(ImportBookmarksStepBody, { step: 1, showInternalHeader: false, state: manualState, busy: manualCommitBusy, hasExistingData: hasExistingData }) })),
            primaryLabel: nextOrSkip(manualState.jsonYes),
            secondaryLabel: "Back",
            primaryDisabled: manualState.jsonYes && !manualState.jsonData, // require file if they said yes
        });
        const step2Copy = getImportBookmarksStepCopy(2);
        STEPS.push({
            id: "manualImportBookmarks",
            title: step2Copy.title,
            body: (_jsx("div", { className: "import-styles", children: _jsx(ImportBookmarksStepBody, { step: 2, showInternalHeader: false, state: manualState }) })),
            primaryLabel: nextOrSkip(manualState.bookmarksYes),
            secondaryLabel: "Back",
        });
        const step3Copy = getImportBookmarksStepCopy(3);
        STEPS.push({
            id: "manualImportTabs",
            title: step3Copy.title,
            body: (_jsx("div", { className: "import-styles", children: _jsx(ImportBookmarksStepBody, { step: 3, showInternalHeader: false, state: manualState }) })),
            primaryLabel: nextOrSkip(manualState.tabsYes),
            secondaryLabel: "Back",
        });
        const step4Copy = getImportBookmarksStepCopy(4);
        const autoOrganizeEnabled = manualState.postProcessMode === ImportPostProcessMode.SemanticGrouping;
        STEPS.push({
            id: "manualImportOrganize",
            title: step4Copy.title,
            body: (_jsx("div", { className: "import-styles", children: _jsx(ImportBookmarksStepBody, { step: 4, showInternalHeader: false, state: manualState }) })),
            primaryLabel: nextOrSkip(autoOrganizeEnabled),
            secondaryLabel: "Back",
        });
        STEPS.push({
            id: "manualImportCommit",
            title: "Setting things up ...",
            body: (_jsx(ManualImportStep, { purposes: onboardingPurposes, selection: manualSelection, onBusyChange: setManualCommitBusy, onProgress: setManualCommitMessage, onError: setManualCommitError, onDone: (primaryWorkspaceId) => setManualImportPrimaryWorkspaceId(primaryWorkspaceId) })),
            primaryLabel: "Next",
            secondaryLabel: "Back",
        });
    }
    STEPS.push({
        id: "pinExtension",
        title: "Pin Mindful to your toolbar",
        subtitle: "So Mindful is always one click away.",
        body: _jsx(PinExtensionStep, {}),
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
            resetManualWizard();
            setManualCommitBusy(false);
            setManualCommitMessage("");
            setManualCommitError(null);
        }
    }, [shouldShowOnboarding, resetManualWizard]);
    // Don’t render if onboarding is done or not supposed to show.
    if (!shouldShowOnboarding)
        return null;
    if (!onboardingReopen &&
        (onboardingStatus === OnboardingStatus.COMPLETED ||
            onboardingStatus === OnboardingStatus.SKIPPED)) {
        return null;
    }
    /* ---------------------------------------------------------- */
    const totalSteps = STEPS.length;
    const clampedIndex = Math.min(Math.max(stepIndex, 0), totalSteps - 1);
    const step = STEPS[clampedIndex];
    const isFirst = clampedIndex === 0;
    const isLast = !!step.isFinal || clampedIndex === totalSteps - 1;
    const lockNav = (step.id === "manualImportCommit" && manualCommitBusy) ||
        (step.id === "smartImport" && smartImportBusy);
    const isFinishGatedStep = step.id === "smartImport" || step.id === "manualImportCommit";
    const canFinish = step.id === "smartImport"
        ? !!smartImportPrimaryWorkspaceId
        : step.id === "manualImportCommit"
            ? !!manualImportPrimaryWorkspaceId
            : false;
    // Primary button disabled logic:
    //   - For Smart and Manual Import steps: disabled until we have a primary workspace id
    //   - For others: use step.primaryDisabled
    const primaryDisabled = lockNav ||
        (step.id === "smartImport" || step.id === "manualImportCommit"
            ? !canFinish
            : !!step.primaryDisabled);
    /* -------------------- Handlers -------------------- */
    const handlePrimary = async () => {
        if (primaryDisabled)
            return;
        if (isLast) {
            // ✅ pick whichever workflow produced a workspace id
            const primaryWorkspaceId = smartImportPrimaryWorkspaceId ?? manualImportPrimaryWorkspaceId;
            if (primaryWorkspaceId) {
                await setActiveWorkspaceId(primaryWorkspaceId);
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
    /* -------------------- Helper functions -------------------- */
    function nextOrSkip(checked) {
        return checked ? "Next" : "Skip";
    }
    /* ---------------------------------------------------------- */
    /* -------------------- Main component rendering -------------------- */
    return (_jsx(AnimatePresence, { children: _jsx("div", { className: "fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-white/40 backdrop-blur-sm", children: _jsxs(motion.div, { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 24 }, transition: { duration: 0.2 }, className: "w-full max-w-xl rounded-2xl bg-white/95 dark:bg-black/95 p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/5", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-500", children: [_jsxs("span", { children: ["Step ", clampedIndex + 1, " of ", totalSteps] }), onboardingReopen ? (_jsx("button", { type: "button", onClick: closeOnboarding, className: "underline-offset-2 hover:underline cursor-pointer", children: "Close" })) : (_jsx("button", { onClick: () => void skipOnboarding(), className: "underline-offset-2 hover:underline cursor-pointer", children: "Skip onboarding" }))] }), _jsx("h2", { className: "text-lg font-semibold text-neutral-900 dark:text-neutral-100", children: step.title }), step.subtitle && (_jsx("p", { className: "mt-1 text-sm text-neutral-600 dark:text-neutral-400", children: step.subtitle })), _jsx("div", { className: "mt-4", children: step.body }), _jsx("div", { className: "mt-6 flex items-center justify-end", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex gap-1", children: STEPS.map((s, idx) => (_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${idx === clampedIndex
                                            ? "bg-neutral-900 dark:bg-neutral-100"
                                            : "bg-neutral-300 dark:bg-neutral-700"}` }, s.id))) }), _jsxs("div", { className: "flex items-center gap-2", children: [step.secondaryLabel && (_jsx("button", { type: "button", className: "rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-950 cursor-pointer", onClick: handleSecondary, disabled: lockNav, children: step.secondaryLabel })), _jsx("button", { type: "button", className: "rounded-full bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 cursor-pointer disabled:opacity-60 disabled:cursor-default", onClick: handlePrimary, disabled: primaryDisabled, children: isFinishGatedStep
                                                ? (canFinish ? step.primaryLabel : "Finishing up ...")
                                                : step.primaryLabel })] })] }) })] }, step.id) }) }));
    /* ---------------------------------------------------------- */
};
