import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getActiveWorkspaceId, listLocalWorkspaces, createLocalWorkspace, renameWorkspace, archiveWorkspace, reorderWorkspaces, } from '@/scripts/workspaces/registry';
import { AppContext } from '@/scripts/AppContextProvider';
import { clearSessionGroupsIndexExcept, writeGroupsIndexSession, } from '@/scripts/caching/bookmarkCache';
import { openCopyTo } from "@/scripts/events/copyToBridge";

function SortableWorkspaceRow({ workspace: w, isActive, isEditing, editSpanRef, editValueRef, onSwitch, onStartEdit, onCancelEdit, onCommitEdit, onArchive, }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
    const rowClass = 'group flex items-center gap-2 px-2 py-2 rounded-xl mb-1 ' + (isActive ? 'bg-blue-600 text-white' : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10');
    const handleClass = 'shrink-0 touch-none px-1 cursor-grab active:cursor-grabbing opacity-25 hover:opacity-60 transition-opacity ' + (isActive ? 'text-white' : 'text-neutral-500 dark:text-neutral-400');
    return _jsxs("div", { ref: setNodeRef, style, className: rowClass, children: [
        _jsx("button", { ...attributes, ...listeners, tabIndex: -1, className: handleClass, "aria-label": "Drag to reorder", children: _jsx("i", { className: "fa-solid fa-grip-vertical text-[10px]" }) }),
        isEditing
            ? _jsx("span", {
                ref: editSpanRef,
                contentEditable: true,
                suppressContentEditableWarning: true,
                onInput: (e) => { editValueRef.current = e.currentTarget.textContent ?? ''; },
                onBlur: onCommitEdit,
                onKeyDown: (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onCommitEdit(); }
                    if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
                },
                className: "flex-1 text-sm outline-none cursor-text min-w-0",
                "aria-label": "Rename workspace",
            })
            : _jsx("button", { onClick: () => onSwitch(w.id), className: "flex-1 text-left text-sm truncate cursor-pointer", "aria-current": isActive ? 'true' : undefined, "aria-label": w.name, title: w.name, children: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [
                _jsx("span", { className: "truncate", children: w.name }),
                isActive && _jsx("span", { className: "text-[10px] px-2 py-0.5 rounded-full bg-white/25", children: "Active" })
            ] }) }),
        _jsx("div", { className: "flex gap-0.5 shrink-0", children: isEditing
            ? _jsx("button", { onMouseDown: (e) => { e.preventDefault(); onCancelEdit(); }, className: "text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer", "aria-label": "Cancel rename", title: "Cancel", children: _jsx("i", { className: "fa-solid fa-xmark" }) })
            : _jsxs(_Fragment, { children: [
                _jsx("button", { onClick: () => onStartEdit(w.id), className: "text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer", "aria-label": 'Rename ' + w.name, title: "Rename", children: _jsx("i", { className: "fa-solid fa-pen" }) }),
                _jsx("button", { onClick: () => openCopyTo({ kind: "workspace", fromWorkspaceId: w.id }), className: "text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer", "aria-label": 'Copy ' + w.name + ' to\u2026', title: "Copy to\u2026", children: _jsx("i", { className: "fa-regular fa-copy" }) }),
                _jsx("button", { onClick: () => onArchive(w.id), className: "text-[11px] px-1 py-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer", "aria-label": 'Archive ' + w.name, title: "Archive", children: _jsx("i", { className: "fa-solid fa-xmark" }) })
            ] })
        })
    ] }, w.id);
}

