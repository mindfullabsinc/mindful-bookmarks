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
import type { BookmarkGroupType } from "@/core/types/bookmarks";

/* Scripts */
import {
  LOCAL_USER_ID,
} from '@/core/constants/authMode';
import { 
  StorageMode,
  type StorageModeType,
  DEFAULT_STORAGE_MODE,
} from "@/core/constants/storageMode";
import { loadInitialBookmarks } from '@/scripts/bookmarksData';
import { getAdapter } from "@/scripts/storageAdapters";

/* Caching: synchronous snapshot for first-paint + session cache for reopens */
import {
  readBookmarkCacheSync,
  writeBookmarkCacheSync,
  readBookmarkCacheSession,
  writeBookmarkCacheSession,
} from '@/scripts/caching/BookmarkCache';
import type { BookmarkSnapshot } from '@/scripts/caching/BookmarkCache';
import {
  readFpGroupsLocalSync,
} from '@/scripts/caching/BookmarkCacheLocalFirstPaint';

import {
  Workspace, WorkspaceId,
  DEFAULT_LOCAL_WORKSPACE_ID,
  WORKSPACES_KEY, ACTIVE_WORKSPACE_KEY,
  makeDefaultLocalWorkspace,
} from '@/core/constants/workspaces';
/* ---------------------------------------------------------- */

