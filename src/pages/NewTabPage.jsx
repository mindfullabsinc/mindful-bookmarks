import React, { useContext, useEffect, useRef } from "react";

// Import Amplify and the Authenticator UI component
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';

// Import Amplify configuration and configure Amplify
import config from '/amplify_outputs.json';
Amplify.configure(config);

/* CSS styles */
import "@/styles/Login.css";

/* Constants */
import { 
  EMPTY_GROUP_IDENTIFIER, 
  ONBOARDING_NEW_GROUP_PREFILL, 
  StorageType 
} from "@/scripts/Constants"; 

/* Hooks and Utilities */
import { getUserStorageKey } from '@/scripts/Utilities';
import { loadInitialBookmarks, useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from "@/scripts/AppContextProvider";

/* Components */
import TopBanner from "@/components/TopBanner";
import DraggableGrid from '@/components/DraggableGrid';
import EmptyBookmarksState from '@/components/EmptyBookmarksState';

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";


export function NewTabPage({ user, signIn, signOut }) {
  // Consume state from the context
  const {  
    bookmarkGroups, 
    setBookmarkGroups, 
    userId, 
    storageType, 
    isMigrating,
    userAttributes
  } = useContext(AppContext);

  const gridRef = useRef(null);

  // --- De-dupe bursts from message + storage ---
  const lastAuthSignalAtRef = useRef(0);
  const handleAuthSignal = (at = Date.now()) => {
    if (at <= lastAuthSignalAtRef.current) return; // ignore duplicates
    lastAuthSignalAtRef.current = at;
    // Easiest & safest: full reload so all providers/hooks re-init with the new session
    window.location.reload();
    // If you prefer a soft refresh, swap the line above for:
    // - re-check auth + re-run your initial data loads
    // - e.g., await getCurrentUser(); reloadBookmarks(); etc.
  };

  // Get all actions from the custom bookmarks hook
  const {
    addEmptyBookmarkGroup,
    exportBookmarksToJSON,
    importBookmarksFromJSON,
    changeStorageType,
  } = useBookmarkManager();

  // Create a new handler function that calls the importBookmarksFromJSON with no arguments
  const handleLoadBookmarks = () => {
    importBookmarksFromJSON();
  };

  // Effect to ensure an empty group for adding new bookmarks always exists.
  const { hasHydrated } = useContext(AppContext);
  useEffect(() => {
    // Avoid adding an empty group before we know if cache / real data exist
    if (!hasHydrated) return;
    if (!bookmarkGroups) return;
    if (bookmarkGroups.length === 0) {
      addEmptyBookmarkGroup();
      return;
    }
    const hasEmpty = bookmarkGroups.some(g => g.groupName === EMPTY_GROUP_IDENTIFIER);
    if (!hasEmpty) addEmptyBookmarkGroup();
  }, [hasHydrated, bookmarkGroups, addEmptyBookmarkGroup]);

  // Listen for LOCAL storage changes to sync bookmarks across tabs (existing logic)
  useEffect(() => {
    // Only attach this listener if we are in LOCAL storage mode.
    // It's irrelevant for remote storage.
    if (storageType !== StorageType.LOCAL || !userId) {
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
        // Pass the correct storageType to the loading function.
        const freshGroups = await loadInitialBookmarks(userId, storageType);
        setBookmarkGroups(freshGroups || []);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // The cleanup function runs when dependencies change, removing the old listener.
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [userId, storageType, setBookmarkGroups, isMigrating]); // Re-runs if user or storageType changes

  // --- Listen for popup auth broadcasts (runtime messages) ---
  useEffect(() => {
    const onMsg = (msg) => {
      if (msg?.type === 'USER_SIGNED_IN' || msg?.type === 'USER_SIGNED_OUT') {
        handleAuthSignal(Number(msg.at) || Date.now());
      }
    };
    try { chrome?.runtime?.onMessage?.addListener?.(onMsg); } catch {}
    return () => { try { chrome?.runtime?.onMessage?.removeListener?.(onMsg); } catch {} };
  }, []); 

  // --- Also watch storage for 'authSignalAt' (works even if listener missed runtime msg) ---
  useEffect(() => {
    const storageEvents = chrome?.storage?.onChanged;
    if (!storageEvents?.addListener) return () => {};
    const onStorageAuth = (changes, area) => {
      if (area !== StorageType.LOCAL) return;
      if (changes?.authSignalAt?.newValue) {
        handleAuthSignal(Number(changes.authSignalAt.newValue));
      }
    };
    try { storageEvents.addListener(onStorageAuth); } catch {}
    return () => { try { storageEvents.removeListener(onStorageAuth); } catch {} };
  }, []);

  /* ------------------- Derive isSignedIn + safe fallbacks ------------------- */
  // Treat StorageType.LOCAL sentinel (from AppContextProvider) as anonymous.
  const isSignedIn = !!userId && userId !== StorageType.LOCAL;

  // If caller doesn’t provide a signIn handler, use a safe default that
  // navigates to the in-app auth view on New Tab (hash route).
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

  // If caller doesn’t provide a signOut handler, no-op (or soft reload pattern).
  const defaultSignOut = () => {
    // Intentionally blank – the higher-level page should replace this when Amplify is present.
    // Can also choose to postMessage to a top-level auth orchestrator if we have one.
  };
  /* ------------------------------------------------------------------------------ */

  return (
    <AnalyticsProvider>
      <div className="min-h-screen bg-gray-100 dark:bg-neutral-950">
        <TopBanner
          onExportBookmarks={exportBookmarksToJSON}
          userAttributes={userAttributes}
          onSignIn={signIn || defaultSignIn}
          onSignOut={signOut || defaultSignOut}
          isSignedIn={isSignedIn /* prefer context-derived status over props */}
          onStorageTypeChange={changeStorageType}
        />
        <DraggableGrid
          ref={gridRef}
          user={isSignedIn ? (user || { sub: userId }) : null /* optional: keep prop shape */}
          bookmarkGroups={bookmarkGroups}
        />
        <EmptyBookmarksState
          onCreateGroup={() => gridRef.current?.startCreateGroup({ prefill: ONBOARDING_NEW_GROUP_PREFILL, select: 'all' })}
          onImport={handleLoadBookmarks}
        />
      </div>
    </AnalyticsProvider>
  );
}
