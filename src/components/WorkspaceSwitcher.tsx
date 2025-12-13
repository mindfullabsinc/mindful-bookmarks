/* -------------------- Imports -------------------- */
import React, { useMemo, useState, useContext, useEffect, useRef } from 'react';

/* Scripts and hooks */
import {
  getActiveWorkspaceId,
  listLocalWorkspaces,
  createLocalWorkspace,
  renameWorkspace,
  archiveWorkspace,
} from '@/scripts/workspaces/registry';
import { AppContext } from '@/scripts/AppContextProvider';
import {
  clearSessionGroupsIndexExcept,
  writeGroupsIndexSession,
} from '@/scripts/caching/bookmarkCache';

/* Events */
import { openCopyTo } from "@/scripts/events/copyToBridge";

/* Types */
import type { WorkspaceType } from '@/core/constants/workspaces';
/* ---------------------------------------------------------- */

/**
 * WorkspaceSwitcher (Light-first with Dark support)
 */
export const WorkspaceSwitcher: React.FC = () => {
  const { 
    setActiveWorkspaceId, 
    activeWorkspaceId: ctxActiveId,
    workspacesVersion
  } = useContext(AppContext) as {
    setActiveWorkspaceId: (id: string) => Promise<void> | void;
    activeWorkspaceId: string | null;
    workspacesVersion: number;
  };

  /* -------------------- Context / state -------------------- */
  const [panelOpen, setPanelOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceType[]>([]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Load workspaces and active id whenever the registry version changes.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const list = await listLocalWorkspaces();
      if (!cancelled) setWorkspaces(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspacesVersion]);

  /**
   * Close the panel on Escape and offer a quick keyboard toggle.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
      // Optional quick toggle (ignores while typing)
      if ((e.key === 'w' || e.key === 'W') && !/input|textarea/i.test((e.target as HTMLElement)?.tagName)) {
        setPanelOpen(v => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const activeName = useMemo(
    () => workspaces.find((w) => w.id === ctxActiveId)?.name ?? 'Workspace',
    [workspaces, ctxActiveId]
  );

  /**
   * Reload workspaces and active id from storage.
   */
  const refresh = async () => {
    setWorkspaces(await listLocalWorkspaces());
  };

  /**
   * Switch to a different workspace, refreshing caches and closing the panel.
   *
   * @param workspace_id Target workspace identifier selected by the user.
   */
  async function handleSwitch(workspace_id: string) {
    if (!workspace_id || workspace_id === ctxActiveId|| workspace_id === ctxActiveId) {
      setPanelOpen(false);
      return;
    }
    await setActiveWorkspaceId(workspace_id);
    await clearSessionGroupsIndexExcept(workspace_id);
    await writeGroupsIndexSession(workspace_id, []);
    await refresh();
    setPanelOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  /**
   * Create a new local workspace and make it the active one.
   */
  async function handleCreate() {
    const ws = await createLocalWorkspace('Local Workspace');
    await (setActiveWorkspaceId as any)(ws.id);
    await clearSessionGroupsIndexExcept(ws.id);
    await writeGroupsIndexSession(ws.id, []);
    await refresh();
  }

  /**
   * Prompt rename dialog and persist the new name.
   *
   * @param id Workspace identifier whose name should be updated.
   */
  async function onRename(id: string) {
    const current = workspaces.find((w) => w.id === id);
    const name = prompt('Rename workspace', current?.name ?? 'Local Workspace');
    if (!name) return;
    await renameWorkspace(id, name.trim());
    await refresh();
  }

  /**
   * Archive a workspace and ensure a new active workspace is selected.
   *
   * @param id Workspace identifier to archive.
   */
  async function onArchive(id: string) {
    if (!confirm('Archive this workspace? You can restore it later.')) return;
    await archiveWorkspace(id);

    const newActive = await getActiveWorkspaceId();
    await (setActiveWorkspaceId as any)(newActive);
    await clearSessionGroupsIndexExcept(newActive);
    await writeGroupsIndexSession(newActive, []);
    await refresh();
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Main component logic -------------------- */
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed left-2 top-1/2 -translate-y-1/2 z-30 inset-0 ${panelOpen ? 'block' : 'hidden'}`}
        aria-hidden="true"
        onMouseDown={() => setPanelOpen(false)}
      />

      {/* Left tab — light-first */}
      <button
        ref={openerRef}
        type="button"
        aria-expanded={panelOpen}
        aria-controls="ws-panel"
        aria-label={panelOpen ? 'Hide workspaces' : 'Show workspaces'} 
        onClick={() => setPanelOpen((v) => !v)}
        title="Switch between workspaces"
        className="
          fixed left-0 top-1/2 z-50 -translate-y-1/2
          flex flex-col items-center justify-center gap-2
          rounded-r-2xl border border-l-0 shadow-lg px-2 py-3
          bg-white text-neutral-700 border-neutral-200
          hover:bg-blue-600 hover:text-white
          focus:outline-none focus:ring-2 focus:ring-blue-400
          dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700
          dark:hover:bg-blue-600 dark:hover:text-white
          backdrop-blur-sm transition-all duration-200 cursor-pointer
        "
      >
        <i className="fa-regular fa-folder-open text-base" aria-hidden="true" />
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide select-none text-[11px] font-medium">
          Workspaces
        </span>
        <i
          className={`fa-solid fa-chevron-right text-xs mt-1 transition-transform duration-200 ${panelOpen ? '-rotate-180' : ''}`}
          aria-hidden="true"
        />
        <span className="absolute inset-0 rounded-r-2xl bg-black/0 hover:bg-black/5 dark:hover:bg-white/5 pointer-events-none transition-colors" />
      </button>

      {/* Drawer — light-first container */}
      <div
        ref={panelRef}
        id="ws-panel"
        role="dialog"
        aria-modal="false"
        aria-label="Workspace switcher"
        className={`
          fixed left-0 top-0 z-50 h-full w-[280px] max-w-[85vw]
          rounded-r-2xl border border-l-0
          bg-white text-neutral-900 border-neutral-200
          shadow-2xl backdrop-blur
          transition-transform duration-200
          dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700
          ${panelOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <header className="flex items-center justify-between gap-2 px-3 py-3 border-b border-neutral-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <i className="fa-regular fa-folder-open text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold">Workspaces</h2>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-xs px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            aria-label="Close workspace panel"
          >
            <i className="fas fa-xmark text-sm" />
          </button>
        </header>

        <div className="max-h-[calc(100vh-9rem)] overflow-auto p-3">
          {workspaces.length === 0 && (
            <div className="px-2 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              No workspaces yet.
            </div>
          )}

          {workspaces.map((w) => {
            const isActive = w.id === ctxActiveId;
            return (
              <div
                key={w.id}
                className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl
                  ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'}
                `}
              >
                <button
                  onClick={() => handleSwitch(w.id)}
                  className="flex-1 text-left text-sm truncate cursor-pointer"
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={w.name}
                  title={w.name}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{w.name}</span>
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/25">Active</span>
                    )}
                  </div>
                </button>

                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => onRename(w.id)}
                    className="text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                    aria-label={`Rename ${w.name}`}
                    title="Rename"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    onClick={() => openCopyTo({ kind: "workspace", fromWorkspaceId: w.id })}
                    className="text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                    aria-label={`Copy ${w.name} to…`}
                    title="Copy to…"
                  >
                    <i className="fa-regular fa-copy" />
                  </button>
                  <button
                    onClick={() => onArchive(w.id)}
                    className="text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                    aria-label={`Archive ${w.name}`}
                    title="Archive"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="border-t border-neutral-200 dark:border-white/10 px-3 py-3 rounded-b-2xl">
          <button
            onClick={handleCreate}
            className="w-full text-left text-sm px-3 py-2 rounded-xl cursor-pointer
                       bg-black/5 hover:bg-black/10
                       dark:bg-white/5 dark:hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-plus" />
              <span>New Local Workspace</span>
            </span>
          </button>
          <div className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Tip: Press <kbd className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">W</kbd> to toggle
          </div>
        </footer>
      </div>
    </>
  );
  /* ---------------------------------------------------------- */
};
