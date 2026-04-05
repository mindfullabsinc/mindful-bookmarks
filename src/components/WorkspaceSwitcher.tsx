/* -------------------- Imports -------------------- */
import React, { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* Scripts and hooks */
import {
  getActiveWorkspaceId,
  listLocalWorkspaces,
  createLocalWorkspace,
  renameWorkspace,
  archiveWorkspace,
  reorderWorkspaces,
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

/* -------------------- SortableWorkspaceRow -------------------- */
interface SortableRowProps {
  workspace: WorkspaceType;
  isActive: boolean;
  isEditing: boolean;
  editSpanRef: React.RefObject<HTMLSpanElement | null>;
  editValueRef: React.MutableRefObject<string>;
  onSwitch: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onArchive: (id: string) => void;
}

function SortableWorkspaceRow({
  workspace: w,
  isActive,
  isEditing,
  editSpanRef,
  editValueRef,
  onSwitch,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onArchive,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-2 py-2 rounded-xl mb-1
        ${isActive
          ? 'bg-blue-600 text-white'
          : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'}
      `}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        tabIndex={-1}
        className={`shrink-0 touch-none px-1 cursor-grab active:cursor-grabbing opacity-25 hover:opacity-60 transition-opacity
          ${isActive ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}
        `}
        aria-label="Drag to reorder"
      >
        <i className="fa-solid fa-grip-vertical text-[10px]" />
      </button>

      {/* Name / inline editing */}
      {isEditing ? (
        <span
          ref={editSpanRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => { editValueRef.current = e.currentTarget.textContent ?? ''; }}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCommitEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
          }}
          className="flex-1 text-sm outline-none cursor-text min-w-0"
          aria-label="Rename workspace"
        />
      ) : (
        <button
          onClick={() => onSwitch(w.id)}
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
      )}

      {/* Action buttons */}
      <div className="flex gap-0.5 shrink-0">
        {isEditing ? (
          <button
            onMouseDown={(e) => { e.preventDefault(); onCancelEdit(); }}
            className="text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            aria-label="Cancel rename"
            title="Cancel"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        ) : (
          <>
            <button
              onClick={() => onStartEdit(w.id)}
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
          </>
        )}
      </div>
    </div>
  );
}
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const editSpanRef = useRef<HTMLSpanElement | null>(null);
  const editValueRef = useRef<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listLocalWorkspaces();
      if (!cancelled) setWorkspaces(list);
    })();
    return () => { cancelled = true; };
  }, [workspacesVersion]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingId) { setEditingId(null); return; }
        setPanelOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
      if ((e.key === 'w' || e.key === 'W') && !editingId && !/input|textarea/i.test((e.target as HTMLElement)?.tagName)) {
        setPanelOpen(v => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingId]);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const activeName = useMemo(
    () => workspaces.find((w) => w.id === ctxActiveId)?.name ?? 'Workspace',
    [workspaces, ctxActiveId]
  );

  const refresh = async () => { setWorkspaces(await listLocalWorkspaces()); };

  async function handleSwitch(workspace_id: string) {
    if (!workspace_id || workspace_id === ctxActiveId) { setPanelOpen(false); return; }
    await setActiveWorkspaceId(workspace_id);
    await clearSessionGroupsIndexExcept(workspace_id);
    await writeGroupsIndexSession(workspace_id, []);
    await refresh();
    setPanelOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function handleCreate() {
    const ws = await createLocalWorkspace('Local Workspace');
    await (setActiveWorkspaceId as any)(ws.id);
    await clearSessionGroupsIndexExcept(ws.id);
    await writeGroupsIndexSession(ws.id, []);
    await refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = workspaces.findIndex(w => w.id === active.id);
    const newIndex = workspaces.findIndex(w => w.id === over.id);
    const reordered = arrayMove(workspaces, oldIndex, newIndex);
    setWorkspaces(reordered);
    await reorderWorkspaces(reordered.map(w => w.id));
  }

  function startEdit(id: string) {
    const current = workspaces.find((w) => w.id === id);
    editValueRef.current = current?.name ?? '';
    setEditingId(id);
    requestAnimationFrame(() => {
      const el = editSpanRef.current;
      if (!el) return;
      el.textContent = editValueRef.current;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  }

  const commitEdit = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editValueRef.current.trim();
    if (trimmed) {
      await renameWorkspace(editingId, trimmed);
      await refresh();
    }
    setEditingId(null);
  }, [editingId]);

  function cancelEdit() { setEditingId(null); }

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

      {/* Left tab */}
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

      {/* Drawer */}
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

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={workspaces.map(w => w.id)} strategy={verticalListSortingStrategy}>
              {workspaces.map((w) => (
                <SortableWorkspaceRow
                  key={w.id}
                  workspace={w}
                  isActive={w.id === ctxActiveId}
                  isEditing={editingId === w.id}
                  editSpanRef={editSpanRef}
                  editValueRef={editValueRef}
                  onSwitch={handleSwitch}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onCommitEdit={commitEdit}
                  onArchive={onArchive}
                />
              ))}
            </SortableContext>
          </DndContext>
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
