import React, { useMemo, useState, useContext, useEffect, useRef } from 'react';

/* Scripts and hooks */
import {
  getActiveWorkspaceId,
  listLocalWorkspaces,
  createLocalWorkspace,
  renameWorkspace,
  archiveWorkspace,
} from '@/workspaces/registry';
import { AppContext } from '@/scripts/AppContextProvider';
import {
  clearSessionGroupsIndexExcept,
  writeGroupsIndexSession,
} from '@/scripts/caching/bookmarkCache';

/* Events */
import { openCopyTo } from "@/scripts/events/copyToBridge";

/* Types */
import type { WorkspaceType } from '@/core/constants/workspaces';

/**
 * WorkspaceSwitcher (Left Tab Popout)
 *
 * A compact, always-available left-edge tab that slides out a panel.
 * - Keeps Mindful's dark neutral theme
 * - Keyboard accessible (Tab/Shift+Tab, ESC closes)
 * - Click outside closes
 * - Works with existing registry + AppContext flow
 */
export const WorkspaceSwitcher: React.FC = () => {
  /* -------------------- Context / state -------------------- */
  const { setActiveWorkspaceId, activeWorkspaceId: ctxActiveId } = useContext(AppContext) as {
    setActiveWorkspaceId: (id: string) => Promise<void> | void;
    activeWorkspaceId: string | null;
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceType[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Refs for click-outside and focus handling
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    (async () => {
      const [list, active] = await Promise.all([
        listLocalWorkspaces(),
        getActiveWorkspaceId(),
      ]);
      setWorkspaces(list);
      setActiveId(active);
    })();
  }, []);

  // Close on ESC and restore focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
    }
    if (panelOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen]);
  /* ---------------------------------------------------------- */

  /* -------------------- Handlers -------------------- */ 
  const activeName = useMemo(
    () => workspaces.find((w) => w.id === activeId)?.name ?? 'Workspace',
    [workspaces, activeId]
  );

  const refresh = async () => {
    const [list, active] = await Promise.all([
      listLocalWorkspaces(),
      getActiveWorkspaceId(),
    ]);
    setWorkspaces(list);
    setActiveId(active);
  };

  async function handleSwitch(workspace_id: string) {
    if (!workspace_id || workspace_id === activeId || workspace_id === ctxActiveId) {
      setPanelOpen(false);
      return;
    }

    await setActiveWorkspaceId(workspace_id);

    // Session mirror hygiene
    await clearSessionGroupsIndexExcept(workspace_id);
    await writeGroupsIndexSession(workspace_id, []);

    await refresh();
    setPanelOpen(false);

    // Return focus to opener for accessibility
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function handleCreate() {
    const ws = await createLocalWorkspace('Local Workspace');
    await (setActiveWorkspaceId as any)(ws.id);
    await clearSessionGroupsIndexExcept(ws.id);
    await writeGroupsIndexSession(ws.id, []);
    await refresh();
  }

  async function onRename(id: string) {
    const current = workspaces.find((w) => w.id === id);
    const name = prompt('Rename workspace', current?.name ?? 'Local Workspace');
    if (!name) return;
    await renameWorkspace(id, name.trim());
    await refresh();
  }

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

  /* -------------------- Component UI -------------------- */
  return (
    <>
      {/* Backdrop when open */}
      <div
        className={`fixed inset-0 z-40 ${panelOpen ? 'block' : 'hidden'}`}
        aria-hidden="true"
        onClick={() => setPanelOpen(false)}
      />

      {/* Fixed launcher tab centered on left edge */}
      <button
        ref={openerRef}
        type="button"
        aria-expanded={panelOpen}
        aria-controls="ws-panel"
        aria-label={panelOpen ? 'Hide workspaces' : 'Show workspaces'} 
        onClick={() => setPanelOpen((v) => !v)}
        className="fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-2xl border border-l-0  shadow-lg px-2 py-3 text-[11px] font-medium 0 focus:outline-none focus:ring-2
                 bg-neutral-100 dark:bg-neutral-900
                 border-neutral-300 dark:border-neutral-700 
                 text-neutral-900 dark:text-neutral-100 
                 hover:bg-neutral-920 dark:hover:bg-neutral-80 
                 focus:ring-neutral-500 dark:focus:ring-neutral-500
                 cursor-pointer"
        title={panelOpen ? 'Hide workspaces' : 'Show workspaces'}
      >
        {/* Vertical label without awkward rotation using CSS writing-mode */}
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide select-none">
          {activeName}
        </span>
      </button>

      {/* Slide-out panel, anchored to left edge */}
      <div
        ref={panelRef}
        id="ws-panel"
        role="dialog"
        aria-modal="false"
        aria-label="Workspace switcher"
        className={`fixed left-0 top-16 z-50 w-80 max-w-[85vw] rounded-r-2xl border border-l-0
                   border-neutral-300 dark:border-neutral-700 
                   bg-neutral-100 dark:bg-neutral-900
                   shadow-2xl backdrop-blur transition-transform duration-200 ${
          panelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-200/70 dark:border-neutral-800/70">
          <h2 className="text-sm font-semibold 
                       text-neutral-900 dark:text-neutral-100">
            Workspaces
          </h2>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-xs px-2 py-1 rounded-lg 
                      text-neutral-800 dark:text-neutral-200 
                      hover:bg-neutral-200 dark:hover:bg-neutral-800
                      cursor-pointer"
            aria-label="Close workspace panel"
          >
            <i className="fas fa-xmark text-sm" />
          </button>
        </header>

        <div className="max-h-[65vh] overflow-auto p-2">
          {workspaces.length === 0 && (
            <div className="px-2 py-3 text-sm text-neutral-600 dark:text-neutral-400">
              No workspaces yet.
            </div>
          )}
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`group flex items-center justify-between gap-2 px-2 py-2 rounded-xl ${
                w.id === activeId ? 'bg-neutral-200 dark:bg-neutral-800/40' : 'hover:bg-neutral-200 dark:hover:bg-neutral-800/40'
              }`}
            >
              <button
                onClick={() => handleSwitch(w.id)}
                className="flex-1 text-left text-sm truncate text-neutral-900 dark:text-neutral-100 cursor-pointer"
                aria-current={w.id === activeId ? 'true' : undefined}
                title={w.name}
              >
                {w.name}
              </button>
              <div className="flex gap-1 opacity-80">
                <button
                  onClick={() => onRename(w.id)}
                  className="text-[11px] px-2 py-1 rounded-lg cursor-pointer 
                           text-neutral-800 dark:text-neutral-200 
                           hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  aria-label={`Rename ${w.name}`}
                >
                  <i className="fa fa-pencil text-xs" />
                </button>
                <button
                  onClick={() => onArchive(w.id)}
                  className="text-[11px] px-2 py-1 rounded-lg cursor-pointer
                           text-neutral-800 dark:text-neutral-200 
                           hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  aria-label={`Archive ${w.name}`}
                >
                  <i className="fa fa-archive text-xs" />
                </button>
                <button
                  onClick={() => openCopyTo({ kind: "workspace", fromWorkspaceId: w.id })}
                  className="text-[11px] px-2 py-1 rounded-lg cursor-pointer 
                            text-neutral-800 dark:text-neutral-200 
                            hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  aria-label={`Copy ${w.name} to…`}
                >
                  <i className="far fa-copy text-xs" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <footer className="border-t border-neutral-200/70 dark:border-neutral-800/70 px-2 py-2 rounded-b-2xl">
          <button
            onClick={handleCreate}
            className="w-full text-left text-sm px-3 py-2 rounded-xl cursor-pointer
                     bg-neutral-200/60 dark:bg-neutral-800/60 
                     hover:bg-neutral-200 dark:hover:bg-neutral-800 
                     text-neutral-900 dark:text-neutral-100"
          >
            ＋ New Local Workspace
          </button>
        </footer>
      </div>
    </>
  );
  /* ---------------------------------------------------------- */
};
