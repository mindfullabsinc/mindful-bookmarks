import React, { useState, useRef, useContext, useMemo } from 'react';

/* CSS styles */
import '@/styles/NewTab.css';

/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Scripts */
import { AppContext } from '@/scripts/AppContextProvider';

/* Events */
import { openCopyTo } from '@/scripts/events/copyToBridge';

/* Utilities */
import { createUniqueID } from "@/core/utils/utilities";

/* -----------------------------
   Favicon helpers + component
   ----------------------------- */

// Simple in-memory caches (per page load)
const goodSourceCache = new Map(); // hostname -> working favicon URL
const badSourceCache = new Map();  // hostname -> true (no icon found)

function toHostname(raw) {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function circleColorFor(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}

function DomainLetter({ host, size, className }) {
  const letter = host.replace(/^www\./, '')[0]?.toUpperCase() ?? '?';
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: circleColorFor(host),
    color: 'white',
    fontSize: Math.max(10, Math.round(size * 0.6)),
    lineHeight: `${size}px`,
    textAlign: 'center',
    fontWeight: 700,
    display: 'inline-block',
  };
  return (
    <span className={className} aria-hidden="true" style={style}>
      {letter}
    </span>
  );
}

/**
 * Fault-tolerant favicon loader.
 * Tries multiple sources, caches the first success per hostname, and falls back gracefully.
 */
function Favicon({ url, size = 16, className, fallback = 'letter' /* 'letter' | 'blank' */ }) {
  const host = useMemo(() => toHostname(url), [url]);
  const [idx, setIdx] = useState(0);

  const candidates = useMemo(() => {
    if (!host) return [];
    const s = String(size);
    return [
      // Order chosen for reliability + low false-404 rate
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://www.google.com/s2/favicons?sz=${s}&domain=${host}`,
      `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${host}&size=${s}`,
      `https://${host}/favicon.ico`,
    ];
  }, [host, size]);

  // If we already know a good source, pin to it to avoid repeat probes (and their 404 logs)
  const pinned = host ? goodSourceCache.get(host) : undefined;
  const src = pinned ?? candidates[idx];

  if (!host) return null;

  if (badSourceCache.has(host) && !pinned) {
    return fallback === 'letter' ? (
      <DomainLetter host={host} size={size} className={className} />
    ) : null;
  }

  if (!src) {
    badSourceCache.set(host, true);
    return fallback === 'letter' ? (
      <DomainLetter host={host} size={size} className={className} />
    ) : null;
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""                 // decorative
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      style={{ objectFit: 'contain', borderRadius: 4, display: 'inline-block' }}
      onLoad={() => {
        if (host) {
          goodSourceCache.set(host, src);
          badSourceCache.delete(host);
        }
      }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}

export function EditableBookmark(props) {
  /* -------------------- Context / state -------------------- */
  const { bookmarkGroups, activeWorkspaceId } = useContext(AppContext);

  // Get all actions from the custom bookmarks hook
  const { 
    deleteBookmark,
    editBookmarkName, 
  } = useBookmarkManager();  
  
  const [text, setText] = useState(props.bookmark.name);
  const [url, setUrl] = useState(props.bookmark.url);

  const aRef = useRef(null);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  function handleBookmarkNameEdit(event, groupIndex, bookmarkIndex, aRef) {
    // Make the <a> element's content editable
    const aElement = aRef.current;
    aElement.setAttribute('contenteditable', 'true'); 
    aElement.focus();
    
    // Select all text in the <a> element
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(aElement);
    selection.removeAllRanges();
    selection.addRange(range);

    // Listen for "keydown - Enter" and "blur" events on the link element
    const onKeyDown = (event) => {
      if (event.key === 'Enter') { 
        event.preventDefault(); 
        aElement.blur(); // triggers blur handler
      }
    };
    const onBlur = async (event) => {
      const newBookmarkName = event.target.textContent.trim();
      setText(newBookmarkName);
      await editBookmarkName(groupIndex, bookmarkIndex, newBookmarkName);
      aElement.setAttribute('contenteditable', 'false'); 
      aElement.removeEventListener('keydown', onKeyDown);
      aElement.removeEventListener('blur', onBlur);
    };

    aElement.addEventListener('keydown', onKeyDown);
    aElement.addEventListener('blur', onBlur);
  }

  async function handleBookmarkDelete(event, groupIndex, bookmarkIndex) {
    const bookmarkGroup = bookmarkGroups[groupIndex];
    const bookmark = bookmarkGroup.bookmarks[bookmarkIndex];
    const shouldDelete = window.confirm(
      "Are you sure you want to delete the " + bookmark.name + " bookmark from " + bookmarkGroup.groupName + "?"
    ); 
    if (shouldDelete) {
      await deleteBookmark(bookmarkIndex, groupIndex);
    }
  }

  function handleBookmarkCopy(event) {
    console.log("[EditableBookmark.jsx]: In handleBookmarkCopy()");
    event.stopPropagation(); // don’t start a drag
    if (!activeWorkspaceId) return;
    openCopyTo({
      kind: 'bookmark',
      fromWorkspaceId: activeWorkspaceId,
      bookmarkIds: [props.bookmark.id], // single-bookmark copy; we can extend to multiselect later
    });
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Component UI -------------------- */
  return (
    <div key={createUniqueID()} className="bookmark-container">
      {/* Replaces the raw <img> with a resilient favicon */}
      <Favicon
        url={props.bookmark.url}
        size={16}
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
        className='modify-link-button' 
        onClick={(event) => handleBookmarkNameEdit(event, props.groupIndex, props.bookmarkIndex, aRef)} 
        aria-label="Edit bookmark"
        title="Edit bookmark"
      >
        <i className="fa fa-pencil text-xsm" />
      </button>
      <button 
        className='modify-link-button' 
        onClick={handleBookmarkCopy}
        aria-label="Copy/Move bookmark"
        title="Copy/Move bookmark"
      >
        <i className="far fa-copy text-xs" />
      </button>
      <button
        className='modify-link-button' 
        onClick={(event) => handleBookmarkDelete(event, props.groupIndex, props.bookmarkIndex)}  
        aria-label="Delete bookmark"
        title="Delete bookmark"
      >
        <i className="fa fa-xmark text-xs" />
      </button>
    </div>
  );
  /* ---------------------------------------------------------- */
}