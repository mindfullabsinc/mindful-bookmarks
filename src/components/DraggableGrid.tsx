// components/DraggableGrid.tsx
import React, {
  useContext, useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle, useMemo
} from "react";
import {
  DndContext,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";

/* Types */
import type { BookmarkGroupType, BookmarkType } from "@/types/bookmarks";

/* Components */
import { BookmarkGroup } from "@/components/BookmarkGroup";
import { BookmarkItem } from "@/components/BookmarkItem";
import { AppContext } from "@/scripts/AppContextProvider";
import { useBookmarkManager } from "@/hooks/useBookmarkManager";
import { EMPTY_GROUP_IDENTIFIER } from "@/scripts/Constants";

/* -------------------- Local helper types (minimal) -------------------- */
type GroupId = string | number;

type AppCtxShape = {
  bookmarkGroups?: BookmarkGroupType[];
};

export type GridHandle = {
  startCreateGroup?: (opts?: { prefill?: string; select?: "all" | "end" }) => Promise<void> | void;
};

type ActiveItem =
  | (BookmarkGroupType & { groupIndex: number })
  | (BookmarkType & { isBookmark: true })
  | null;

export type DraggableGridProps = {
  user: { sub: string } | null;                 // accepted even if not used
  bookmarkGroups: BookmarkGroupType[];              // source of truth from parent
};
/* --------------------------------------------------------------------- */

const DraggableGrid = forwardRef<GridHandle, DraggableGridProps>(function DraggableGrid(
  { user, bookmarkGroups: bookmarkGroupsProp }, // keep comments; user is accepted (can be unused)
  ref
) {  
  const ctx = useContext(AppContext) as unknown as { bookmarkGroups?: unknown };
  const bookmarkGroupsFromCtx = ctx?.bookmarkGroups;
  const bookmarkGroups: BookmarkGroupType[] =
    (bookmarkGroupsProp ?? bookmarkGroupsFromCtx ?? []) as unknown as BookmarkGroupType[];

  const [activeItem, setActiveItem] = useState<ActiveItem>(null);

  // Which group title is in edit mode?
  const [editingGroupId, setEditingGroupId] = useState<GroupId | null>(null);

  // Which group should auto-open AddBookmarkInline?
  const [addingToGroupId, setAddingToGroupId] = useState<GroupId | null>(null);

  // Refs to contentEditable <h2> nodes for titles
  const titleInputRefs = useRef<Map<string, HTMLElement>>(new Map()); // Map<string, HTMLElement>

  // Refs to the inline "add link" input (URL or Name field)
  const addInputRefs = useRef<Map<string, HTMLInputElement | HTMLElement>>(new Map()); // Map<string, HTMLInputElement | HTMLElement>

  // Are there any bookmarks anywhere?
  const hasAnyBookmark = useMemo(
    () => (bookmarkGroups || []).some((g) => (g.bookmarks?.length || 0) > 0),
    [bookmarkGroups]
  );
  
  const {
    deleteBookmarkGroup,
    reorderBookmarkGroups,
    reorderBookmarks,
    moveBookmark,
    addEmptyBookmarkGroup,
    editBookmarkGroupHeading,
  } = useBookmarkManager() as any;

  // Keep a live pointer to groups to avoid stale closures inside imperative calls
  const groupsRef = useRef<BookmarkGroupType[] | undefined>(bookmarkGroups);
  useEffect(() => {
    groupsRef.current = bookmarkGroups;
  }, [bookmarkGroups]);

  // ── Onboarding gating (read from localStorage) ───────────────────────────────
  const [checklistSnap, setChecklistSnap] = useState({
    createdGroup: false, addedBookmark: false, triedStorage: false,
  });
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mindful.emptyStateChecklist");
      if (saved) setChecklistSnap(JSON.parse(saved));
    } catch {}
    setDismissedOnboarding(localStorage.getItem("mindful.emptyStateDismissed") === "1");

    // keep in sync if another tab updates it
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mindful.emptyStateChecklist" && e.newValue) {
        try { setChecklistSnap(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === "mindful.emptyStateDismissed") {
        setDismissedOnboarding(e.newValue === "1");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isTrulyEmpty = useMemo(
    () =>
      !Array.isArray(bookmarkGroups) ||
      bookmarkGroups.length === 0 ||
      bookmarkGroups.every(
        (g) => g?.groupName === EMPTY_GROUP_IDENTIFIER && (!g.bookmarks || g.bookmarks.length === 0)
      ),
    [bookmarkGroups]
  );
  const allChecked =
    checklistSnap.createdGroup && checklistSnap.addedBookmark && checklistSnap.triedStorage;
  const onboardingActive = !dismissedOnboarding && (isTrulyEmpty || !allChecked);
  // ─────────────────────────────────────────────────────────────────────────────

  // Only prefill for the very first link ever:
  const shouldAutofillFirstLink = onboardingActive && !hasAnyBookmark;

  // Imperative API: ensure placeholder exists, enter rename mode, focus/select
  useImperativeHandle(ref, () => ({
    async startCreateGroup({ prefill, select = "all" } = {}) {
      // 1) find/create placeholder
      let placeholder = (groupsRef.current || []).find(
        (g) => g.groupName === EMPTY_GROUP_IDENTIFIER
      );
      if (!placeholder) {
        const created = await addEmptyBookmarkGroup();
        // Let state flush, then recheck from context (created may be undefined)
        await Promise.resolve();
        placeholder =
          (groupsRef.current || []).find(
            (g) => g.groupName === EMPTY_GROUP_IDENTIFIER
          ) || created || null;
      }
      if (!placeholder) return;

      // 2) switch that card into edit mode
      const id = String((placeholder as any).id ?? (placeholder as any)._id ?? (placeholder as any).uuid ?? "");
      if (!id) return;
      setEditingGroupId(id);

      // 3) after mount, focus + (optionally) prefill + set selection
      setTimeout(() => {
        const el = titleInputRefs.current.get(id); // this is the <h2 contentEditable>
        if (!el) return;

        (el as HTMLElement).focus?.();

        if (prefill !== undefined) {
          el.textContent = prefill;
          el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }

        const sel = window.getSelection?.();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        if (select === "end") range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }, 0);
    },
  }));

  // Safety focus when editingGroupId flips true (covers user click path)
  useLayoutEffect(() => {
    if (!editingGroupId) return;
    const tryFocus = () => {
      const el = titleInputRefs.current.get(String(editingGroupId));
      if (el) {
        (el as HTMLElement).focus?.();
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    const t = setTimeout(tryFocus, 0);
    return () => clearTimeout(t);
  }, [editingGroupId, bookmarkGroups]);

  // Detect placeholder → named transition to auto-open AddBookmarkInline
  const prevNamesRef = useRef<Map<GroupId, string>>(new Map());
  useEffect(() => {
    const prev = prevNamesRef.current;
    let promotedId: string | null = null;

    (bookmarkGroups || []).forEach((g) => {
      const prevName = prev.get(g.id);
      const nowName = g.groupName;
      if (
        prevName === EMPTY_GROUP_IDENTIFIER &&
        nowName &&
        nowName !== EMPTY_GROUP_IDENTIFIER
      ) {
        promotedId = String(g.id);
      }
    });

    // snapshot current
    const next = new Map<GroupId, string>();
    (bookmarkGroups || []).forEach((g) => next.set(g.id, g.groupName));
    prevNamesRef.current = next;

    if (promotedId) setAddingToGroupId(promotedId);
  }, [bookmarkGroups]);

  // Focus the inline Add link input when addingToGroupId is set
  useLayoutEffect(() => {
    if (!addingToGroupId) return;
    const el = addInputRefs.current.get(String(addingToGroupId));
    if (!el) return;
    (el as HTMLInputElement | HTMLElement).focus?.();
    (el as HTMLInputElement).select?.(); // only works for <input>
  }, [addingToGroupId]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const { id } = event.active;
    let currentItem: ActiveItem = null;

    const groupIndex = bookmarkGroups.findIndex((g) => String(g.id) === String(id));
    if (groupIndex > -1) {
      currentItem = { ...bookmarkGroups[groupIndex], groupIndex };
    } else {
      for (let i = 0; i < bookmarkGroups.length; i++) {
        const bookmark = (bookmarkGroups[i].bookmarks || []).find((bm) => String(bm.id) === String(id));
        if (bookmark) {
          currentItem = { ...bookmark, isBookmark: true };
          break;
        }
      }
    }
    setActiveItem(currentItem);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isDraggingGroup = bookmarkGroups.some((g) => String(g.id) === String(active.id));

    // Reorder groups
    if (isDraggingGroup) {
      const src = bookmarkGroups.findIndex((g) => String(g.id) === String(active.id));
      const dst = bookmarkGroups.findIndex((g) => String(g.id) === String(over.id));
      if (src !== -1 && dst !== -1) reorderBookmarkGroups(src, dst);
      return;
    }

    // Move a bookmark
    const source = { groupIndex: -1, bookmarkIndex: -1 };
    const destination = { groupIndex: -1, bookmarkIndex: -1 };

    for (let i = 0; i < bookmarkGroups.length; i++) {
      const idx = (bookmarkGroups[i].bookmarks || []).findIndex((bm) => String(bm.id) === String(active.id));
      if (idx !== -1) {
        source.groupIndex = i;
        source.bookmarkIndex = idx;
        break;
      }
    }

    const overIsGroupContainer = bookmarkGroups.some((g) => String(g.id) === String(over.id));
    if (overIsGroupContainer) {
      destination.groupIndex = bookmarkGroups.findIndex((g) => String(g.id) === String(over.id));
      destination.bookmarkIndex =
        (bookmarkGroups[destination.groupIndex].bookmarks || []).length;
    } else {
      for (let i = 0; i < bookmarkGroups.length; i++) {
        const idx = (bookmarkGroups[i].bookmarks || []).findIndex((bm) => String(bm.id) === String(over.id));
        if (idx !== -1) {
          destination.groupIndex = i;
          destination.bookmarkIndex = idx;
          break;
        }
      }
    }

    if (source.groupIndex === -1 || destination.groupIndex === -1) return;

    if (source.groupIndex === destination.groupIndex) {
      reorderBookmarks(source.bookmarkIndex, destination.bookmarkIndex, source.groupIndex);
    } else {
      moveBookmark(source, destination);
    }
  }

  async function handleDeleteBookmarkGroup(event: React.MouseEvent, groupIndex: number) {
    const shouldDelete = window.confirm(
      "Are you sure you want to delete the entire group " +
        bookmarkGroups[groupIndex].groupName +
        "?"
    );
    if (shouldDelete) {
      await deleteBookmarkGroup(groupIndex);
    }
  }

  function findBookmarkIndices(
    groups: BookmarkGroupType[],
    id: string | number
  ): { groupIndex: number; bookmarkIndex: number } {
    for (let gi = 0; gi < groups.length; gi++) {
      const list = groups[gi].bookmarks || [];
      const bi = list.findIndex((bm) => String(bm.id) === String(id));
      if (bi !== -1) return { groupIndex: gi, bookmarkIndex: bi };
    }
    return { groupIndex: -1, bookmarkIndex: -1 };
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      <SortableContext
        items={bookmarkGroups.map((g) => g.id)}
        strategy={rectSortingStrategy}
      >
        <div className="bookmark-groups-container">
          {bookmarkGroups.map((bookmarkGroup, groupIndex) => {
            const isEditing = String(editingGroupId) === String(bookmarkGroup.id);
            const autoAdd = String(addingToGroupId) === String(bookmarkGroup.id);
            const idKey = String(bookmarkGroup.id);

            return (
              <BookmarkGroup
                key={bookmarkGroup.id as React.Key}
                bookmarkGroup={bookmarkGroup}
                groupIndex={groupIndex}
                handleDeleteBookmarkGroup={handleDeleteBookmarkGroup}
                // Only pass title-editing props for the active group
                isTitleEditing={!!isEditing}
                titleInputRef={(el: HTMLElement | null) => {
                  // For non-active groups, ensure we clear any stale ref
                  if (el) {
                    titleInputRefs.current.set(idKey, el);
                  } else {
                    titleInputRefs.current.delete(idKey);
                  }
                }}
                onCommitTitle={async (newName: string) => {
                  if (
                    isEditing &&                      // only commit for the active group
                    newName &&
                    newName !== bookmarkGroup.groupName
                  ) {
                    await editBookmarkGroupHeading(groupIndex, newName);
                  }
                  setEditingGroupId(null);
                }}
                onCancelTitleEdit={() => setEditingGroupId(null)}
                // Auto open + focus AddBookmarkInline after naming
                autoAddLink={autoAdd}
                addLinkInputRef={(el: HTMLInputElement | HTMLElement | null) => {
                  if (el) addInputRefs.current.set(idKey, el);
                  else addInputRefs.current.delete(idKey);
                }}
                // Only prefill (clipboard) during onboarding
                autofillFromClipboard={shouldAutofillFirstLink}
                onAddLinkDone={() => setAddingToGroupId(null)}
              />
            ); 
          })}
        </div>
      </SortableContext>

      <DragOverlay className="drag-overlay-item">
        {activeItem ? (
          (activeItem as any).isBookmark ? (
            // Pass required indices to BookmarkItem
            (() => {
              const b = activeItem as BookmarkType;
              const { groupIndex, bookmarkIndex } = findBookmarkIndices(
                bookmarkGroups,
                b?.id as string | number
              );
              return (
                <BookmarkItem
                  bookmark={b}
                  groupIndex={groupIndex}
                  bookmarkIndex={bookmarkIndex}
                />
              );
            })()
          ) : (
            // In overlay, never show the inline editor
            <BookmarkGroup
              bookmarkGroup={activeItem as BookmarkGroupType}
              groupIndex={(activeItem as any).groupIndex as number}
              // required props with safe defaults:
              handleDeleteBookmarkGroup={handleDeleteBookmarkGroup}
              isTitleEditing={false}
              titleInputRef={() => {}}
              onCommitTitle={() => {}}
              onCancelTitleEdit={() => {}}
              autoAddLink={false}
              addLinkInputRef={() => {}}
              onAddLinkDone={() => {}}
              autofillFromClipboard={false}
            />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});

export default DraggableGrid;
