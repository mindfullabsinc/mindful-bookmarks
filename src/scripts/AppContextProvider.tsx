/* -------------------- Imports -------------------- */
/* Libraries */
import React from 'react';
import { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, ReactElement, Dispatch, SetStateAction } from 'react';
import {
  fetchAuthSession,
  fetchUserAttributes,
  updateUserAttribute,
} from 'aws-amplify/auth';

/* Types */
import type { BookmarkGroupType, BookmarkType } from "@/types/bookmarks";

/* Scripts */
import {
  StorageMode,
  type StorageModeType,
  DEFAULT_STORAGE_MODE,
  LOCAL_USER_ID,
} from '@/scripts/Constants';
import { loadInitialBookmarks } from '@/scripts/bookmarksData.js';

/* Caching: synchronous snapshot for first-paint + session cache for reopens */
import {
  readBookmarkCacheSync,
  writeBookmarkCacheSync,
  readBookmarkCacheSession,
  writeBookmarkCacheSession,
} from '@/scripts/BookmarkCache';
import type { BookmarkSnapshot } from '@/scripts/BookmarkCache';
/* ---------------------------------------------------------- */

/* -------------------- Local types and interfaces -------------------- */
type GroupsIndexEntry = {
  id: string;
  groupName: string;
};

type UserAttributes = Record<string, string>;

type AppContextProviderUser = {
  username?: string | null;
} | null | undefined;

export interface AppContextValue {
  groupsIndex: GroupsIndexEntry[];
  bookmarkGroups: BookmarkGroupType[];
  setBookmarkGroups: Dispatch<SetStateAction<BookmarkGroupType[]>>;
  userId: string;
  storageMode: StorageModeType | undefined;
  setStorageMode: (newStorageMode: StorageModeType) => Promise<void>;
  isSignedIn: boolean;
  isLoading: boolean;
  isMigrating: boolean;
  setIsMigrating: Dispatch<SetStateAction<boolean>>;
  userAttributes: UserAttributes | null;
  setUserAttributes: Dispatch<SetStateAction<UserAttributes | null>>;
  hasHydrated: boolean;
  isHydratingRemote: boolean;
}

type AppContextProviderProps = {
  user?: AppContextProviderUser;
  preferredStorageMode?: StorageModeType | undefined;
  children: ReactNode;
};
/* ---------------------------------------------------------- */

export const AppContext = createContext<AppContextValue>({} as AppContextValue);

/**
 * Root context provider wiring bookmark data, auth state, and storage preferences so
 * popup and new tab surfaces share a single source of truth.
 *
 * @param props Object holding the current user, preferred storage override, and rendered children.
 * @param props.user Optional authenticated Amplify user passed from the caller.
 * @param props.preferredStorageMode Optional storage mode hint from the caller.
 * @param props.children React subtree that consumes the context.
 * @returns React provider that exposes bookmark and auth state to descendants.
 */
