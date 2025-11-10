/* -------------------- Imports -------------------- */
import React, { useState, useRef, useContext, useCallback } from 'react';

import type { BookmarkType } from "@/core/types/bookmarks";
import type { AppContextValue } from "@/scripts/AppContextProvider";

/* CSS styles */
import '@/styles/NewTab.css';

/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Scripts */
import { AppContext } from '@/scripts/AppContextProvider';

/* Events */
import { openCopyTo } from '@/scripts/events/copyToBridge';

/* Components */
import SmartFavicon from '@/components/SmartFavicon';
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

  // Get all actions from the custom bookmarks hook
  const { 
    deleteBookmark,
    editBookmarkName, 
  } = useBookmarkManager();  

  const [text, setText] = useState<string>(bookmark.name ?? '');
  const [url] = useState<string>(bookmark.url ?? '');       

  const aRef = useRef<HTMLAnchorElement>(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Enter inline edit mode for a bookmark title and persist the change on blur/Enter.
   */
  const handleBookmarkNameEdit = useCallback((
    _event: React.MouseEvent<HTMLButtonElement>,
    grpIndex: number,
    bmIndex: number
  ) => {
    const aElement = aRef.current;
    if (!aElement) return; 
    if (aElement.isContentEditable) return;  // prevent double-initialization

    // Make the <a> element's content editable
    aElement.setAttribute('contenteditable', 'true');
    aElement.focus();

    // Select all text in the <a> element
    const selection = typeof window !== 'undefined' ? window.getSelection() : null; 
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(aElement);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Use native events; type them precisely
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        aElement.blur(); // triggers blur handler
      } else if (ev.key === 'Escape') {                      
        aElement.textContent = text;
        aElement.blur();
      }
    };

    const cleanup = () => {                                   
      aElement.setAttribute('contenteditable', 'false');
      aElement.removeEventListener('keydown', onKeyDown);
      aElement.removeEventListener('blur', onBlur);
    };

    const onBlur = async (ev: FocusEvent) => {
      // target is EventTarget | null; narrow to HTMLAnchorElement
      const target = ev.target as HTMLAnchorElement | null;
      const newBookmarkName = target?.textContent?.trim() ?? '';

      if (newBookmarkName !== text) {  // avoid no-op writes
        setText(newBookmarkName);
        await editBookmarkName(grpIndex, bmIndex, newBookmarkName);
      }
      cleanup(); 
    };

    aElement.addEventListener('keydown', onKeyDown);
    aElement.addEventListener('blur', onBlur, { once: true });
  }, [editBookmarkName, text]); 

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
    const bookmark = bookmarkGroup.bookmarks[bookmarkIndex];
    if (!bookmark) return;
    
    const shouldDelete = window.confirm(
      `Are you sure you want to delete the "${bookmark.name}" bookmark from "${bookmarkGroup.groupName}"?`
    );
    if (shouldDelete) {
      await deleteBookmark(bmIndex, grpIndex);
    }
  }, [bookmarkGroups, groupIndex, bookmarkIndex, deleteBookmark]);

  /**
   * Trigger the copy-to modal for a single bookmark within the active workspace.
   */
  const handleBookmarkCopy = useCallback((event: React.MouseEvent<HTMLButtonElement>) => { 
    event.stopPropagation(); // don’t start a drag
    if (!activeWorkspaceId) return;
    openCopyTo({
      kind: 'bookmark',
      fromWorkspaceId: activeWorkspaceId,
      bookmarkIds: [bookmark.id], // single-bookmark copy; we can extend to multiselect later
    });
  }, [activeWorkspaceId, bookmark.id]);
  /* ---------------------------------------------------------- */

  /* -------------------- Component UI -------------------- */
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
        ref={aRef}
        className="text-base"
      >
        {text}
      </a>

      <button
        type="button"
        className='modify-link-button' 
        // preventDefault avoids focus ripple in some browsers
        onClick={(event) => { event.preventDefault(); handleBookmarkNameEdit(event, groupIndex, bookmarkIndex); }}
        aria-label="Edit bookmark"
        title="Edit bookmark"
      >
        <i className="fa fa-pencil text-xsm" />
      </button>
      <button 
        type="button"
        className='modify-link-button' 
        onClick={handleBookmarkCopy}
        disabled={!activeWorkspaceId}  // explicit disabled state
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
