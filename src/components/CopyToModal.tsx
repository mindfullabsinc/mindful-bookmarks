import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import { listLocalWorkspaces } from "@/scripts/workspaces/registry";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (destWorkspaceId: WorkspaceIdType, move: boolean) => void;
  currentWorkspaceId: WorkspaceIdType;
  title?: string; 
};

/**
 * Modal that lets users pick another workspace to copy/move bookmark payloads into.
 *
 * @param props Component props.
 * @param props.open Whether the modal is currently displayed.
 * @param props.onClose Callback invoked when the user dismisses the modal.
 * @param props.onConfirm Handler invoked with the destination workspace and move flag.
 * @param props.currentWorkspaceId Workspace identifier to exclude from the destination list.
 * @param props.title Optional heading for the modal.
 */
export default function CopyToModal({
  open,
  onClose,
  onConfirm,
  currentWorkspaceId,
  title = "Copy to …",
}: Props) {
  const [workspaces, setWorkspaces] =
    useState<Array<{ id: WorkspaceIdType; name: string }>>([]);
  const [dest, setDest] = useState<WorkspaceIdType | null>(null);
  const [move, setMove] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  /**
   * Fetch workspace choices every time the modal opens so the list stays fresh.
   */
  useEffect(() => {
    if (!open) return;
    (async () => {
      const all = await listLocalWorkspaces();
      const filtered = all.filter((w) => w.id !== currentWorkspaceId);
      setWorkspaces(filtered);
      setDest(filtered[0]?.id ?? null);
      setMove(false);
    })();
  }, [open, currentWorkspaceId]);

  /**
   * Listen for Escape/Enter key presses while the modal is open to support quick dismissal/confirm.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Enter" && dest) {
        e.preventDefault();
        onConfirm(dest, move);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dest, move, onClose, onConfirm]);

  /**
   * Focus the destination select input as soon as the modal becomes visible.
   */
  useEffect(() => {
    if (open) {
      queueMicrotask(() => selectRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const body = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onClose?.()}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copyto-title"
        className="relative z-10 w-[min(96vw,560px)] rounded-2xl border border-neutral-200 bg-white shadow-2xl
                   dark:border-neutral-800 dark:bg-neutral-950
                   max-h-[85vh] overflow-hidden"
      >
        <div className="grid max-h-[85vh] grid-rows-[auto,1fr,auto]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h2
              id="copyto-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {title}
            </h2>
            <button
              onClick={() => onClose?.()}
              aria-label="Close"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl
                         text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70
                         dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-5 py-4">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="copyto-dest"
                  className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Destination workspace
                </label>

                <div className="relative">
                  <select
                    id="copyto-dest"
                    ref={selectRef}
                    value={dest ?? ""}
                    onChange={(e) =>
                      setDest(e.target.value as WorkspaceIdType)
                    }
                    className="block w-full appearance-none rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm
                               text-neutral-900 shadow-sm transition
                               hover:border-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                               dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600
                               dark:focus:border-blue-500"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>

                  {/* chevron */}
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-neutral-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              
              <div className="rounded-xl border border-neutral-200 p-3 transition hover:border-neutral-300 dark:border-neutral-800">
                <label className="inline-flex items-center text-sm text-neutral-800 dark:text-neutral-200">
                  <input
                    type="checkbox"
                    checked={move}
                    onChange={(e) => setMove(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-blue-600 mr-2 align-middle"
                  />
                  <span className="text-sm leading-tight">Move (copy then delete from source)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <button
              onClick={() => onClose?.()}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border px-4 py-2 text-sm
                       bg-white dark:bg-neutral-900
                       hover:bg-neutral-50 dark:hover:bg-neutral-800
                       border-neutral-300 dark:border-neutral-700
                       text-neutral-800 dark:text-neutral-100
                         shadow-sm transition 
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            >
              Cancel
            </button>
            <button
              onClick={() => dest && onConfirm(dest, move)}
              disabled={!dest}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm
                         transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
