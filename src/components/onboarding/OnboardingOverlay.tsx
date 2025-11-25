import React, { useContext, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppContext, OnboardingStatus } from "@/scripts/AppContextProvider";

/* Components */
import { ThemeSelectorStep } from "@/components/onboarding/ThemeSelectorStep";

/* -------------------- Types -------------------- */
type OnboardingStepId = "welcome" | "firstWorkspace" | "tips";

type OnboardingStepConfig = {
  id: OnboardingStepId;
  title: string;
  subtitle?: string;
  /** Main content for the step */
  body: React.ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  /** Hide the Back button on this step */
  hideBack?: boolean;
  /** Whether this is the last step in the flow */
  isFinal?: boolean;
};

/* -------------------- Step config -------------------- */
const STEPS: OnboardingStepConfig[] = [
  {
    id: "welcome",
    title: "Welcome to Mindful!",
    subtitle: "Create visual groups for different projects, save pages into those groups, and see your \"board\" every time you open a new tab.",
    body: <ThemeSelectorStep />,
    // body: (
    //   <div className="space-y-3 text-sm text-neutral-700">
    //     <p>
    //       Create visual groups for different projects, save pages into those groups, 
    //       and see your "board" every time you open a new tab. 
    //     </p>
    //   </div>
    // ),
    primaryLabel: "Get started",
    secondaryLabel: "Skip for now",
    hideBack: true,
  },
  {
    id: "firstWorkspace",
    title: "Create your first workspace",
    subtitle: "Workspaces keep different parts of your life separate and calm.",
    body: (
      <div className="space-y-3 text-sm text-neutral-700">
        <p>
          Start with a single workspace — you can add more later for other
          projects or areas of your life.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Examples: <strong>Today</strong>, <strong>Deep Work</strong>,{" "}
            <strong>Planning</strong>.
          </li>
          <li>
            You’ll be able to add bookmark groups inside this workspace from
            the main UI.
          </li>
        </ul>
        <p className="text-xs text-neutral-500">
          (In a later iteration you can hook this button up to your actual
          “create workspace” flow.)
        </p>
      </div>
    ),
    primaryLabel: "Looks good",
    secondaryLabel: "Back",
  },
  {
    id: "tips",
    title: "You’re all set",
    subtitle: "A few quick tips before you start.",
    body: (
      <div className="space-y-3 text-sm text-neutral-700">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Click +</strong> in your workspace to create a new group
            for related links.
          </li>
          <li>
            Use the Mindful button (or right click &gt; “Save to Mindful”) to
            add the current page.
          </li>
          <li>
            Reorder groups and links with drag &amp; drop when you’re ready to
            reorganize.
          </li>
        </ul>
        <p className="text-xs text-neutral-500">
          You can reopen this onboarding anytime from the settings menu.
        </p>
      </div>
    ),
    primaryLabel: "Start using Mindful",
    secondaryLabel: "Back",
    isFinal: true,
  },
];

/* -------------------- Component -------------------- */
export const OnboardingOverlay: React.FC = () => {
  const {
    onboardingStatus,
    shouldShowOnboarding,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
  } = useContext(AppContext);

  // Local-only step index; AppContext just knows "in_progress vs done".
  const [stepIndex, setStepIndex] = useState(0);

  // Ensure a fresh start when the overlay first appears.
  useEffect(() => {
    if (shouldShowOnboarding && onboardingStatus === OnboardingStatus.NOT_STARTED) {
      // Fire and forget; we don't care about awaiting here.
      void restartOnboarding();
    }
  }, [shouldShowOnboarding, onboardingStatus, restartOnboarding]);

  // Reset step index when we re-open the overlay.
  useEffect(() => {
    if (shouldShowOnboarding) {
      setStepIndex(0);
    }
  }, [shouldShowOnboarding]);

  // Don’t render if onboarding is done or not supposed to show.
  if (!shouldShowOnboarding) return null;
  if (
    onboardingStatus === OnboardingStatus.COMPLETED ||
    onboardingStatus === OnboardingStatus.SKIPPED
  ) {
    return null;
  }

  const totalSteps = STEPS.length;
  const clampedIndex = Math.min(Math.max(stepIndex, 0), totalSteps - 1);
  const step = STEPS[clampedIndex];
  const isFirst = clampedIndex === 0;
  const isLast = !!step.isFinal || clampedIndex === totalSteps - 1;

  const handlePrimary = async () => {
    if (isLast) {
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg rounded-2xl bg-white/95 p-6 shadow-2xl ring-1 ring-black/5"
        >
          {/* Header / progress */}
          <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
            <span>
              Step {clampedIndex + 1} of {totalSteps}
            </span>
            <button
              type="button"
              className="underline-offset-2 hover:underline cursor-pointer"
              onClick={() => void skipOnboarding()}
            >
              Skip onboarding
            </button>
          </div>

          <h2 className="text-lg font-semibold text-neutral-900">{step.title}</h2>
          {step.subtitle && (
            <p className="mt-1 text-sm text-neutral-600">{step.subtitle}</p>
          )}

          {/* Body */}
          <div className="mt-4">{step.body}</div>

          {/* Footer: navigation + dots */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              className={`text-sm text-neutral-500 hover:text-neutral-700 cursor-pointer ${
                (isFirst || step.hideBack) ? "invisible" : ""
              }`}
              onClick={() => setStepIndex((prev) => Math.max(prev - 1, 0))}
              disabled={isFirst || step.hideBack}
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
                      idx === clampedIndex ? "bg-neutral-900" : "bg-neutral-300"
                    }`}
                  />
                ))}
              </div>

              {/* Primary / secondary buttons */}
              <div className="flex items-center gap-2">
                {step.secondaryLabel && (
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                    onClick={handleSecondary}
                  >
                    {step.secondaryLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 cursor-pointer"
                  onClick={handlePrimary}
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
};
