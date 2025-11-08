/* -------------------- Imports -------------------- */
import React, { useContext, useState, useRef, useEffect } from 'react';

/* CSS styles */
import '@/styles/EditableBookmarkGroupHeading.css';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";
import { DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';

/* Hooks and Utilities */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';
import type { AppContextValue } from '@/scripts/AppContextProvider';
import type { BookmarkGroupType } from '@/core/types/bookmarks';
import {
  lastGroupKey,
  writeLastSelectedGroup,
  broadcastLastSelectedGroup,
} from '@/core/utils/lastSelectedGroup';
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const NEW_GROUP_NAME = "+ Add a group";
/* ---------------------------------------------------------- */

type EditableBookmarkGroupHeadingProps = {
  bookmarkGroup: BookmarkGroupType;
  groupIndex: number;
  isEditing?: boolean;
  inputRef?: React.Ref<HTMLElement>;
  onCommit?: (name: string) => Promise<void> | void;
  onCancel?: () => void;
};

export function EditableBookmarkGroupHeading({
  bookmarkGroup,
  groupIndex,
  isEditing: externalIsEditing,
  inputRef: externalInputRef,
  onCommit,
  onCancel,
}: EditableBookmarkGroupHeadingProps) {
  /* -------------------- Context / state -------------------- */
  const { editBookmarkGroupHeading } = useBookmarkManager();
  const { userId, storageMode, activeWorkspaceId, groupsIndex, bookmarkGroups } =
    useContext(AppContext) as AppContextValue;

  const hasTitle =
    bookmarkGroup &&
    bookmarkGroup.groupName &&
    bookmarkGroup.groupName !== EMPTY_GROUP_IDENTIFIER;

  // Uncontrolled fallback editing state
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const editing = externalIsEditing ?? internalIsEditing;

  // Placeholder state
  const [isPlaceholder, setIsPlaceholder] = useState(!hasTitle);

  // Local ref, but we also forward it to the parent
  const headingRef = useRef<HTMLElement | null>(null);
  const setMergedRef = (node: HTMLElement | null) => {
    headingRef.current = node;
    if (typeof externalInputRef === 'function') {
      externalInputRef(node);
    } else if (externalInputRef && 'current' in externalInputRef) {
      (externalInputRef as React.MutableRefObject<HTMLElement | null>).current = node;
    }
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Local helper functions -------------------- */
  /**
   * Retrieve the freshest view of bookmark groups, preferring fully hydrated data.
   *
   * @returns Array of non-placeholder bookmark groups.
   */
  const getLatestGroups = () => {
    const base = (Array.isArray(bookmarkGroups) && bookmarkGroups.length
      ? bookmarkGroups
      : (groupsIndex || []));
    return base.filter(g => g.groupName !== EMPTY_GROUP_IDENTIFIER);
  };

  /**
   * Attempt to resolve a group's id by name, retrying while state hydrates.
   *
   * @param name Group display name to search for.
   * @param attempts Number of retries before giving up.
   * @param delayMs Delay between retries in milliseconds.
   * @returns Resolved group id or empty string.
   */
  async function findGroupIdByName(name: string, attempts = 8, delayMs = 50) {
    for (let i = 0; i < attempts; i++) {
      const hit = getLatestGroups().find(g => g.groupName === name);
      if (hit?.id) return hit.id;
      // slight backoff to let state hydrate
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, delayMs));
    }
    return '';
  }

  /**
   * Commit or cancel changes when the heading loses focus.
   *
   * @param event Blur event emitted from the editable heading.
   */
  async function handleBlur(event: React.FocusEvent<HTMLElement>) {
    const newGroupName = event.target.textContent?.trim() ?? '';

    const doCancel = () => {
      // Revert text & placeholder
      if (headingRef.current) {
        headingRef.current.textContent = hasTitle ? bookmarkGroup.groupName : NEW_GROUP_NAME;
      }
      setIsPlaceholder(!hasTitle);
      onCancel?.();
      if (externalIsEditing === undefined) setInternalIsEditing(false);
    };

    const doCommit = async (name: string) => {
      setIsPlaceholder(false);
      // 1) Immediately persist & broadcast by **name** (fallback)
      const wsId = activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID;
      const key = lastGroupKey(userId, storageMode, wsId);
      writeLastSelectedGroup(key, name);                // legacy name fallback
      broadcastLastSelectedGroup({ workspaceId: wsId, groupName: name });

      // 2) Commit the rename (or creation) to the store
      if (onCommit) await onCommit(name);
      else await editBookmarkGroupHeading(groupIndex, name);

      // 3) Try to resolve an **id** and upgrade storage + rebroadcast with id
      //    (use index first—same group instance—then fallback by name)
      let resolvedId = getLatestGroups()[groupIndex]?.id || '';
      if (!resolvedId) resolvedId = await findGroupIdByName(name, 10, 100);
      if (resolvedId) {
        writeLastSelectedGroup(key, resolvedId);
        broadcastLastSelectedGroup({ workspaceId: wsId, groupId: resolvedId });
      }

      if (externalIsEditing === undefined) setInternalIsEditing(false);
    };

    if (newGroupName === '') {
      // Empty -> cancel/revert to placeholder or original
      doCancel();
    } else {
      await doCommit(newGroupName);
    }
  }

  /**
   * Handle keyboard shortcuts for confirming or cancelling edits.
   *
   * @param event Keyboard event emitted from the editable heading.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!editing) return;
    if (event.key === 'Enter') {
      event.preventDefault(); // no newline
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      // Revert immediately and cancel
      if (headingRef.current) {
        headingRef.current.textContent = hasTitle ? bookmarkGroup.groupName : NEW_GROUP_NAME;
      }
      setIsPlaceholder(!hasTitle);
      onCancel?.();
      if (externalIsEditing === undefined) setInternalIsEditing(false);
    }
  }

  /**
   * Toggle placeholder styling when the heading content changes.
   *
   * @param event Input event from the contentEditable element.
   */
  function handleInput(event: React.FormEvent<HTMLElement>) {
    if (!editing) return;
    setIsPlaceholder(event.currentTarget.textContent?.trim() === '');
  }

  /**
   * Enter edit mode when clicking the heading in uncontrolled scenarios.
   */
  const handleClick = () => {
    if (externalIsEditing === undefined) {
      if (headingRef.current && isPlaceholder) {
        // Optional: clear placeholder on first click
        // (we still select all on focus, so this is not required)
        // headingRef.current.textContent = '';
      }
      setInternalIsEditing(true);
    }
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Focus the heading and select its contents whenever edit mode becomes active.
   */
  useEffect(() => {
    if (!editing || !headingRef.current) return;

    // Focus first
    headingRef.current.focus();

    // Select all text (so typing replaces "+ Add a group")
    // Defer to the next tick so contentEditable is fully ready.
    const t = setTimeout(() => {
      const el = headingRef.current;
      if (!el) return;
      const selection = window.getSelection && window.getSelection();
      if (!selection) return;

      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }, 0);

    return () => clearTimeout(t);
  }, [editing]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component UI -------------------- */
  return (
    <h2
      ref={setMergedRef}                        // ⬅️ forward the ref to parent
      contentEditable={editing}
      onBlur={handleBlur}
      onKeyDown={editing ? handleKeyDown : undefined}
      onInput={editing ? handleInput : undefined}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`editable-heading ${isPlaceholder ? 'placeholder-text' : ''}`}
      suppressContentEditableWarning={true}
    >
      {hasTitle ? bookmarkGroup.groupName : NEW_GROUP_NAME}
    </h2>
  );
  /* ---------------------------------------------------------- */
}
