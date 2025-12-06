/* -------------------- Imports -------------------- */
import React from "react";
import { Pin, Sparkles } from "lucide-react";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type FinishUpStepProps = {
  onDone?: () => void; // optional, in case we ever want an inline button
};
/* ---------------------------------------------------------- */

/* -------------------- Main component logic -------------------- */
export const FinishUpStep: React.FC<FinishUpStepProps> = ({ onDone }) => {
  return (
    <div className="flex flex-col items-center text-center p-8 min-h-[260px]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
        <Sparkles className="h-6 w-6 text-blue-400" />
      </div>

      <h2 className="text-xl font-semibold mb-2">
        You’re all set in Mindful ✨
      </h2>

      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4 max-w-md">
        Your workspaces are ready. Next time, you can open Mindful from your
        browser toolbar.
      </p>

      {/* Reserved for future “how to pin” instructions */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-4 py-3 text-xs text-neutral-300">
        <Pin className="h-4 w-4 opacity-80" />
        <div className="text-left">
          <div className="font-medium">Coming soon:</div>
          <div className="opacity-80">
            Quick tips for pinning Mindful to your toolbar.
          </div>
        </div>
      </div>

      {/* Optional inline button if we want, but usually the footer “Next/Open Mindful” handles it */}
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="mt-6 rounded-full bg-white px-4 py-2 text-sm font-medium text-black dark:bg-white dark:text-black"
        >
          Start using Mindful
        </button>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
};
