/* -------------------- Imports -------------------- */
import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

/* CSS styles */
import '@/styles/AddBookmarkInline.css';

/* Constants */
import { URL_PATTERN } from '@/core/constants/constants';

/* Hooks and Utilities */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';
import type { AppContextValue } from '@/scripts/AppContextProvider';
import { constructValidURL } from "@/core/utils/url";
import { lastGroupKey, writeLastSelectedGroup, broadcastLastSelectedGroup } from '@/core/utils/lastSelectedGroup';

/* Analytics */
import { useAnalytics } from "@/analytics/AnalyticsContext";
import { AnalyticsContext, type AnalyticsType } from "@/analytics/AnalyticsContext"; 
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type AddBookmarkInlineProps = {
  groupIndex: number;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>; 
  focusField?: 'name' | 'url';
  onDone?: () => void;
  prefillUrl?: string;
  prefillName?: string;
  autofillFromClipboard?: boolean;
};

type CreateNewBookmarkProps = {
  groupName: string;
  setLinkBeingEdited: React.Dispatch<React.SetStateAction<boolean>>;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>; 
  focusField?: 'name' | 'url';
  onDone?: () => void;
  prefillUrl?: string;
  prefillName?: string;
  autofillFromClipboard?: boolean;
};

type AddLinkButtonProps = {
  onClick: () => void;
};
/* ---------------------------------------------------------- */

/* -------------------- Class-level helper functions -------------------- */
// Lazy-load the REAL AnalyticsProvider 
const AnalyticsProviderLazy = React.lazy(async () => {
  const mod = await import("@/analytics/AnalyticsProvider");
  return { default: mod.default };
});

/**
 * No-op analytics provider so useAnalytics() won't throw in anonymous mode.
 *
 * @param {{ children: React.ReactNode }} props Component children to render.
 */
function NullAnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = (useContext(AppContext) as Partial<AppContextValue>) || {};

  const value = useMemo(
    () =>
      ({
        capture: (_event: string, _props?: Record<string, unknown>) => {},

        // If AnalyticsType expects id?: string or string | undefined:
        identify: (_id?: string, _traits?: Record<string, unknown>) => {},

        optOut: true,
        setOptOut: (_next: boolean) => {},

        // <-- use undefined, not null
        userId: userId ?? undefined,
      } satisfies AnalyticsType),
    [userId]
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

/**
 * Ensure an analytics provider exists by lazily loading the real provider or falling back to the null variant.
 *
 * @param {{ children: React.ReactNode }} props Component children that need analytics context.
 */
function AnalyticsGate({ children }: { children: ReactNode }) {
  const existing = useContext(AnalyticsContext);
  if (existing) return <>{children}</>; // avoid double-wrapping if NewTabPage already provided it

  const { isSignedIn } = useContext(AppContext) as AppContextValue;
  if (isSignedIn) {
    return (
      <React.Suspense fallback={children}>
        <AnalyticsProviderLazy>{children}</AnalyticsProviderLazy>
      </React.Suspense>
    );
  }
  return <NullAnalyticsProvider>{children}</NullAnalyticsProvider>;
}

/**
 * Generate a display-friendly bookmark name from a URL when the user leaves the name blank.
 *
 * @param {string} u Raw URL string.
 * @returns {string} Derived bookmark name.
 */
function deriveNameFromUrl(u: string): string {
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
/**
 * Capitalize the first letter of each word in a string.
 *
 * @param {string} s Input string.
 * @returns {string} Capitalized string.
 */
function capitalizeWords(s = ''): string {
  return s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}
/* ---------------------------------------------------------- */

/* -------------------- Sub components -------------------- */
/**
 * Lightweight trigger that opens the inline bookmark form.
 *
 * @param onClick Click handler invoked to reveal the form.
 */
function AddLinkButton({ onClick }: AddLinkButtonProps) {
  return (
    <div>
      <button className="add-bookmark-button-1" onClick={onClick}>
        + Add a link
      </button>
    </div>
  );
}

/**
 * Form body that captures bookmark metadata, persists it, and updates the last-selected group.
 *
 * @param props Form configuration values and callbacks.
 */
function CreateNewBookmark({
  groupName,
  setLinkBeingEdited,
  autoFocus = false,
  inputRef,
  focusField = 'name',
  onDone,
  prefillUrl,
  prefillName,
  autofillFromClipboard = true,
}: CreateNewBookmarkProps) {
  /* -------------------- Context / state -------------------- */
  const { capture } = useAnalytics();

  // Context & actions
  const { addNamedBookmark } = useBookmarkManager();
  const { userId, storageMode, activeWorkspaceId, bookmarkGroups, groupsIndex } =
    useContext(AppContext) as AppContextValue;

  // Local form state
  const [bookmarkName, setBookmarkName] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');

  // Inputs
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  // Merge external inputRef with our chosen focus target
  const setMergedRef = useCallback(
    (node: HTMLInputElement | null) => {
      const targetRef = focusField === 'name' ? nameInputRef : urlInputRef;
      if (node) targetRef.current = node;

      if (typeof inputRef === 'function') inputRef(node);
      else if (inputRef && 'current' in inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    },
    [inputRef, focusField]
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Local helper functions -------------------- */
  /**
   * Update the pending bookmark name as the user types.
   *
   * @param e Input change event from the name field.
   */
  function handleBookmarkNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBookmarkName(e.target.value);
  }

  /**
   * Update the pending bookmark URL as the user types.
   *
   * @param e Input change event from the URL field.
   */
  function handleBookmarkUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBookmarkUrl(e.target.value);
  }

  /**
   * Treat Enter key presses as submit triggers inside the inline form.
   *
   * @param e Keyboard event emitted from the form.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  /**
   * Persist the new bookmark, update last-selected metadata, and close the inline form.
   *
   * @param e Synthetic event from the submit button or form.
   */
  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const urlWithProtocol = constructValidURL(bookmarkUrl);
    capture("bookmark_added", { surface: "newtab" });
    await addNamedBookmark(bookmarkName, urlWithProtocol, groupName);

    // Find this group's id (prefer hydrated, fallback to index)
    const candidates = (bookmarkGroups?.length ? bookmarkGroups : groupsIndex) || [];
    const grp = candidates.find(g => g.groupName === groupName);
    const groupId = grp?.id;
    
    if (groupId) {
      const key = lastGroupKey(userId, storageMode, activeWorkspaceId);
      writeLastSelectedGroup(key, groupId);
      broadcastLastSelectedGroup({ 
        workspaceId: activeWorkspaceId ?? 'default', 
        groupId 
      });
    }

    setBookmarkName('');
    setBookmarkUrl('');

    setLinkBeingEdited(false);
    onDone?.();
  }

  /**
   * Close the inline editor without saving.
   */
  function closeForm() {
    setLinkBeingEdited(false);
    onDone?.();
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Focus the selected input when the form mounts or the focus target changes.
   */
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

  /**
   * Attempt to seed the form with explicit prefills, then fall back to clipboard contents.
   */
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
  /* ---------------------------------------------------------- */

  /* -------------------- Sub component UI -------------------- */
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
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="add-bookmark-button-2"
          onClick={handleSubmit}
          aria-label="Submit Form"
        >
          Add link
        </button>

        <button
          className="close-form-button"
          onClick={closeForm}
          aria-label="Close Form"
        >
          <i className="fas fa-xmark text-sm" />
        </button>
      </div>
    </div>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */

/* -------------------- Main exported component -------------------- */
/**
 * Inline entry point for adding bookmarks within a group, providing onboarding-friendly focus/autofill behavior.
 *
 * @param props Component props controlling focus, prefills, and callbacks.
 */
export function AddBookmarkInline(props: AddBookmarkInlineProps) {
  /* -------------------- Context / state -------------------- */
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

  const { bookmarkGroups } = useContext(AppContext) as AppContextValue;
  const [linkBeingEdited, setLinkBeingEdited] = useState(false);
  const bookmarkGroupName = bookmarkGroups[groupIndex]?.groupName;
  /* ---------------------------------------------------------- */

  /* -------------------- Local helper functions -------------------- */
  /**
   * Open the inline editor when the user taps the add link button.
   */
  function handleAddLinkClicked() {
    setLinkBeingEdited(true);
  }
  /* ---------------------------------------------------------- */
  
  /* -------------------- Effects -------------------- */
  /**
   * Auto-open the inline editor when `autoFocus` is requested.
   */
  useEffect(() => {
    if (autoFocus) setLinkBeingEdited(true);
  }, [autoFocus]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component UI -------------------- */
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
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
