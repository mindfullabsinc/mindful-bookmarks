/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useRef } from "react";

// Import Amplify and the Authenticator UI component
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';

// Import Amplify configuration and configure Amplify
import config from '/amplify_outputs.json';
Amplify.configure(config);
import { signOut as amplifySignOut } from 'aws-amplify/auth';

/* CSS styles */
import "@/styles/Login.css";

/* Constants */
import {
  EMPTY_GROUP_IDENTIFIER,
  ONBOARDING_NEW_GROUP_PREFILL,
  StorageMode
} from "@/scripts/Constants";

/* Hooks and Utilities */
import { getUserStorageKey } from '@/scripts/Utilities';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { loadInitialBookmarks } from '@/scripts/bookmarksData';
import { AppContext } from "@/scripts/AppContextProvider";

/* Components */
import TopBanner from "@/components/TopBanner";
import DraggableGrid from '@/components/DraggableGrid';
import EmptyBookmarksState from '@/components/EmptyBookmarksState';

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";
/* ---------------------------------------------------------- */


/**
 * Render the Mindful new-tab surface, wiring bookmark context, storage switching,
 * and auth hand-offs for both signed-in and anonymous flows.
 *
 * @param {{ sub?: string }} [user] Authenticated Cognito user object, when available.
 * @param {() => Promise<void> | void} [signIn] Optional callback invoked when the user clicks sign-in.
 * @param {() => Promise<void> | void} [signOut] Optional callback invoked when the user clicks sign-out.
 * @returns {JSX.Element} New tab React tree.
 */