/* -------------------- Class-level helpers -------------------- */
// Workspace-scoped small index keys 
const sessionGroupsIndexKey = (wid: WorkspaceId) => `groupsIndex:${wid}`;
const localGroupsIndexKey   = (wid: WorkspaceId) => `groupsIndex:${wid}`;
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
  /* Workspaces */
  workspaces: Record<WorkspaceId, Workspace>;
  activeWorkspaceId: WorkspaceId;
  setActiveWorkspaceId: (id: WorkspaceId) => void; // no-op in LOCAL for now

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

  // Workspaces
  const [workspaces, setWorkspaces] = useState<Record<WorkspaceId, Workspace>>({});
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<WorkspaceId>(DEFAULT_LOCAL_WORKSPACE_ID);

  // PR-1 Local-only: use WS-scoped first-paint LOCAL snapshot to avoid touching any remote cache.
  // Seed immediately from LOCAL WS-scoped first-paint snapshot to avoid touching generic/remote caches.
  const seedLocal = readFpGroupsLocalSync(DEFAULT_LOCAL_WORKSPACE_ID);
  const initialGroups = Array.isArray(seedLocal) ? seedLocal : [];

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
   * Update the currently active workspace. Local mode only supports the default workspace,
   * so any other id is ignored.
   *
   * @param id Workspace identifier requested by the caller.
   * @returns void
   */
  const setActiveWorkspaceId = (id: WorkspaceId): void => {
    // PR-1: in local mode there is only one; silently enforce it.
    if (id !== DEFAULT_LOCAL_WORKSPACE_ID) return;
    _setActiveWorkspaceId(id);
    try { (globalThis as any).chrome?.storage?.local?.set?.({ [ACTIVE_WORKSPACE_KEY]: id }); } catch {}
  };

  /**
   * Resolve a lightweight groups index by probing session and local caches before falling back to
   * deriving it from the full LOCAL storage payload.
   *
   * @param currentStorageMode Storage mode currently active for the user.
   * @param workspaceId Active workspace for namespacing cache keys.
   * @returns Promise resolving to the smallest cached representation of the groups index.
   */
  async function readGroupsIndexFast(
    currentStorageMode?: StorageModeType,
    workspaceId: WorkspaceId = DEFAULT_LOCAL_WORKSPACE_ID
  ): Promise<GroupsIndexEntry[]> {
    // 1) try memory cache (persists while SW alive) – namespaced only
    try {
      const sessionKey = sessionGroupsIndexKey(workspaceId);
      const sessionPayload =
        (await chrome?.storage?.session?.get?.([sessionKey])) ?? {};
      const groupsIndex = (sessionPayload as Record<string, unknown>)[sessionKey];

      if (Array.isArray(groupsIndex) && groupsIndex.length) {
        return groupsIndex as GroupsIndexEntry[];
      }
    } catch {}

    // 2) try a small persistent key – namespaced only 
    try {
      const localKey = localGroupsIndexKey(workspaceId);
      const persistedPayload =
        (await chrome?.storage?.local?.get?.([localKey])) ?? {};
      const persisted = (persistedPayload as Record<string, unknown>)[localKey];
      if (Array.isArray(persisted)) {
        try { await chrome?.storage?.session?.set?.({ [sessionGroupsIndexKey(workspaceId)]: persisted }); } catch {}
        return persisted as GroupsIndexEntry[];
      }
    } catch {}

    return [];
  } 

  /**
   * Persist small index + warm caches only when data is non-empty.
   * Keeps the last good cache from being overwritten by [] on transient errors.
   *
   * @param workspaceId Workspace whose caches should be refreshed.
   * @param groups Bookmark collection to persist when available.
   * @returns void
   */
  async function persistCachesIfNonEmpty(
    workspaceId: WorkspaceId,
    groups: BookmarkGroupType[] | undefined | null,
    currentStorageMode?: StorageModeType
  ) { 
    if (!Array.isArray(groups) || groups.length === 0) return;

    const idx = groups.map((g) => ({ id: String(g.id), groupName: String(g.groupName) }));

    const adapter = getAdapter(currentStorageMode);
    if (adapter) {
      try { await adapter.persistCachesIfNonEmpty(workspaceId, groups); } catch {}
      return;
    } 
    
    // Remote/other future modes can keep using the generic path.
    try { chrome?.storage?.local?.set?.({ [localGroupsIndexKey(workspaceId)]: idx }); } catch {}
    try { chrome?.storage?.session?.set?.({ [sessionGroupsIndexKey(workspaceId)]: idx }); } catch {}
    const snap: BookmarkSnapshot = { data: groups, at: Date.now() };
    const payload = { idx, snap };
    try { writeBookmarkCacheSync(payload, workspaceId); } catch {}
    try { void writeBookmarkCacheSession(payload, workspaceId); } catch {}
  }

  /**
   * Load bookmarks for a given userId/mode, never falling back to LOCAL when remote,
   * then apply state and caches. Returns the loaded array (possibly []).
   *
   * @param userIdArg Raw user identifier used when requesting bookmarks.
   * @param idForCache Resolved user identifier used for cache keying.
   * @param storageMode Storage mode that should be queried.
   * @param workspaceId Workspace namespace applied to caches.
   * @param setBookmarkGroups React state setter for bookmark groups.
   * @param deepEqualFn Equality comparator to avoid unnecessary state churn.
   * @returns Promise resolving to the freshly loaded bookmark list.
   */
  async function loadAndCache(
    userIdArg: string | null,
    idForCache: string,
    storageMode: StorageModeType | undefined,
    workspaceId: WorkspaceId, // NEW
    setBookmarkGroups: Dispatch<SetStateAction<BookmarkGroupType[]>>,
    deepEqualFn: (a: unknown, b: unknown) => boolean
  ): Promise<BookmarkGroupType[]> {
    const fullRaw = await loadInitialBookmarks(userIdArg, storageMode, {
      noLocalFallback: storageMode !== StorageMode.LOCAL,
    });
    const full = Array.isArray(fullRaw) ? (fullRaw as BookmarkGroupType[]) : [];
    setBookmarkGroups((prev) => (deepEqualFn(prev, full) ? prev : full));
    persistCachesIfNonEmpty(workspaceId, full, storageMode);
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
  // PR-1: local-only → always one workspace. We still persist to allow future upgrades.
  useEffect(() => {
    (async () => {
      try {
        const ls = (globalThis as any).chrome?.storage?.local;
        // 1) load existing workspaces
        const wsData = (await ls?.get?.(WORKSPACES_KEY))?.[WORKSPACES_KEY];
        let wsMap: Record<WorkspaceId, Workspace>;

        if (!wsData || typeof wsData !== 'object') {
          const def = makeDefaultLocalWorkspace();
          wsMap = { [def.id]: def };
          await ls?.set?.({ [WORKSPACES_KEY]: wsMap });
        } else {
          wsMap = wsData;
        }

        setWorkspaces(wsMap);

        // 2) active workspace
        const active = (await ls?.get?.(ACTIVE_WORKSPACE_KEY))?.[ACTIVE_WORKSPACE_KEY] as WorkspaceId | undefined;
        const id = (active && wsMap[active]) ? active : DEFAULT_LOCAL_WORKSPACE_ID;

        if (!active || active !== id) {
          await ls?.set?.({ [ACTIVE_WORKSPACE_KEY]: id });
        }
        _setActiveWorkspaceId(id);
      } catch {}
    })();
  }, []);

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

    const storageAdapter = getAdapter(storageMode);
    if (storageAdapter) {
      const seed = storageAdapter.readPhase1aSnapshot(activeWorkspaceId);
      console.log('cached (LOCAL fp via storageAdapter) in phase 1a: ', seed);
      if (Array.isArray(seed) && seed.length && !deepEqual(bookmarkGroups, seed)) {
        setBookmarkGroups(seed);
        setHasHydrated(true);
      }
    } else { 
      // Future/REMOTE path (kept for completeness)
      const cached = readBookmarkCacheSync(activeWorkspaceId) as BookmarkSnapshot | null;
      console.log('cached (REMOTE) bookmarks in phase 1a: ', cached);
      if (cached?.data && Array.isArray(cached.data) && !deepEqual(bookmarkGroups, cached.data)) {
        setBookmarkGroups(cached.data as BookmarkGroupType[]);
        setHasHydrated(true);
      }
    }
  }, [authKey, storageMode]); // treat anon as stable key

  /**
   * Phase 1b: asynchronously read the session cache plus groups index so UI elements can render
   * meaningful data while the full remote hydration runs in the background.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      // PR-1: don’t touch any cache path until storageMode is resolved.
      if (!storageMode) {
        setIsLoading(false);
        return;
      }

      if (storageMode === StorageMode.REMOTE && isHydratingRemote) {
        // Don't paint from caches while we’re gating for remote
        setIsLoading(false);
        return;
      }

      try {
        const id = isSignedIn ? resolvedUserId : LOCAL_USER_ID;
        console.log("storageMode: ", storageMode);
        const storageAdapter = getAdapter(storageMode);
        if (storageAdapter) {
          const cached = await storageAdapter.readPhase1bSessionSnapshot(activeWorkspaceId);
          if (!cancelled && cached?.data && Array.isArray(cached.data) && cached.data.length) {
            setBookmarkGroups((prev) => (deepEqual(prev, cached.data) ? prev : (cached.data as BookmarkGroupType[])));
            setHasHydrated(true);
          }
        } else {
          // Future/REMOTE path: keep existing session cache read
          console.log("Calling readBookmarkCacheSession in remote path");
          const cached = (await readBookmarkCacheSession(activeWorkspaceId)) as BookmarkSnapshot | null;
          if (!cancelled && cached?.data && Array.isArray(cached.data) && cached.data.length) {
            setBookmarkGroups((prev) =>
              deepEqual(prev, cached.data) ? prev : (cached.data as BookmarkGroupType[]),
            );
            setHasHydrated(true);
          }
        }
      } catch {}

      // Index: WS-local first-paint for LOCAL; existing fast path otherwise
      const adapterForIndex = getAdapter(storageMode);
      const idx = adapterForIndex
        ? await adapterForIndex.readGroupsIndexFast(activeWorkspaceId)
        : await readGroupsIndexFast(storageMode, activeWorkspaceId); 

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
      loadAndCache(userId, id, storageMode, activeWorkspaceId, setBookmarkGroups, deepEqual)
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
        await loadAndCache(userId, id, storageMode, activeWorkspaceId, setBookmarkGroups, deepEqual);
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
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,

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
