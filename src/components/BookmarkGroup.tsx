/* -------------------- Imports -------------------- */
import React, { useContext } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* Constants */
import { 
  EMPTY_GROUP_IDENTIFIER,
  ONBOARDING_BOOKMARK_NAME_PREFILL, 
  ONBOARDING_BOOKMARK_URL_PREFILL
} from '@/core/constants/constants';

/* Types */
import type { BookmarkGroupType, BookmarkType } from '@/core/types/bookmarks';

/* Scripts and events */
import { AppContext } from '@/scripts/AppContextProvider';
import { openCopyTo } from '@/scripts/events/copyToBridge';

/* Components */
import { BookmarkItem } from '@/components/BookmarkItem';
import { EditableBookmarkGroupHeading } from '@/components/EditableBookmarkGroupHeading';
import { AddBookmarkInline } from '@/components/AddBookmarkInline';
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type FlexibleRef<T> = Ref<T> | null | undefined; 

export interface BookmarkGroupProps {
  bookmarkGroup: BookmarkGroupType;
  groupIndex: number;
  handleDeleteBookmarkGroup: (event: React.MouseEvent<HTMLButtonElement>, groupIndex: number) => void;
  isTitleEditing?: boolean;
  titleInputRef?: FlexibleRef<HTMLElement>;
  onCommitTitle?: (newTitle: string) => void | Promise<void>;
  onCancelTitleEdit?: () => void;
  autoAddLink?: boolean;
  addLinkInputRef?: FlexibleRef<HTMLInputElement>; 
  onAddLinkDone?: () => void;
  autofillFromClipboard?: boolean;
}
/* ---------------------------------------------------------- */

/**
 * Render a draggable bookmark group with inline editing, copy/move shortcuts, and quick-add controls.
 *
 * @param props Bookmark group render props.
 * @param props.bookmarkGroup Bookmark group data to display.
 * @param props.groupIndex Position of the group inside the parent list.
 * @param props.handleDeleteBookmarkGroup Handler invoked when deleting the group.
 * @param props.isTitleEditing Flag that toggles the heading into edit mode.
 * @param props.titleInputRef Ref forwarded to the editable heading input.
 * @param props.onCommitTitle Callback invoked after the heading commits edits.
 * @param props.onCancelTitleEdit Callback invoked when heading edit mode is cancelled.
 * @param props.autoAddLink Whether to focus the inline add-link form automatically.
 * @param props.addLinkInputRef Ref forwarded to the inline add-link input.
 * @param props.onAddLinkDone Callback fired when the inline add-link form completes.
 * @param props.autofillFromClipboard Enable onboarding-specific clipboard autofill behaviour.
 */
export const BookmarkGroup: React.FC<BookmarkGroupProps> = ({
  bookmarkGroup,
  groupIndex,
  handleDeleteBookmarkGroup,

  // external control for title editing (active group only)
  isTitleEditing,
  titleInputRef,
  onCommitTitle,
  onCancelTitleEdit,

  // inline add-link control
  autoAddLink = false,
  addLinkInputRef,
  onAddLinkDone,
  // when true, we're in onboarding (use constants + allow clipboard)
  autofillFromClipboard = false,
}) => {
  /* -------------------- Context / state -------------------- */
  const { activeWorkspaceId } = useContext(AppContext) as { activeWorkspaceId: string | null };

  const { 
    attributes, listeners, setNodeRef, transform, transition, isDragging 
  } = useSortable({ id: bookmarkGroup.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const headingIsEntered =
    bookmarkGroup.groupName && bookmarkGroup.groupName !== EMPTY_GROUP_IDENTIFIER;

  const bookmarks: BookmarkType[] = Array.isArray(bookmarkGroup.bookmarks)
    ? (bookmarkGroup.bookmarks as BookmarkType[])
    : [];
  const bookmarkIds = bookmarks.map((b) => b.id);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Prevent pointer events from bubbling into the drag handles.
   *
   * @param e Pointer event emitted within the group container.
   */
  const stopPropagation = (e: ReactPointerEvent<HTMLElement>) => e.stopPropagation();

  /**
   * Open the copy-to modal preloaded with this group's metadata.
   *
   * @param e Click event from the copy button.
   */
  const onCopyGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWorkspaceId) return;
    openCopyTo({
      kind: 'group',
      fromWorkspaceId: activeWorkspaceId,
      groupId: bookmarkGroup.id,
    });
  };
  /* ---------------------------------------------------------- */

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bookmark-group-box relative group"
      {...attributes}
      {...listeners}
    >
      {/* Actions (Delete + Copy/Move) */}
      {/* Only show the actions when the BookmarkGroup is hovered over */}
      {headingIsEntered && (
        <div
          className="
            absolute right-2 top-2 flex items-center 
            text-neutral-400 dark:text-neutral-400

            opacity-0 pointer-events-none
            transition-opacity duration-150

            group-hover:opacity-100 group-hover:pointer-events-auto
            focus-within:opacity-100 focus-within:pointer-events-auto
          "
        >
          <button
            className="icon-button p-1 hover:text-neutral-500 dark:hover:text-neutral-300 transition-colors cursor-pointer"
            onClick={onCopyGroup}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Copy/Move group"
            title="Copy/Move group"
          >
            <i className="far fa-copy text-sm" />
          </button>

          <button
            className="icon-button p-1 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            onClick={(event) => handleDeleteBookmarkGroup(event, groupIndex)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Delete group"
            title="Delete group"
          >
            <i className="fas fa-xmark text-sm" />
          </button>
        </div>
      )}

      {/* Header */}
      <div onPointerDown={stopPropagation} className="bookmark-group-header">
        <EditableBookmarkGroupHeading
          bookmarkGroup={bookmarkGroup}
          groupIndex={groupIndex}
          {...(isTitleEditing ? { isEditing: true, inputRef: titleInputRef, onCommit: onCommitTitle, onCancel: onCancelTitleEdit } : {})}
        />
      </div>

      {/* Content */}
      <div onPointerDown={stopPropagation} className="bookmark-group-content">
        <SortableContext items={bookmarkIds} strategy={verticalListSortingStrategy}>
          {bookmarks.map((bookmark, bookmarkIndex) => (
            <BookmarkItem
              key={bookmark.id}
              bookmark={bookmark as BookmarkType}
              bookmarkIndex={bookmarkIndex}
              groupIndex={groupIndex}
            />
          ))}
        </SortableContext>

        {/* Inline add link: shown only when the group has a real title */}
        {headingIsEntered && (
          <AddBookmarkInline
            groupIndex={groupIndex}
            autoFocus={autoAddLink}
            inputRef={addLinkInputRef}
            onDone={onAddLinkDone}

            /* Only during onboarding: pass constant prefills
               (explicit prefills take precedence over clipboard inside the component) */
            prefillName={autofillFromClipboard ? ONBOARDING_BOOKMARK_NAME_PREFILL : undefined}
            prefillUrl={autofillFromClipboard ? ONBOARDING_BOOKMARK_URL_PREFILL : undefined}
            autofillFromClipboard={autofillFromClipboard}
          />
        )}
      </div>
    </div>
  );
};