export const WorkspaceSwitcher = () => {
    const { setActiveWorkspaceId, activeWorkspaceId: ctxActiveId, workspacesVersion } = useContext(AppContext);
    const [panelOpen, setPanelOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const panelRef = useRef(null);
    const openerRef = useRef(null);
    const editSpanRef = useRef(null);
    const editValueRef = useRef('');
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    useEffect(() => {
        let cancelled = false;
        (async () => { const list = await listLocalWorkspaces(); if (!cancelled) setWorkspaces(list); })();
        return () => { cancelled = true; };
    }, [workspacesVersion]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') {
                if (editingId) { setEditingId(null); return; }
                setPanelOpen(false);
                requestAnimationFrame(() => openerRef.current?.focus());
            }
            if ((e.key === 'w' || e.key === 'W') && !editingId && !/input|textarea/i.test(e.target?.tagName)) {
                setPanelOpen(v => !v);
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [editingId]);

    const activeName = useMemo(() => workspaces.find((w) => w.id === ctxActiveId)?.name ?? 'Workspace', [workspaces, ctxActiveId]);
    const refresh = async () => { setWorkspaces(await listLocalWorkspaces()); };

    async function handleSwitch(workspace_id) {
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
        await setActiveWorkspaceId(ws.id);
        await clearSessionGroupsIndexExcept(ws.id);
        await writeGroupsIndexSession(ws.id, []);
        await refresh();
    }

    async function handleDragEnd(event) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = workspaces.findIndex(w => w.id === active.id);
        const newIndex = workspaces.findIndex(w => w.id === over.id);
        const reordered = arrayMove(workspaces, oldIndex, newIndex);
        setWorkspaces(reordered);
        await reorderWorkspaces(reordered.map(w => w.id));
    }

    function startEdit(id) {
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
        if (trimmed) { await renameWorkspace(editingId, trimmed); await refresh(); }
        setEditingId(null);
    }, [editingId]);

    function cancelEdit() { setEditingId(null); }

    async function onArchive(id) {
        if (!confirm('Archive this workspace? You can restore it later.')) return;
        await archiveWorkspace(id);
        const newActive = await getActiveWorkspaceId();
        await setActiveWorkspaceId(newActive);
        await clearSessionGroupsIndexExcept(newActive);
        await writeGroupsIndexSession(newActive, []);
        await refresh();
    }

    return _jsxs(_Fragment, { children: [
        _jsx("div", { className: 'fixed left-2 top-1/2 -translate-y-1/2 z-30 inset-0 ' + (panelOpen ? 'block' : 'hidden'), "aria-hidden": "true", onMouseDown: () => setPanelOpen(false) }),
        _jsxs("button", { ref: openerRef, type: "button", "aria-expanded": panelOpen, "aria-controls": "ws-panel", "aria-label": panelOpen ? 'Hide workspaces' : 'Show workspaces', onClick: () => setPanelOpen((v) => !v), title: "Switch between workspaces", className: "\n          fixed left-0 top-1/2 z-50 -translate-y-1/2\n          flex flex-col items-center justify-center gap-2\n          rounded-r-2xl border border-l-0 shadow-lg px-2 py-3\n          bg-white text-neutral-700 border-neutral-200\n          hover:bg-blue-600 hover:text-white\n          focus:outline-none focus:ring-2 focus:ring-blue-400\n          dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700\n          dark:hover:bg-blue-600 dark:hover:text-white\n          backdrop-blur-sm transition-all duration-200 cursor-pointer\n        ", children: [
            _jsx("i", { className: "fa-regular fa-folder-open text-base", "aria-hidden": "true" }),
            _jsx("span", { className: "[writing-mode:vertical-rl] rotate-180 tracking-wide select-none text-[11px] font-medium", children: "Workspaces" }),
            _jsx("i", { className: 'fa-solid fa-chevron-right text-xs mt-1 transition-transform duration-200 ' + (panelOpen ? '-rotate-180' : ''), "aria-hidden": "true" }),
            _jsx("span", { className: "absolute inset-0 rounded-r-2xl bg-black/0 hover:bg-black/5 dark:hover:bg-white/5 pointer-events-none transition-colors" })
        ] }),
        _jsxs("div", { ref: panelRef, id: "ws-panel", role: "dialog", "aria-modal": "false", "aria-label": "Workspace switcher", className: '\n          fixed left-0 top-0 z-50 h-full w-[280px] max-w-[85vw]\n          rounded-r-2xl border border-l-0\n          bg-white text-neutral-900 border-neutral-200\n          shadow-2xl backdrop-blur\n          transition-transform duration-200\n          dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700\n          ' + (panelOpen ? 'translate-x-0' : '-translate-x-full'), children: [
            _jsxs("header", { className: "flex items-center justify-between gap-2 px-3 py-3 border-b border-neutral-200 dark:border-white/10", children: [
                _jsxs("div", { className: "flex items-center gap-2", children: [
                    _jsx("i", { className: "fa-regular fa-folder-open text-blue-600 dark:text-blue-400" }),
                    _jsx("h2", { className: "text-sm font-semibold", children: "Workspaces" })
                ] }),
                _jsx("button", { onClick: () => setPanelOpen(false), className: "text-xs px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer", "aria-label": "Close workspace panel", children: _jsx("i", { className: "fas fa-xmark text-sm" }) })
            ] }),
            _jsxs("div", { className: "max-h-[calc(100vh-9rem)] overflow-auto p-3", children: [
                workspaces.length === 0 && _jsx("div", { className: "px-2 py-3 text-sm text-neutral-500 dark:text-neutral-400", children: "No workspaces yet." }),
                _jsx(DndContext, { sensors: sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children:
                    _jsx(SortableContext, { items: workspaces.map(w => w.id), strategy: verticalListSortingStrategy, children:
                        workspaces.map((w) => _jsx(SortableWorkspaceRow, { workspace: w, isActive: w.id === ctxActiveId, isEditing: editingId === w.id, editSpanRef: editSpanRef, editValueRef: editValueRef, onSwitch: handleSwitch, onStartEdit: startEdit, onCancelEdit: cancelEdit, onCommitEdit: commitEdit, onArchive: onArchive }, w.id))
                    })
                })
            ] }),
            _jsxs("footer", { className: "border-t border-neutral-200 dark:border-white/10 px-3 py-3 rounded-b-2xl", children: [
                _jsx("button", { onClick: handleCreate, className: "w-full text-left text-sm px-3 py-2 rounded-xl cursor-pointer bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10", children: _jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("i", { className: "fa-solid fa-plus" }), _jsx("span", { children: "New Local Workspace" })] }) }),
                _jsxs("div", { className: "mt-2 text-[11px] text-neutral-500 dark:text-neutral-400", children: ["Tip: Press ", _jsx("kbd", { className: "px-1 py-0.5 rounded bg-black/5 dark:bg-white/10", children: "W" }), " to toggle"] })
            ] })
        ] })
    ] });
};
