/* -------------------- Imports -------------------- */
import React, { useEffect, useState } from 'react';

/* Types */
import type { ImportPhase } from '@/core/types/importPhase';

/* Reuse the phase-smoothing hook from ImportProgress */
import { useSmoothedPhase } from '@/components/shared/ImportProgress';
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
export const ORGANIZE_PHASE_SEQUENCE: readonly ImportPhase[] = [
  'initializing',
  'categorizing',
  'persisting',
  'done',
] as const;

/**
 * Rotating micro-copy shown for each phase.
 * Messages cycle every COPY_INTERVAL_MS while the phase is active.
 */
const ROTATING_COPY: Record<string, string[]> = {
  initializing: [
    'Scanning your bookmarks ...',
    'Finding patterns across your links',
  ],
  categorizing: [
    'Finding patterns across your links',
    'Creating meaningful groups',
    'Sorting links by theme',
    'Building a cleaner structure',
  ],
  persisting: [
    'Saving your workspace ...',
    'Almost there ...',
  ],
  done: [
    'All organized!',
  ],
};

const COPY_INTERVAL_MS = 2000;
/* ---------------------------------------------------------- */

/* -------------------- Hooks -------------------- */
/**
 * Cycles through a list of strings on a fixed interval.
 * Resets to index 0 whenever the message list changes (i.e. phase change).
 */
function useRotatingCopy(messages: string[]): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (messages.length <= 1) return;
    const id = setInterval(
      () => setIndex(i => (i + 1) % messages.length),
      COPY_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [messages]);

  return messages[index] ?? messages[0] ?? '';
}
/* ---------------------------------------------------------- */

/* -------------------- Component -------------------- */
type OrganizeBannerProps = {
  /** Controls the slide-in/out visibility. */
  visible: boolean;
  /** The current backend phase — smoothed visually by useSmoothedPhase. */
  backendPhase: ImportPhase;
  /** When true, crossfades from the organizing card to the success card. */
  succeeded?: boolean;
  /** Called when the user clicks Undo in either card. */
  onUndo?: () => void;
};

export function OrganizeBanner({ visible, backendPhase, succeeded = false, onUndo }: OrganizeBannerProps) {
  const { visualPhase, visualPhaseIndex } = useSmoothedPhase(
    ORGANIZE_PHASE_SEQUENCE,
    backendPhase,
  );

  const messages = ROTATING_COPY[visualPhase] ?? ROTATING_COPY.initializing ?? [];
  const rotatingCopy = useRotatingCopy(messages);

  const progressPct = Math.round(
    ((visualPhaseIndex + 1) / ORGANIZE_PHASE_SEQUENCE.length) * 100,
  );

  return (
    /* Outer wrapper handles the slide-down/fade-in using max-height transition */
    <div
      className={`
        overflow-hidden transition-all duration-500 ease-out
        ${!visible ? 'max-h-0 opacity-0' : succeeded ? 'max-h-16 opacity-100' : 'max-h-32 opacity-100'}
      `}
    >
      {/* Right-align the card within the content column */}
      <div className="flex justify-end pr-4 pb-3 pt-1">
        {/* Shared position container — both cards occupy the same slot */}
        <div className="relative w-full max-w-sm">

          {/* Organizing card — fades out when succeeded */}
          <div
            className={`
              flex items-center gap-3
              rounded-xl border border-blue-100 dark:border-blue-900
              bg-blue-50 dark:bg-blue-950/40
              px-4 py-3 shadow-sm
              transition-opacity duration-500
              ${succeeded ? 'opacity-0' : 'opacity-100'}
            `}
          >
            {/* Spinner icon */}
            <div className="shrink-0 text-blue-500 text-lg">
              <i className="fas fa-spinner fa-spin" />
            </div>

            <div className="flex-1 min-w-0">
              {/* Static title */}
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 leading-tight">
                Grouping related links
              </p>

              {/* Rotating micro-copy */}
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {rotatingCopy}
              </p>

              {/* Progress bar */}
              <div className="mt-2 h-1 w-full rounded-full bg-blue-100 dark:bg-blue-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {onUndo && (
              <button
                onClick={onUndo}
                className="cursor-pointer shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline focus-visible:outline-none"
              >
                Undo
              </button>
            )}
          </div>

          {/* Success card — fades in when succeeded, absolutely overlays top of the organizing card */}
          <div
            className={`
              absolute top-0 inset-x-0
              flex items-center gap-3
              rounded-xl border border-green-100 dark:border-green-900
              bg-green-50 dark:bg-green-950/40
              px-4 py-2 shadow-sm
              transition-opacity duration-500
              ${succeeded ? 'opacity-100' : 'opacity-0 pointer-events-none'}
            `}
          >
            <div className="shrink-0 text-green-500 text-lg">
              <i className="fas fa-circle-check" />
            </div>
            <p className="flex-1 text-sm font-medium text-neutral-800 dark:text-neutral-100">
              Workspace organized
            </p>
            {onUndo && (
              <button
                onClick={onUndo}
                className="cursor-pointer shrink-0 text-xs text-green-700 dark:text-green-400 hover:underline focus-visible:outline-none"
              >
                Undo
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
