/* -------------------- Imports -------------------- */
import React, { useState, useRef, useContext, useCallback, useEffect } from 'react';

import type { BookmarkType } from "@/core/types/bookmarks";
import type { AppContextValue } from "@/scripts/AppContextProvider";

/* CSS styles */
import '@/styles/NewTab.css';
import '@/styles/AddBookmarkInline.css';

/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Scripts */
import { AppContext } from '@/scripts/AppContextProvider';

/* Events */
import { openCopyTo } from '@/scripts/events/copyToBridge';

/* Components */
import SmartFavicon from '@/components/SmartFavicon';

/* Utilities */
import { constructValidURL } from "@/core/utils/url";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type EditableBookmarkProps = {
  bookmark: BookmarkType;
  groupIndex: number;
  bookmarkIndex: number;
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export function EditableBookmark({ bookmark, groupIndex, bookmarkIndex }: EditableBookmarkProps) {
  /* -------------------- Context / state -------------------- */
  const { bookmarkGroups, activeWorkspaceId } = useContext(AppContext) as AppContextValue;

  const {
    deleteBookmark,
    editBookmark,
  } = useBookmarkManager();

  const [text, setText] = useState<string>(bookmark.name ?? '');
  const [url, setUrl] = useState<string>(bookmark.url ?? '');

  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [editName, setEditName] = useState('');

  const editUrlRef = useRef<HTMLInputElement>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Focus the URL field whenever the edit form opens.
   */
  useEffect(() => {
    if (isEditing) {
      const t = setTimeout(() => {
        editUrlRef.current?.focus();
        editUrlRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isEditing]);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Open the inline edit form pre-filled with the current bookmark values.
   */
  const handleEditClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setEditUrl(url);
    setEditName(text);
    setIsEditing(true);
  }, [url, text]);

  /**
   * Persist the edited name and URL, then close the form.
   */
  const handleEditSubmit = useCallback(async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const urlWithProtocol = constructValidURL(editUrl);
    const finalName = editName.trim() || urlWithProtocol;
    setText(finalName);
    setUrl(urlWithProtocol);
    setIsEditing(false);
    await editBookmark(groupIndex, bookmarkIndex, finalName, urlWithProtocol);
  }, [editUrl, editName, groupIndex, bookmarkIndex, editBookmark]);

  /**
   * Close the edit form without saving.
   */
  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  /**
   * Treat Enter as submit and Escape as cancel inside the edit form.
   */
  function handleEditKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit(e);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }

  /**
   * Confirm and remove a bookmark from its group.
   */
  const handleBookmarkDelete = useCallback(async (
    _event: React.MouseEvent<HTMLButtonElement>,
    grpIndex: number,
    bmIndex: number
  ) => {
    const bookmarkGroup = bookmarkGroups[groupIndex];
    if (!bookmarkGroup) return;
    const bm = bookmarkGroup.bookmarks[bookmarkIndex];
    if (!bm) return;

    const shouldDelete = window.confirm(
      `Are you sure you want to delete the "${bm.name}" bookmark from "${bookmarkGroup.groupName}"?`
    );
    if (shouldDelete) {
      await deleteBookmark(bmIndex, grpIndex);
    }
  }, [bookmarkGroups, groupIndex, bookmarkIndex, deleteBookmark]);

  /**
   * Trigger the copy-to modal for a single bookmark within the active workspace.
   */
  const handleBookmarkCopy = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!activeWorkspaceId) return;
    openCopyTo({
      kind: 'bookmark',
      fromWorkspaceId: activeWorkspaceId,
      bookmarkIds: [bookmark.id],
    });
  }, [activeWorkspaceId, bookmark.id]);
  /* ---------------------------------------------------------- */

  /* -------------------- Component UI -------------------- */
  if (isEditing) {
    return (
      <div className="create-new-bookmark-component">
        <div className="form-container">
          <form onKeyDown={handleEditKeyDown}>
            <input
              type="text"
              placeholder="Enter a link URL"
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              required
              aria-label="Link URL"
              ref={editUrlRef}
            />
            <input
              type="text"
              placeholder="Enter a link name (optional)"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              aria-label="Link Name"
            />
          </form>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="add-bookmark-button-2"
            onClick={handleEditSubmit}
            aria-label="Save"
          >
            Save
          </button>
          <button
            className="close-form-button"
            onClick={handleEditCancel}
            aria-label="Cancel edit"
          >
            <i className="fas fa-xmark text-sm" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bookmark-container">
      <SmartFavicon
        url={url}
        size={20}
        className="favicon"
        fallback="letter"
      />

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-base"
      >
        {text}
      </a>

      <button
        type="button"
        className='modify-link-button'
        onClick={handleEditClick}
        aria-label="Edit bookmark"
        title="Edit bookmark"
      >
        <i className="fa fa-pencil text-xsm" />
      </button>
      <button
        type="button"
        className='modify-link-button'
        onClick={handleBookmarkCopy}
        disabled={!activeWorkspaceId}
        aria-label="Copy/Move bookmark"
        title="Copy/Move bookmark"
      >
        <i className="far fa-copy text-xs" />
      </button>
      <button
        type="button"
        className='modify-link-button'
        onClick={(event) => handleBookmarkDelete(event, groupIndex, bookmarkIndex)}
        aria-label="Delete bookmark"
        title="Delete bookmark"
      >
        <i className="fa fa-xmark text-xs" />
      </button>
    </div>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
