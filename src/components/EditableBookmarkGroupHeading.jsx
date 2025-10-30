import React, { useContext, useState, useRef, useEffect } from 'react';

/* CSS styles */
import '@/styles/EditableBookmarkGroupHeading.css';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/Constants";

/* Hooks and Utilities */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

const NEW_GROUP_NAME = "+ Add a group";

function EditableBookmarkGroupHeading(props) {
  const {
    bookmarkGroup,
    groupIndex,

    // NEW: optional external controls
    isEditing: externalIsEditing,
    inputRef: externalInputRef,
    onCommit,
    onCancel,
  } = props;

  const { editBookmarkGroupHeading } = useBookmarkManager();

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
  const headingRef = useRef(null);
  const setMergedRef = (node) => {
    headingRef.current = node;
    if (typeof externalInputRef === 'function') {
      externalInputRef(node);
    } else if (externalInputRef && 'current' in externalInputRef) {
      externalInputRef.current = node;
    }
  };

  // Focus + select all text when editing starts
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

  // Handle blur -> commit or revert
  async function handleBlur(event) {
    const newGroupName = event.target.textContent.trim();

    const doCancel = () => {
      // Revert text & placeholder
      if (headingRef.current) {
        headingRef.current.textContent = hasTitle ? bookmarkGroup.groupName : NEW_GROUP_NAME;
      }
      setIsPlaceholder(!hasTitle);
      onCancel?.();
      if (externalIsEditing === undefined) setInternalIsEditing(false);
    };

    const doCommit = async (name) => {
      setIsPlaceholder(false);
      if (onCommit) {
        onCommit(name);
      } else {
        await editBookmarkGroupHeading(groupIndex, name);
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

  // Keyboard UX
  function handleKeyDown(event) {
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

  function handleInput(event) {
    if (!editing) return;
    setIsPlaceholder(event.currentTarget.textContent.trim() === '');
  }

  // Click to start editing (only when uncontrolled)
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
}

export { EditableBookmarkGroupHeading };