export function NewTabPage({ user, signIn, signOut }) {
  /* -------------------- Context / state --------------------*/
  const {
    bookmarkGroups,
    setBookmarkGroups,
    userId,
    storageMode,
    isMigrating,
    userAttributes,
    isSignedIn,
    hasHydrated,
    isHydratingRemote,
  } = useContext(AppContext);

  const gridRef = useRef(null);

  const ready = hasHydrated && !(storageMode !== StorageMode.LOCAL && isHydratingRemote);

  // --- De-dupe bursts from message + storage ---
  const lastAuthSignalAtRef = useRef(0);
  const lastModeSignalAtRef = useRef(0);

  // Get all actions from the custom bookmarks hook
  const {
    addEmptyBookmarkGroup,
    exportBookmarksToJSON,
    importBookmarksFromJSON,
    changeStorageMode,
  } = useBookmarkManager();
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Remove any `auth=` hash fragment so we do not show the inline authenticator unintentionally.
   */
  const clearAuthHash = () => {
    try {
      const h = window.location.hash || '';
      if (h.includes('auth=')) {
        // Clear hash without pushing history
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
  };

  /**
   * Handle cross-view auth signals by forcing a reload when a newer timestamp arrives.
   *
   * @param {number} [at=Date.now()] Millisecond timestamp associated with the auth event.
   */
  const handleAuthSignal = (at = Date.now()) => {
    if (at <= lastAuthSignalAtRef.current) return; // ignore duplicates
    lastAuthSignalAtRef.current = at;
    // Easiest & safest: full reload so all providers/hooks re-init with the new session
    window.location.reload();
  };

  /**
   * Respond to a broadcast that storage should flip to anonymous/local mode.
   *
   * @param {number} [at=Date.now()] Millisecond timestamp tagging the mode switch event.
   */
  const handleModeAnonSignal = (at = Date.now()) => {
    if (at <= lastModeSignalAtRef.current) return;
    lastModeSignalAtRef.current = at;
    // clear any auth route and reload so AppContext re-reads LOCAL
    clearBookmarkCaches();
    clearAuthHash();
    window.location.reload();
  };

  /**
   * Trigger the import flow via the bookmarks manager without surfacing errors here.
   */
  const handleLoadBookmarks = () => {
    importBookmarksFromJSON();
  };

  /**
   * Remove cached bookmark blobs and indices so anon/local views do not show stale remote data.
   *
   * @returns {Promise<void>} Resolves after attempting to clear storage namespaces.
   */
  async function clearBookmarkCaches() {
    try { await chrome?.storage?.session?.remove?.(['groupsIndex', 'bookmarkGroups']); } catch {}
    try { await chrome?.storage?.local?.remove?.(['groupsIndex', 'bookmarkGroups']); } catch {}
    // If your BookmarkCache uses localStorage, optionally nuke known keys here.
    try {
      // conservative: only remove keys we know might exist
      Object.keys(localStorage || {}).forEach(k => {
        if (k.startsWith('mindful_cache_') || k.startsWith('bookmarkCache_')) {
          try { localStorage.removeItem(k); } catch {}
        }
      });
    } catch {}
  }

  /**
   * Default sign-in handler for new-tab: pushes a hash to open the inline authenticator.
   *
   * @returns {void}
   */
  const defaultSignIn = () => {
    try {
      // Convention: NewTab auth route reader can pick this up.
      // For example, the router (or a small effect) can detect #auth=signIn
      // and render the <Authenticator> panel inline.
      const h = window.location.hash || '';
      if (!h.includes('auth=')) {
        window.location.hash = '#auth=signIn';
        // Trigger a hashchange in case the same hash is set elsewhere
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      // Optionally focus an auth container 
      const el = document.querySelector('[data-auth-root]');
      if (el) el.scrollIntoView({ block: 'center' });
    } catch (e) {
      console.warn('defaultSignIn failed:', e);
    }
  };

  /**
   * Broadcast auth lifecycle changes to other extension contexts.
   *
   * @param {'USER_SIGNED_OUT' | string} type Message type being sent through chrome runtime.
   */
  function broadcastAuthEdge(type /* 'USER_SIGNED_OUT' */) {
    const at = Date.now();
    try { chrome.storage?.local?.set({ authSignalAt: at, authSignal: 'signedOut' }); } catch {}
    try { chrome.runtime?.sendMessage?.({ type, at }, () => { chrome.runtime?.lastError; }); } catch {}
  }
  /**
   * Notify other contexts that storage preferences switched to anonymous/local mode.
   */
  function broadcastLocalModeEdge() {
    const at = Date.now();
    try { chrome.storage?.local?.set({ mindful_auth_mode: 'anon', modeSignalAt: at }); } catch {}
    try { chrome.runtime?.sendMessage?.({ type: 'MODE_SWITCHED_TO_ANON', at }, () => { chrome.runtime?.lastError; }); } catch {}
  }
  
  /**
   * Default sign-out handler: logs out via Amplify, clears caches, broadcasts signals, and reloads.
   *
   * @returns {Promise<void>} Resolves after the UI reload is requested.
   */
  const defaultSignOut = async () => {
    try { await amplifySignOut({ global: true }); } catch {}
    // flip UI to anon for any open New Tab pages
    await clearBookmarkCaches();  // Ensure anon doesn't inherit remote visuals
    broadcastAuthEdge('USER_SIGNED_OUT');
    broadcastLocalModeEdge();
    clearAuthHash();
    // simplest: full reload so providers/hooks re-init cleanly
    try { window.location.reload(); } catch {}
  }; 
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * On mount, check stored auth mode and strip any hash-based authenticator prompts if the user
   * explicitly chose anonymous mode in a prior session.
   */
  useEffect(() => {
    (async () => {
      try {
        const { mindful_auth_mode } = await chrome?.storage?.local?.get?.('mindful_auth_mode') ?? {};
        if (mindful_auth_mode === 'anon') {
          const h = window.location.hash || '';
          if (h.includes('auth=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      } catch {}
    })();
  }, []);

  /**
   * Ensure an empty placeholder group exists once data is hydrated so users can immediately add
   * bookmarks without manually creating a group first.
   */
  useEffect(() => {
    // Avoid adding an empty group before we know if cache / real data exist
    if (!ready) return; 
    if (!hasHydrated) return;
    if (!bookmarkGroups) return;
    if (bookmarkGroups.length === 0) {
      addEmptyBookmarkGroup();
      return;
    }
    const hasEmpty = bookmarkGroups.some(g => g.groupName === EMPTY_GROUP_IDENTIFIER);
    if (!hasEmpty) addEmptyBookmarkGroup();
  }, [hasHydrated, bookmarkGroups, addEmptyBookmarkGroup]);

  /**
   * When operating in LOCAL storage mode, listen for chrome.storage updates from other tabs so
   * this view stays in sync with cross-window edits.
   */
  useEffect(() => {
    // Only attach this listener if we are in LOCAL storage mode.
    // It's irrelevant for remote storage.
    if (storageMode !== StorageMode.LOCAL || !userId) {
      return; // Do nothing if in remote mode or not signed in.
    }

    if (isMigrating) {  // Don't run this effect while migrating storage
      console.log("Migration in progress, storage listener is paused.");
      return;
    }

    const handleStorageChange = async (changes, area) => {
      const userStorageKey = getUserStorageKey(userId);
      if (area === "local" && changes[userStorageKey]) {
        console.log("Local storage changed in another tab. Reloading bookmarks...");
        // Pass the correct storageMode to the loading function.
        const freshGroups = await loadInitialBookmarks(userId, storageMode, {
          noLocalFallback: storageMode !== StorageMode.LOCAL
        });
        setBookmarkGroups(freshGroups || []);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // The cleanup function runs when dependencies change, removing the old listener.
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [userId, storageMode, setBookmarkGroups, isMigrating]); // Re-runs if user or storageMode changes

  /**
   * Subscribe to runtime messages signaling auth changes or storage mode flips so this page can
   * react to popup-driven events without polling.
   */
  useEffect(() => {
    const onMsg = (msg) => {
      if (msg?.type === 'USER_SIGNED_IN' || msg?.type === 'USER_SIGNED_OUT') {
        if (msg?.type === 'USER_SIGNED_OUT') { 
          try { clearBookmarkCaches(); } catch {} 
        }
        handleAuthSignal(Number(msg.at) || Date.now());
      } else if (msg?.type === 'MODE_SWITCHED_TO_ANON') {
        clearAuthHash();
        handleModeAnonSignal(Number(msg.at) || Date.now());
      }
    };
    try { chrome?.runtime?.onMessage?.addListener?.(onMsg); } catch {}
    return () => { try { chrome?.runtime?.onMessage?.removeListener?.(onMsg); } catch {} };
  }, []); 

  /**
   * Mirror the runtime listener with a chrome.storage observer so persisted timestamps from other
   * contexts trigger the same auth or mode reactions here.
   */
  useEffect(() => {
    const storageEvents = chrome?.storage?.onChanged;
    if (!storageEvents?.addListener) return () => {};
    const onStorageAuth = (changes, area) => {
      if (area !== StorageMode.LOCAL) return;
      if (changes?.authSignalAt?.newValue) {
        handleAuthSignal(Number(changes.authSignalAt.newValue));
      }
      if (changes?.modeSignalAt?.newValue) {
        clearAuthHash();
        handleModeAnonSignal(Number(changes.modeSignalAt.newValue));
      }
    };
    try { storageEvents.addListener(onStorageAuth); } catch {}
    return () => { try { storageEvents.removeListener(onStorageAuth); } catch {} };
  }, []);
  /* ---------------------------------------------------------- */

  return (
    <AnalyticsProvider>
      <div className="min-h-screen bg-gray-100 dark:bg-neutral-950">
        <TopBanner
          onExportBookmarks={exportBookmarksToJSON}
          userAttributes={userAttributes}
          onSignIn={signIn || defaultSignIn}
          onSignOut={signOut || defaultSignOut}
          isSignedIn={isSignedIn /* prefer context-derived status over props */}
          onStorageModeChange={changeStorageMode}
        />
        {ready && (
          <>
            <DraggableGrid
              ref={gridRef}
              user={isSignedIn ? { sub: userId } : null} 
              bookmarkGroups={bookmarkGroups}
            />
            <EmptyBookmarksState
              onCreateGroup={() => gridRef.current?.startCreateGroup({ prefill: ONBOARDING_NEW_GROUP_PREFILL, select: 'all' })}
              onImport={handleLoadBookmarks}
            />
          </>
        )}
      </div>
    </AnalyticsProvider>
  );
}
