import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* CSS styles */
import '@/styles/AddBookmarkInline.css';

/* Constants */
import { URL_PATTERN } from '@/core/constants/constants';

/* Hooks and Utilities */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';
import { constructValidURL } from "@/core/utils/utilities";

/* Analytics */
import { useAnalytics } from "@/analytics/AnalyticsContext";
import { AnalyticsContext } from "@/analytics/AnalyticsContext"; 


// Lazy-load the REAL AnalyticsProvider (same export you used in NewTabPage)
const AnalyticsProviderLazy = React.lazy(async () => {
  const mod = await import("@/analytics/AnalyticsProvider");
  const Provider = mod.default ?? mod.AnalyticsProvider ?? (({ children }) => <>{children}</>);
  return { default: Provider };
});

/** No-op provider for anonymous mode so useAnalytics() won't throw */
function NullAnalyticsProvider({ children }) {
  const { userId } = useContext(AppContext) || {};
  const value = useMemo(
    () => ({
      capture: () => {},  // swallow events in anon mode
      optOut: true,
      setOptOut: () => {},
      userId: userId ?? null,
    }),
    [userId]
  );
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

/**
 * Gate that ensures a provider exists:
 * - If a provider is already above, do nothing.
 * - If signed in, lazy-load the real provider.
 * - If signed out, use a no-op provider.
 */
function AnalyticsGate({ children }) {
  const existing = useContext(AnalyticsContext);
  if (existing) return <>{children}</>; // avoid double-wrapping if NewTabPage already provided it

  const { isSignedIn } = useContext(AppContext);
  if (isSignedIn) {
    return (
      <React.Suspense fallback={children}>
        <AnalyticsProviderLazy>{children}</AnalyticsProviderLazy>
      </React.Suspense>
    );
  }
  return <NullAnalyticsProvider>{children}</NullAnalyticsProvider>;
}

function AddBookmarkInline(props) {
  const {
    groupIndex,
    autoFocus = false,     // open + focus automatically
    inputRef,              // exposes the main input element to parent (Grid)
    focusField = 'name',    // 'url' | 'name'
    onDone,                // called after submit/close
    // NEW: optional explicit prefills (take precedence over clipboard)
    prefillUrl,
    prefillName,
    autofillFromClipboard = true,
  } = props;

  const { bookmarkGroups } = useContext(AppContext);
  const [linkBeingEdited, setLinkBeingEdited] = useState(false);
  const bookmarkGroupName = bookmarkGroups[groupIndex]?.groupName;

  // Auto-open when requested
  useEffect(() => {
    if (autoFocus) setLinkBeingEdited(true);
  }, [autoFocus]);

  function handleAddLinkClicked() {
    setLinkBeingEdited(true);
  }

  return (
    <div className="add-link-inline-container">
      {!linkBeingEdited ? (
        <AddLinkButton onClick={handleAddLinkClicked} />
      ) : (
        <AnalyticsGate>
          <CreateNewBookmark
            groupName={bookmarkGroupName}
            setLinkBeingEdited={setLinkBeingEdited}
            // focus/refs
            autoFocus={true}
            inputRef={inputRef}
            focusField={focusField}
            onDone={onDone}
            // prefills
            prefillUrl={prefillUrl}
            prefillName={prefillName}
            autofillFromClipboard={autofillFromClipboard}
          />
        </AnalyticsGate>
      )}
    </div>
  );
}

function AddLinkButton({ onClick }) {
  return (
    <div>
      <button className="add-bookmark-button-1" onClick={onClick}>
        + Add a link
      </button>
    </div>
  );
}

function CreateNewBookmark(props) {
  const { capture } = useAnalytics();

  const {
    groupName,
    setLinkBeingEdited,
    autoFocus = false,
    inputRef,
    focusField = 'name',
    onDone,
    prefillUrl,
    prefillName,
    autofillFromClipboard = true,
  } = props;

  // Context & actions
  const { addNamedBookmark } = useBookmarkManager();

  // Local form state
  const [bookmarkName, setBookmarkName] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');

  // Inputs
  const nameInputRef = useRef(null);
  const urlInputRef = useRef(null);

  // Merge external inputRef with our chosen focus target
  const setMergedRef = useCallback(
    (node) => {
      const targetRef = focusField === 'name' ? nameInputRef : urlInputRef;
      if (node) targetRef.current = node;

      if (typeof inputRef === 'function') inputRef(node);
      else if (inputRef && 'current' in inputRef) inputRef.current = node;
    },
    [inputRef, focusField]
  );

  // Focus the chosen input on open
  useEffect(() => {
    if (!autoFocus) return;
    const el = (focusField === 'name' ? nameInputRef.current : urlInputRef.current)
      ?? nameInputRef.current
      ?? urlInputRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.focus?.();
      el.select?.();
    }, 0);
    return () => clearTimeout(t);
  }, [autoFocus, focusField]);

  // 🔽🔽 AUTOFILL LOGIC (props first, clipboard fallback) 🔽🔽
  useEffect(() => {
    if (!autoFocus) return;

    // 1) Explicit prefills win
    let initialized = false;
    if (typeof prefillName === 'string' && prefillName.length) {
      setBookmarkName(prefillName);
      initialized = true;
    }
    if (typeof prefillUrl === 'string' && prefillUrl.length) {
      setBookmarkUrl(prefillUrl);
      initialized = true;
    }

    // 2) Otherwise try clipboard (secure contexts + user gesture requirements apply)
    if (!initialized && autofillFromClipboard && navigator.clipboard?.readText) {
      navigator.clipboard
        .readText()
        .then((t) => {
          if (/^https?:\/\//i.test(t)) {
            setBookmarkUrl(t);
            // Derive a friendly default name if empty
            setBookmarkName((prev) => prev || deriveNameFromUrl(t));

            // Reselect text in the focused field so paste-over still easy
            const el = (focusField === 'name' ? nameInputRef.current : urlInputRef.current)
              ?? urlInputRef.current
              ?? nameInputRef.current;
            if (el) {
              setTimeout(() => {
                el.focus?.();
                el.select?.();
              }, 0);
            }
          }
        })
        .catch(() => {
          // ignore clipboard errors silently
        });
    }
  }, [autoFocus, prefillUrl, prefillName, autofillFromClipboard, focusField]);
  // 🔼🔼 AUTOFILL LOGIC 🔼🔼

  function handleBookmarkNameChange(e) {
    setBookmarkName(e.target.value);
  }

  function handleBookmarkUrlChange(e) {
    setBookmarkUrl(e.target.value);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const urlWithProtocol = constructValidURL(bookmarkUrl);
    capture("bookmark_added", { surface: "newtab" });
    await addNamedBookmark(bookmarkName, urlWithProtocol, groupName);

    setBookmarkName('');
    setBookmarkUrl('');

    setLinkBeingEdited(false);
    onDone?.();
  }

  function closeForm() {
    setLinkBeingEdited(false);
    onDone?.();
  }

  return (
    <div className="create-new-bookmark-component">
      <div className="form-container">
        <form onKeyDown={handleKeyDown}>
          <input
            type="text"
            placeholder="Enter a link name"
            value={bookmarkName}
            onChange={handleBookmarkNameChange}
            required
            aria-label="Link Name"
            ref={focusField === 'name' ? setMergedRef : nameInputRef}
          />
          <input
            type="text"
            placeholder="Enter a link URL"
            value={bookmarkUrl}
            onChange={handleBookmarkUrlChange}
            pattern={URL_PATTERN}
            required
            aria-label="Link URL"
            ref={focusField === 'url' ? setMergedRef : urlInputRef}
          />
        </form>
      </div>
      <button
        type="submit"
        className="add-bookmark-button-2"
        onClick={handleSubmit}
        aria-label="Submit Form"
      >
        Add link
      </button>
      <button className="close-form-button" onClick={closeForm} aria-label="Close Form">
        <img src="./assets/delete-icon.svg" alt="Close" />
      </button>
    </div>
  );
}

/* Helpers */
function deriveNameFromUrl(u) {
  try {
    const { hostname, pathname } = new URL(u);
    const host = hostname.replace(/^www\./, '');
    const domain = host.split('.').slice(0, -1).join('.') || host; // strip TLD if present
    const seg = pathname.split('/').filter(Boolean)[0];
    const segPretty = seg ? decodeURIComponent(seg).replace(/[-_]+/g, ' ') : '';
    const base = capitalizeWords(domain);
    return segPretty && segPretty.length <= 30
      ? `${base} – ${capitalizeWords(segPretty)}`
      : base;
  } catch {
    return '';
  }
}
function capitalizeWords(s = '') {
  return s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

export { AddBookmarkInline };