export function AppContextProvider({
  user,
  preferredStorageMode,
  children,
}: AppContextProviderProps): ReactElement {
  /* -------------------- Context / state --------------------*/
  const [userAttributes, setUserAttributes] = useState<UserAttributes | null>(null);

  // Seed immediately from a synchronous snapshot (pre-user, pre-mode) to avoid flicker.
  const seed = readBookmarkCacheSync(undefined, undefined) as BookmarkSnapshot | null;
  const initialGroups = Array.isArray(seed?.data) ? (seed?.data as BookmarkGroupType[]) : [];
  const [bookmarkGroups, setBookmarkGroups] = useState<BookmarkGroupType[]>(initialGroups);
  const [groupsIndex, setGroupsIndex] = useState<GroupsIndexEntry[]>([]); // [{ id, groupName }]
  const [hasHydrated, setHasHydrated] = useState<boolean>(initialGroups.length > 0);
  const [isHydratingRemote, setIsHydratingRemote] = useState<boolean>(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageModeType | undefined>(undefined); 

  const [isLoading, setIsLoading] = useState<boolean>(true); // only for the very first paint
  const [isMigrating, setIsMigrating] = useState<boolean>(false);

  const resolvedUserId = userId ?? LOCAL_USER_ID;
  const isSignedIn =
    !!userId && userId !== LOCAL_USER_ID && storageMode === StorageMode.REMOTE;
  const authKey = isSignedIn ? resolvedUserId : 'anon-key';
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  /**
   * Compare two values using JSON serialization, falling back to false if either value cannot be
   * stringified (e.g., due to circular references).
   *
   * @param a First value to compare.
   * @param b Second value to compare.
   * @returns True when the two inputs serialize to the same JSON representation.
   */
  const deepEqual = (a: unknown, b: unknown): boolean => {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  };

  /**
   * Resolve a lightweight groups index by probing session and local caches before falling back to
   * deriving it from the full LOCAL storage payload.
   *
   * @param currentStorageMode Storage mode currently active for the user.
   * @returns Promise resolving to the smallest cached representation of the groups index.
   */
  async function readGroupsIndexFast(currentStorageMode?: StorageModeType): Promise<GroupsIndexEntry[]> {
    // 1) try memory cache (persists while SW alive)
    try {
      const sessionPayload =
        (await chrome?.storage?.session?.get?.(['groupsIndex'])) ?? {};
      const groupsIndex = (sessionPayload as { groupsIndex?: unknown }).groupsIndex;
      if (Array.isArray(groupsIndex) && groupsIndex.length) {
        return groupsIndex as GroupsIndexEntry[];
      }
    } catch {}

    // 2) try a small persistent key
    try {
      const persistedPayload =
        (await chrome?.storage?.local?.get?.(['groupsIndex'])) ?? {};
      const persisted = (persistedPayload as { groupsIndex?: unknown }).groupsIndex;
      if (Array.isArray(persisted)) {
        try {
          await chrome?.storage?.session?.set?.({ groupsIndex: persisted });
        } catch {}
        return persisted as GroupsIndexEntry[];
      }
    } catch {}

    // 3) last-ditch: derive a tiny index from the full LOCAL blob (LOCAL ONLY)
    if (currentStorageMode === StorageMode.LOCAL) {
      try {
        const localPayload =
          (await chrome?.storage?.local?.get?.(['bookmarkGroups'])) ?? {};
        const full = (localPayload as { bookmarkGroups?: unknown }).bookmarkGroups;
        if (Array.isArray(full) && full.length) {
          const idx = (full as BookmarkGroupType[]).map((g) => ({
            id: g.id as string,
            groupName: g.groupName as string,
          })) as GroupsIndexEntry[];
          try {
            await chrome?.storage?.session?.set?.({ groupsIndex: idx });
          } catch {}
          return idx;
        }
      } catch {}
    }

    return [];
  }

  /**
   * Persist small index + warm caches only when data is non-empty.
   * Keeps the last good cache from being overwritten by [] on transient errors.
   */
  function persistCachesIfNonEmpty(
    id: string,
    storageMode: StorageModeType | undefined,
    groups: BookmarkGroupType[] | undefined | null
  ) { // NEW
    if (!Array.isArray(groups) || groups.length === 0) return;
    const idx = groups.map((g) => ({ id: String(g.id), groupName: String(g.groupName) }));
    try { chrome?.storage?.local?.set?.({ groupsIndex: idx }); } catch {}
    try { chrome?.storage?.session?.set?.({ groupsIndex: idx }); } catch {}
    try { writeBookmarkCacheSync(id, storageMode, groups); } catch {}
    try { void writeBookmarkCacheSession(id, storageMode, groups); } catch {}
  }

  /**
   * Load bookmarks for a given userId/mode, never falling back to LOCAL when remote,
   * then apply state and caches. Returns the loaded array (possibly []).
   */
  async function loadAndCache(
    userIdArg: string | null,
    idForCache: string,
    storageMode: StorageModeType | undefined,
    setBookmarkGroups: Dispatch<SetStateAction<BookmarkGroupType[]>>,
    deepEqualFn: (a: unknown, b: unknown) => boolean
  ): Promise<BookmarkGroupType[]> { // NEW
    const fullRaw = await loadInitialBookmarks(userIdArg, storageMode, {
      noLocalFallback: storageMode !== StorageMode.LOCAL,
    });
    const full = Array.isArray(fullRaw) ? (fullRaw as BookmarkGroupType[]) : [];
    setBookmarkGroups((prev) => (deepEqualFn(prev, full) ? prev : full));
    persistCachesIfNonEmpty(idForCache, storageMode, full);
    return full;
  }

   // ----- storage type changes -----
  /**
   * Update storage mode, coercing anonymous users to LOCAL and persisting preferences back to Cognito
   * when the user is authenticated.
   *
   * @param newStorageMode Target storage mode selected by the user.
   * @returns Promise that resolves once the preference has been processed.
   */
  const handleStorageModeChange = useCallback(
    async (newStorageMode: StorageModeType): Promise<void> => {
      // If not signed in, silently coerce to LOCAL
      if (!user && newStorageMode === StorageMode.REMOTE) {
        setStorageMode(StorageMode.LOCAL as StorageModeType);
        return;
      }

      setStorageMode(newStorageMode);

      // Persist preference to Cognito when signed in
      if (user) {
        updateUserAttribute({
          userAttribute: {
            attributeKey: 'custom:storage_type',
            value: newStorageMode,
          },
        }).catch((err) =>
          console.error('Error updating storage type preference:', err),
        );
      }
    },
    [user],
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Log when the storage mode stabilises so we can correlate downstream effects in devtools.
   */
  useEffect(() => {
    if (storageMode) {
      console.debug('[AppContext] ready:', { userId, storageMode });
    }
  }, [userId, storageMode]);

  /**
   * Phase 0 bootstrap: resolve the initial storage mode as fast as possible by checking
   * for explicit anon overrides, silent Amplify sessions, or falling back to LOCAL.
   */
  useEffect(() => {
    let cancelled = false;
    console.log('[AppContext] phase0 start: user?', !!user);

    (async () => {
      // If user explicitly chose anon mode in the popup, force LOCAL immediately.
      try {
        const localPayload =
          (await chrome?.storage?.local?.get?.('mindful_auth_mode')) ?? {};
        const mindfulAuthMode = (localPayload as { mindful_auth_mode?: unknown })
          .mindful_auth_mode;
        if (mindfulAuthMode === 'anon') {
          if (!cancelled) {
            setUserId(LOCAL_USER_ID);
            setStorageMode(StorageMode.LOCAL as StorageModeType);
            console.log('[AppContext] forced LOCAL due to anon mode');
          }
          return; // short-circuit phase 0
        }
      } catch {}

      // If no user prop, we might still have an existing session (silent sign-in).
      if (!user) {
        try {
          const session = await fetchAuthSession().catch(() => null);
          // Note: v6 returns an object; treat presence of tokens/userSub/identityId as "has session"
          const hasSession = !!(
            session?.tokens ||
            (session as { userSub?: unknown })?.userSub ||
            (session as { identityId?: unknown })?.identityId
          );
          if (hasSession) {
            const attributes = await fetchUserAttributes().catch(() => ({}));
            const sub = (attributes as Record<string, string | undefined>)?.sub;
            const derivedUserId =
              sub ||
              (attributes as Record<string, string | undefined>)?.['sub'] ||
              (session as { identityId?: string | null })?.identityId ||
              null;
            if (!cancelled) {
              setUserId(derivedUserId);
              setUserAttributes(attributes as UserAttributes);
              const storedType = (attributes as Record<string, string | undefined>)?.[
                'custom:storage_type'
              ] as StorageModeType | undefined;
              const effectiveType =
                preferredStorageMode || storedType || DEFAULT_STORAGE_MODE;
              setStorageMode(effectiveType as StorageModeType);
              // If we’re going REMOTE, do NOT show any seed/local cache while we fetch remote
              if (effectiveType === StorageMode.REMOTE) {
                setIsHydratingRemote(true);
                setBookmarkGroups([]);
                setHasHydrated(false);
              }
              console.log('[AppContext] ready (SILENT AUTH):', {
                userId: derivedUserId,
                storageMode: effectiveType,
              });
              if (!storedType && effectiveType) {
                updateUserAttribute({
                  userAttribute: {
                    attributeKey: 'custom:storage_type',
                    value: effectiveType,
                  },
                }).catch(() => {});
              }
            }
            return; // handled as signed-in
          }
        } catch {}

        // Truly signed out → LOCAL immediately.
        if (!cancelled) {
          setUserId(LOCAL_USER_ID);
          const effective =
            preferredStorageMode === StorageMode.REMOTE
              ? (StorageMode.LOCAL as StorageModeType)
              : (preferredStorageMode || StorageMode.LOCAL);
          setStorageMode(effective as StorageModeType);
          console.log('[AppContext] ready (UNAUTH):', {
            userId: LOCAL_USER_ID,
            storageMode: effective,
          });
        }
        return;
      }

      // Signed-in: prefer (1) caller hint, then (2) user attribute, then (3) default.
      try {
        const session = (await fetchAuthSession().catch(() => ({}))) as {
          identityId?: string | null;
        };
        const attributes = (await fetchUserAttributes().catch(() => ({}))) as UserAttributes;
        console.log('Signed in user attributes: ', attributes);

        // Robust user id derivation for remote data keys
        const sub = attributes?.sub ?? attributes?.['sub'];
        const identityId = session?.identityId; // only when Identity Pool is configured
        const derivedUserId = sub || identityId || user?.username || null;

        if (!cancelled) {
          setUserId(derivedUserId);
          setUserAttributes(attributes);
        }

        const storedType = attributes?.['custom:storage_type'] as
          | StorageModeType
          | undefined;
        console.log('User provided storage type: ', storedType);
        const effectiveType =
          preferredStorageMode || storedType || DEFAULT_STORAGE_MODE;
        console.log('effectiveType: ', effectiveType);

        if (!cancelled) setStorageMode(effectiveType as StorageModeType);
        if (!cancelled && effectiveType === StorageMode.REMOTE) {
          setIsHydratingRemote(true);
          setBookmarkGroups([]); // guard against any leftover seed
          setHasHydrated(false);
        }

        // If the custom attribute wasn’t set, set a sane default asynchronously
        if (!storedType) {
          updateUserAttribute({
            userAttribute: {
              attributeKey: 'custom:storage_type',
              value: effectiveType,
            },
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Auth bootstrap failed, falling back to LOCAL:', err);
        if (!cancelled) {
          setUserId('local');
          setStorageMode(StorageMode.LOCAL as StorageModeType);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, preferredStorageMode]);

  /**
   * Phase 1a: once storage mode is known (and we're not gating on remote), synchronously
   * hydrate bookmarks from localStorage to avoid first-paint flicker.
   */
  useEffect(() => {
    if (!storageMode) return;
    if (storageMode === StorageMode.REMOTE && isHydratingRemote) return; // don't seed while remote gating

    // Always have a concrete userId: LOCAL_USER_ID when anonymous.
    const id = isSignedIn ? resolvedUserId : LOCAL_USER_ID;
    console.log('user id: ', id);

    const cached = readBookmarkCacheSync(id, storageMode) as BookmarkSnapshot | null;
    console.log('cached bookmarks in phase 1a: ', cached);
    if (
      cached?.data &&
      Array.isArray(cached.data) &&
      !deepEqual(bookmarkGroups, cached.data)
    ) {
      setBookmarkGroups(cached.data as BookmarkGroupType[]);
      setHasHydrated(true); // we’ve shown meaningful content
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey, storageMode]); // treat anon as stable key

  /**
   * Phase 1b: asynchronously read the session cache plus groups index so UI elements can render
   * meaningful data while the full remote hydration runs in the background.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      if (storageMode === StorageMode.REMOTE && isHydratingRemote) {
        // Don't paint from caches while we’re gating for remote
        setIsLoading(false);
        return;
      }

      try {
        const id = isSignedIn ? resolvedUserId : LOCAL_USER_ID;
        const cached = (await readBookmarkCacheSession(
          id,
          storageMode,
        )) as BookmarkSnapshot | null;
        if (!cancelled && cached?.data && Array.isArray(cached.data) && cached.data.length) {
          setBookmarkGroups((prev) =>
            deepEqual(prev, cached.data) ? prev : (cached.data as BookmarkGroupType[]),
          );
          setHasHydrated(true);
        }
      } catch {}

      const idx = await readGroupsIndexFast(storageMode);
      if (!cancelled) {
        setGroupsIndex(idx);
        setIsLoading(false); // UI can render now
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authKey, storageMode, user]);

  /**
   * Phase 2: load the authoritative bookmark list (remote or local) during idle time, update caches,
   * and clear the remote hydration gate when complete.
   */
  useEffect(() => {
    if (isMigrating) return;
    if (!storageMode) return;

    // Always resolve a concrete id (LOCAL_USER_ID for anon)
    const id = isSignedIn ? resolvedUserId : LOCAL_USER_ID;
    if (!id) return;

    let cancelled = false;

    const kickoff = () => 
      loadAndCache(userId, id, storageMode, setBookmarkGroups, deepEqual)
        .then(() => {
          if (cancelled) return;
          // Persist/refresh the tiny index for quick future loads
          // (handled inside loadAndCache via persistCachesIfNonEmpty)
        })
        .finally(() => {
          if (cancelled) return;
          setHasHydrated(true);
          if (storageMode === StorageMode.REMOTE) setIsHydratingRemote(false);
        }); 

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
      if (!cancelled && storageMode === StorageMode.REMOTE) setIsHydratingRemote(false);
    }

    return () => {
      cancelled = true;
    };
  }, [authKey, storageMode, isMigrating, user, isHydratingRemote]);

  /**
   * Listen for cross-view "bookmarks updated" signals and visibility changes so the context
   * can refresh data without blocking the primary loading indicator.
   */
  useEffect(() => {
    if (isMigrating) return;

    const reload = async () => {
      try {
        const id = isSignedIn ? resolvedUserId : LOCAL_USER_ID;
        await loadAndCache(userId, id, storageMode, setBookmarkGroups, deepEqual); 
      } catch (e) {
        console.error('Reload after update failed:', e);
      }
    };

    // Runtime messages (e.g., popup saved/imported)
    const runtimeHandler = (msg: { type?: string }) => {
      if (msg?.type === 'MINDFUL_BOOKMARKS_UPDATED') reload();
    };
    try {
      chrome?.runtime?.onMessage?.addListener?.(runtimeHandler);
    } catch {}

    // BroadcastChannel fanout
    let bc: BroadcastChannel | undefined;
    try {
      bc = new BroadcastChannel('mindful');
      bc.onmessage = (e) => {
        if (e?.data?.type === 'MINDFUL_BOOKMARKS_UPDATED') reload();
      };
    } catch {}

    // Visibility regain (tab refocus) — best-effort refresh
    const onVis = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      try {
        chrome?.runtime?.onMessage?.removeListener?.(runtimeHandler);
      } catch {}
      try {
        bc?.close?.();
      } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authKey, storageMode, isMigrating, user]);
  /* ---------------------------------------------------------- */

  // ----- render gate: only block first paint if we truly have nothing -----
  if (isLoading && !groupsIndex.length && !hasHydrated) {
    return <div>Loading…</div>;
  }

  const contextValue: AppContextValue = {
    // for popup & new tab
    groupsIndex,
    bookmarkGroups,
    setBookmarkGroups,
    userId: userId ?? LOCAL_USER_ID, // Always expose the actual resolved userId (LOCAL_USER_ID when anon)
    storageMode,
    setStorageMode: handleStorageModeChange,
    isSignedIn,
    isLoading,
    isMigrating,
    setIsMigrating,
    userAttributes,
    setUserAttributes,
    hasHydrated,
    isHydratingRemote,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
