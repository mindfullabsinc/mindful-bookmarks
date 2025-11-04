import React, { useMemo, useState, useContext } from 'react';
import {
  getActiveWorkspaceId,
  listLocalWorkspaces,
  createLocalWorkspace,
  renameWorkspace,
  archiveWorkspace,
} from '@/workspaces/registry';
import { AppContext } from "@/scripts/AppContextProvider";
import {
  clearSessionGroupsIndexExcept,
  writeGroupsIndexSession,
} from '@/scripts/caching/bookmarkCache';
import type { Workspace } from '@/core/constants/workspaces';
import { StorageMode } from '@/core/constants/storageMode'; 
import { LOCAL_USER_ID } from '@/core/constants/authMode';


/**
 * Dropdown control that lists available workspaces and allows switching, creating, renaming, or archiving.
 */
export const WorkspaceSwitcher: React.FC = () => {
  // Get needed context from AppContext
  const { 
    setActiveWorkspaceId, 
    activeWorkspaceId: ctxActiveId 
  } = useContext(AppContext) as {
    setActiveWorkspaceId: (id: string) => Promise<void> | void;
    activeWorkspaceId: string | null;
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  React.useEffect(() => {
    async function bootstrap() {
      const [list, active] = await Promise.all([
        listLocalWorkspaces(),
        getActiveWorkspaceId(),
      ]);
      setWorkspaces(list);
      setActiveId(active);
    }
    bootstrap();
  }, []);

  const activeName = useMemo(
    () => workspaces.find(w => w.id === activeId)?.name ?? 'Workspace',
    [workspaces, activeId]
  );

  /**
   * Reload the workspace list and active workspace id from storage.
   */
  const refresh = async () => {
    const [list, active] = await Promise.all([
      listLocalWorkspaces(),
      getActiveWorkspaceId(),
    ]);
    setWorkspaces(list);
    setActiveId(active);
  };

  /**
   * Switch the active workspace in both context and storage, then refresh the dropdown state.
   *
   * @param workspace_id Target workspace identifier selected by the user.
   */
  async function handleSwitch(workspace_id: string) {
    console.log(`[WorkspaceSwitcher.tsx] Calling handleSwitch() with workspace ID ${workspace_id}`);
    if (!workspace_id || workspace_id === activeId || workspace_id === ctxActiveId) { 
      setMenuOpen(false);
      return;
    }

    // Switch registry active workspace id
    await setActiveWorkspaceId(workspace_id);

    // Session mirror hygiene: only keep the active wid’s tiny index mirror
    await clearSessionGroupsIndexExcept(workspace_id);
    await writeGroupsIndexSession(null, workspace_id); // placeholder; real value will be set by data load

    await refresh();
    setMenuOpen(false);
  }

  /**
   * Create a new local workspace, make it active, and refresh the dropdown state.
   */
  async function handleCreate() {
    const ws = await createLocalWorkspace('Local Workspace');

    await (setActiveWorkspaceId as any)(ws.id);  // reflect in context immediately

    // New workspace starts empty → clear mirrors and seed placeholder
    await clearSessionGroupsIndexExcept(ws.id);
    await writeGroupsIndexSession(null, ws.id);

    await refresh();
    setMenuOpen(false);
  }

  /**
   * Prompt the user to rename a workspace and persist the change.
   *
   * @param id Workspace identifier to rename.
   */
  async function onRename(id: string) {
    const current = workspaces.find(w => w.id === id);
    const name = prompt('Rename workspace', current?.name ?? 'Local Workspace');
    if (!name) return;
    await renameWorkspace(id, name.trim());
    await refresh();
  }

  /**
   * Archive a workspace and ensure state mirrors are cleaned up afterwards.
   *
   * @param id Workspace identifier to archive.
   */
  async function onArchive(id: string) {
    if (!confirm('Archive this workspace? You can restore it later.')) return;
    await archiveWorkspace(id);

    // After archiving, the active may have changed in the registry
    const newActive = await getActiveWorkspaceId();
    await (setActiveWorkspaceId as any)(newActive);   // trigger context effects

    await clearSessionGroupsIndexExcept(newActive);
    await writeGroupsIndexSession(null, newActive);

    await refresh();
  }

  return (
    <div className="relative">
      <button
        className="px-2 py-1 text-sm rounded-xl bg-zinc-800 text-zinc-50 hover:bg-zinc-700 transition"
        onClick={() => setMenuOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {activeName} ▾
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-lg p-2"
        >
          <div className="max-h-72 overflow-auto">
            {workspaces.map(w => (
              <div
                key={w.id}
                className={`flex items-center justify-between px-2 py-1 rounded-xl cursor-pointer hover:bg-zinc-800 ${
                  w.id === activeId ? 'bg-zinc-800' : ''
                }`}
              >
                <button className="text-sm truncate mr-2" onClick={() => handleSwitch(w.id)}>
                  {w.name}
                </button>
                <div className="flex gap-1">
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800"
                    onClick={() => onRename(w.id)}
                    aria-label={`Rename ${w.name}`}
                  >
                    Rename
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800"
                    onClick={() => onArchive(w.id)}
                    aria-label={`Archive ${w.name}`}
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 border-t border-zinc-800 pt-2">
            <button
              className="w-full text-left text-sm px-2 py-1 rounded-xl hover:bg-zinc-800"
              onClick={handleCreate}
            >
              ＋ New Local Workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
