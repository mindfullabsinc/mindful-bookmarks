import React, { createContext, useState, useEffect, useCallback } from 'react';
import {
  fetchAuthSession,
  fetchUserAttributes,
  updateUserAttribute,
} from 'aws-amplify/auth';

/* Scripts */
import { StorageType, DEFAULT_STORAGE_TYPE } from '@/scripts/Constants.js';
import { loadInitialBookmarks } from '@/hooks/useBookmarkManager.js';

/* Caching: synchronous snapshot for first-paint + session cache for reopens */
import {
  readBookmarkCacheSync,           // localStorage (sync)
  writeBookmarkCacheSync,          // localStorage (sync)
  readBookmarkCacheSession,        // chrome.storage.session (async)
  writeBookmarkCacheSession,       // chrome.storage.session (async)
} from '@/scripts/BookmarkCache';

export const AppContext = createContext();

/** Stable sentinel used for anonymous/local mode keys & caches */
const LOCAL_USER_ID = 'local';

export function AppContextProvider({
  user,
  preferredStorageType = StorageType.LOCAL, // NEW: let caller prefer local/remote
  children
}) {
  // ----- state -----
  const [userAttributes, setUserAttributes] = useState(null);

  // Seed immediately from a synchronous snapshot (pre-user, pre-mode) to avoid flicker.
  const seed = readBookmarkCacheSync(undefined, undefined) || { data: [] };
  const [bookmarkGroups, setBookmarkGroups] = useState(seed.data || []);
  const [groupsIndex, setGroupsIndex] = useState([]); // [{ id, groupName }]
  const [hasHydrated, setHasHydrated] = useState(!!(seed.data?.length));

  const [userId, setUserId] = useState(null);
  const [storageType, setStorageType] = useState(null);

  const [isLoading, setIsLoading] = useState(true);   // only for the very first paint
  const [isMigrating, setIsMigrating] = useState(false);

  const deepEqual = (a, b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  };

  // ----- helpers: tiny / fast index -----
  async function readGroupsIndexFast() {
    // 1) try memory cache (persists while SW alive)
    try {
      const { groupsIndex } = await chrome?.storage?.session?.get?.(['groupsIndex']) ?? {};
      if (Array.isArray(groupsIndex) && groupsIndex.length) return groupsIndex;
    } catch {}

    // 2) try a small persistent key
    try {
      const { groupsIndex: persisted } = await chrome?.storage?.local?.get?.(['groupsIndex']) ?? {};
      if (Array.isArray(persisted)) {
        try { await chrome?.storage?.session?.set?.({ groupsIndex: persisted }); } catch {}
        return persisted;
      }
    } catch {}

    // 3) last-ditch: derive a tiny index from the full blob if it exists
    try {
      const { bookmarkGroups: full } = await chrome?.storage?.local?.get?.(['bookmarkGroups']) ?? {};
      if (Array.isArray(full) && full.length) {
        const idx = full.map(g => ({ id: g.id, groupName: g.groupName }));
        try { await chrome?.storage?.session?.set?.({ groupsIndex: idx }); } catch {}
        return idx;
      }
    } catch {}

    return [];
  }

  // ----- phase 0: decide mode quickly (no blocking on Amplify for LOCAL) -----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // If opened while signed out, run in LOCAL immediately.
      if (!user) {
        if (!cancelled) {
          setUserId(LOCAL_USER_ID);
          // If caller asked for remote while signed out, coerce to LOCAL.
          const effective = preferredStorageType === StorageType.REMOTE
            ? StorageType.LOCAL
            : preferredStorageType || StorageType.LOCAL;
          setStorageType(effective);
        }
        return;
      }

      // Signed-in: prefer (1) caller hint, then (2) user attribute, then (3) default.
      try {
        const { identityId } = await fetchAuthSession();
        if (!cancelled) setUserId(identityId || null);

        const attributes = await fetchUserAttributes();
        if (!cancelled) setUserAttributes(attributes);

        const storedType = attributes?.['custom:storage_type'];
        const effectiveType =
          preferredStorageType || storedType || DEFAULT_STORAGE_TYPE;

        if (!cancelled) setStorageType(effectiveType);

        // If the custom attribute wasn’t set, set a sane default asynchronously
        if (!storedType) {
          updateUserAttribute({
            userAttribute: { attributeKey: 'custom:storage_type', value: effectiveType }
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Auth bootstrap failed, falling back to LOCAL:', err);
        if (!cancelled) {
          setUserId(LOCAL_USER_ID);
          setStorageType(StorageType.LOCAL);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user, preferredStorageType]);

  // ----- phase 1a: refine first paint from *sync* cache when user/mode become known -----
  useEffect(() => {
    if (!storageType) return;
    // Always have a concrete userId: LOCAL_USER_ID when anonymous.
    const id = user ? userId : LOCAL_USER_ID;

    const cached = readBookmarkCacheSync(id, storageType);
    if (cached?.data && !deepEqual(bookmarkGroups, cached.data)) {
      setBookmarkGroups(cached.data);
      setHasHydrated(true); // we’ve shown meaningful content
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user ? userId : 'anon-key', storageType]); // treat anon as stable key

  // ----- phase 1b: render ASAP with groups index (async but cheap) -----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      try {
        const id = user ? userId : LOCAL_USER_ID;
        const cached = await readBookmarkCacheSession(id, storageType);
        if (!cancelled && cached?.data?.length) {
          setBookmarkGroups(prev => (deepEqual(prev, cached.data) ? prev : cached.data));
          setHasHydrated(true);
        }
      } catch {}

      const idx = await readGroupsIndexFast();
      if (!cancelled) {
        setGroupsIndex(idx);
        setIsLoading(false); // UI can render now
      }
    })();

    return () => { cancelled = true; };
  }, [user ? userId : 'anon-key', storageType, user]);

  // ----- phase 2: hydrate full groups in background once mode is known -----
  useEffect(() => {
    if (isMigrating) return;
    if (!storageType) return;

    // Always resolve a concrete id (LOCAL_USER_ID for anon)
    const id = user ? userId : LOCAL_USER_ID;
    if (!id) return;

    let cancelled = false;

    const kickoff = () =>
      loadInitialBookmarks(id, storageType)
        .then(full => {
          if (cancelled) return;
          setBookmarkGroups(prev => (deepEqual(prev, full) ? prev : full));

          // Persist/refresh the tiny index for quick future loads
          const idx = (full || []).map(g => ({ id: g.id, groupName: g.groupName }));
          try { chrome?.storage?.local?.set?.({ groupsIndex: idx }); } catch {}
          try { chrome?.storage?.session?.set?.({ groupsIndex: idx }); } catch {}

          // Warm both caches for instant next paint
          writeBookmarkCacheSync(id, storageType, full);
          writeBookmarkCacheSession(id, storageType, full).catch(() => {});
        })
        .finally(() => { if (!cancelled) setHasHydrated(true); });

    try {
      if ('requestIdleCallback' in window) {
        const idleId = requestIdleCallback(() => kickoff());
        return () => cancelIdleCallback(idleId);
      } else {
        const t = setTimeout(() => kickoff(), 0);
        return () => clearTimeout(t);
      }
    } catch (e) {
      console.error('Error hydrating bookmarks:', e);
      if (!cancelled) setBookmarkGroups([]);
    }

    return () => { cancelled = true; };
  }, [user ? userId : 'anon-key', storageType, isMigrating, user]);

  // ----- background reloads (don’t flip isLoading) -----
  useEffect(() => {
    if (isMigrating) return;

    const reload = async () => {
      try {
        const id = user ? userId : LOCAL_USER_ID;
        const fresh = await loadInitialBookmarks(id, storageType);
        setBookmarkGroups(prev => (deepEqual(prev, fresh) ? prev : fresh));

        const idx = (fresh || []).map(g => ({ id: g.id, groupName: g.groupName }));
        try { chrome?.storage?.local?.set?.({ groupsIndex: idx }); } catch {}
        try { chrome?.storage?.session?.set?.({ groupsIndex: idx }); } catch {}

        // Keep caches hot
        writeBookmarkCacheSync(id, storageType, fresh);
        writeBookmarkCacheSession(id, storageType, fresh).catch(() => {});
      } catch (e) {
        console.error('Reload after update failed:', e);
      }
    };

    // Runtime messages (e.g., popup saved/imported)
    const runtimeHandler = (msg) => {
      if (msg?.type === 'MINDFUL_BOOKMARKS_UPDATED') reload();
    };
    try { chrome?.runtime?.onMessage?.addListener?.(runtimeHandler); } catch {}

    // BroadcastChannel fanout
    let bc;
    try {
      bc = new BroadcastChannel('mindful');
      bc.onmessage = (e) => {
        if (e?.data?.type === 'MINDFUL_BOOKMARKS_UPDATED') reload();
      };
    } catch {}

    // Visibility regain (tab refocus) — best-effort refresh
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      try { chrome?.runtime?.onMessage?.removeListener?.(runtimeHandler); } catch {}
      try { bc?.close?.(); } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user ? userId : 'anon-key', storageType, isMigrating, user]);

  // ----- storage type changes -----
  const handleStorageTypeChange = useCallback(async (newStorageType) => {
    // If not signed in, silently coerce to LOCAL
    if (!user && newStorageType === StorageType.REMOTE) {
      setStorageType(StorageType.LOCAL);
      return;
    }

    setStorageType(newStorageType);

    // Persist preference to Cognito when signed in
    if (user) {
      updateUserAttribute({
        userAttribute: {
          attributeKey: 'custom:storage_type',
          value: newStorageType,
        },
      }).catch(err => console.error('Error updating storage type preference:', err));
    }
  }, [user]);

  // ----- render gate: only block first paint if we truly have nothing -----
  if (isLoading && !groupsIndex.length && !hasHydrated) {
    return <div>Loading…</div>;
  }

  const contextValue = {
    // for popup & new tab
    groupsIndex,
    bookmarkGroups, setBookmarkGroups,

    userId: user ? userId : LOCAL_USER_ID, // expose concrete id to consumers
    storageType,
    setStorageType: handleStorageTypeChange,

    isLoading,
    isMigrating, setIsMigrating,
    userAttributes, setUserAttributes,
    hasHydrated,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
