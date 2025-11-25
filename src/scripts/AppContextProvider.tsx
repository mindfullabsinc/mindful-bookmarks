/* -------------------- Imports -------------------- */
/* Libraries */
import React, { act } from 'react';
import { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, ReactElement, Dispatch, SetStateAction } from 'react';
import {
  fetchAuthSession,
  fetchUserAttributes,
  updateUserAttribute,
} from 'aws-amplify/auth';

/* Types */
import type { BookmarkGroupType } from "@/core/types/bookmarks";

/* Constants */
import { ThemeChoice, THEME_STORAGE_KEY } from "@/core/constants/theme";

/* Scripts */
import {
  AuthMode,
  type AuthModeType,
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
  writeGroupsIndexSession,           
  clearSessionGroupsIndexExcept,     
} from '@/scripts/caching/bookmarkCache';
import type { BookmarkSnapshot } from '@/scripts/caching/bookmarkCache';

/* Workspaces */
import { WorkspaceType, WorkspaceIdType } from '@/core/constants/workspaces';
import { 
  loadRegistry, 
  initializeLocalWorkspaceRegistry, 
  setActiveWorkspace, 
} from "@/workspaces/registry";

/* Onboarding */
import { ONBOARDING_STORAGE_KEY } from '@/core/constants/onboarding';

/* Themes */
import { applyTheme, loadInitialTheme } from "@/hooks/applyTheme";
/* ---------------------------------------------------------- */

/* -------------------- Class-level helpers -------------------- */
/**
 * Derive the chrome.sessionStorage key for the groups index cache bound to a workspace.
 *
 * @param wid Workspace identifier used to namespace the session cache entry.
 * @returns Fully qualified session key for the workspace groups index.
 */
const sessionGroupsIndexKey = (wid: WorkspaceIdType) => `groupsIndex:${wid}`;
/**
 * Derive the chrome.local storage key for the groups index cache bound to a workspace.
 *
 * @param wid Workspace identifier used to namespace the persistent cache entry.
 * @returns Fully qualified local storage key for the workspace groups index.
 */
const localGroupsIndexKey   = (wid: WorkspaceIdType) => `groupsIndex:${wid}`;

// Ensure the workspace registry exists and legacy data is migrated (runs once)
const registryReady: Promise<void> = initializeLocalWorkspaceRegistry();
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
  workspaces: Record<WorkspaceIdType, WorkspaceType>;
  activeWorkspaceId: WorkspaceIdType | null;  // allow null during boot
  setActiveWorkspaceId: (id: WorkspaceIdType) => void; 

  groupsIndex: GroupsIndexEntry[];
  bookmarkGroups: BookmarkGroupType[];
  setBookmarkGroups: Dispatch<SetStateAction<BookmarkGroupType[]>>;
  userId: string;
  storageMode: StorageModeType | undefined;
  setStorageMode: (newStorageMode: StorageModeType) => Promise<void>;
  isSignedIn: boolean;
  authMode: AuthModeType;
  isLoading: boolean;
  isMigrating: boolean;
  setIsMigrating: Dispatch<SetStateAction<boolean>>;
  userAttributes: UserAttributes | null;
  setUserAttributes: Dispatch<SetStateAction<UserAttributes | null>>;
  hasHydrated: boolean;
  isHydratingRemote: boolean;

  /* Onboarding */
  onboardingStatus: OnboardingStatus;
  shouldShowOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
  restartOnboarding: () => Promise<void>;

  /* Theme (light/dark/system) for the UI */
  theme: ThemeChoice;
  setThemePreference: (choice: ThemeChoice) => Promise<void>;
}

type AppContextProviderProps = {
  user?: AppContextProviderUser;
  preferredStorageMode?: StorageModeType | undefined;
  children: ReactNode;
};

export enum OnboardingStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  SKIPPED = "skipped",
}
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
  const [workspaces, setWorkspaces] = useState<Record<WorkspaceIdType, WorkspaceType>>({});
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<WorkspaceIdType | null>(null);

  const [bookmarkGroups, setBookmarkGroups] = useState<BookmarkGroupType[]>([]);
  const [groupsIndex, setGroupsIndex] = useState<GroupsIndexEntry[]>([]); // [{ id, groupName }]
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);
  const [isHydratingRemote, setIsHydratingRemote] = useState<boolean>(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageModeType | undefined>(undefined); 

  const [isLoading, setIsLoading] = useState<boolean>(true); // only for the very first paint
  const [isMigrating, setIsMigrating] = useState<boolean>(false);

  // Authentication
  const resolvedUserId = userId ?? LOCAL_USER_ID;
  const hasSession = !!userId && userId !== LOCAL_USER_ID; // no storage coupling
  const authMode: AuthModeType = hasSession ? AuthMode.AUTH : AuthMode.ANON;
  /** @deprecated Prefer `authMode === AuthMode.AUTH`. `isSignedIn` remains for backward compatibility. */
  const isSignedIn = authMode === AuthMode.AUTH;
  const authKey = authMode === AuthMode.AUTH ? resolvedUserId : 'anon-key';

  // Onboarding
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus>(OnboardingStatus.NOT_STARTED);
  const shouldShowOnboarding =
    onboardingStatus === OnboardingStatus.IN_PROGRESS ||
    onboardingStatus === OnboardingStatus.NOT_STARTED;

  // Themes
  const [theme, setTheme] = useState<ThemeChoice>(ThemeChoice.SYSTEM);
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
   * Persist the active workspace change to the registry and mirror it into local state.
   *
   * @param id Workspace identifier selected by the user.
   * @returns Promise that resolves once the registry has been updated.
   */
  const updateActiveWorkspaceId = useCallback(async (id: WorkspaceIdType) => {
    try {
      await setActiveWorkspace(id);     // persist to registry
      setActiveWorkspaceId(id);         // reflect in state
    } catch (e) {
      console.error("Failed to set active workspace:", e);
    }
  }, []);

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
    workspaceId?: WorkspaceIdType, 
  ): Promise<GroupsIndexEntry[]> {
    if (!workspaceId) return [];   // guard if not ready yet

    // 1) Try session cache (namespaced). Persists while SW alive. 
    try {
      const sessionKey = sessionGroupsIndexKey(workspaceId);
      const sessionPayload =
        (await chrome?.storage?.session?.get?.([sessionKey])) ?? {};
      const groupsIndex = (sessionPayload as Record<string, unknown>)[sessionKey];

      if (Array.isArray(groupsIndex) && groupsIndex.length) {
        return groupsIndex as GroupsIndexEntry[];
      }
    } catch {}

    // 2) Try persistent local cache (namespaced). 
    try {
      const localKey = localGroupsIndexKey(workspaceId);
      const persistedPayload = (await chrome?.storage?.local?.get?.([localKey])) ?? {};
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
   * @param currentStorageMode Optional storage mode used to determine adapter behaviour.
   * @returns Promise that resolves once the cache persistence work finishes.
   */
  async function persistCachesIfNonEmpty(
    workspaceId: WorkspaceIdType,
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
    try { await writeGroupsIndexSession(workspaceId, idx); } catch {}
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
    workspaceId: WorkspaceIdType, // NEW
    setBookmarkGroups: Dispatch<SetStateAction<BookmarkGroupType[]>>,
    deepEqualFn: (a: unknown, b: unknown) => boolean
  ): Promise<BookmarkGroupType[]> {
    const fullRaw = await loadInitialBookmarks(userIdArg, workspaceId, storageMode, {
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

  const persistOnboardingStatus = async (status: OnboardingStatus) => {
    try {
      await chrome?.storage?.local?.set?.({
        [ONBOARDING_STORAGE_KEY]: status,
      });
    } catch {
      // ignore
    }
  };

  const completeOnboarding = useCallback(async () => {
    setOnboardingStatus(OnboardingStatus.COMPLETED);
    await persistOnboardingStatus(OnboardingStatus.COMPLETED);
  }, []);

  const skipOnboarding = useCallback(async () => {
    setOnboardingStatus(OnboardingStatus.SKIPPED);
    await persistOnboardingStatus(OnboardingStatus.SKIPPED);
  }, []);

  const restartOnboarding = useCallback(async () => {
    setOnboardingStatus(OnboardingStatus.IN_PROGRESS);
    await persistOnboardingStatus(OnboardingStatus.IN_PROGRESS);
  }, []);

  const setThemePreference = useCallback(
    async (choice: ThemeChoice): Promise<void> => {
      console.log("[AppContextProvider] In setThemePreference");
      setTheme(choice);
      applyTheme(choice);

      try {
        await chrome?.storage?.local?.set?.({
          [THEME_STORAGE_KEY]: choice,
        });
      } catch {
        // best-effort only
      }
    },
    []
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const payload =
          (await chrome?.storage?.local?.get?.(ONBOARDING_STORAGE_KEY)) ?? {};
        const raw = (payload as Record<string, unknown>)[ONBOARDING_STORAGE_KEY];

        if (cancelled) return;

        // raw is a string like "completed" | "skipped" | etc.
        if (typeof raw === "string") {
          const values = Object.values(OnboardingStatus);
          if (values.includes(raw as OnboardingStatus)) {
            setOnboardingStatus(raw as OnboardingStatus);
            return;
          }
        }

        setOnboardingStatus(OnboardingStatus.NOT_STARTED);
      } catch {
        if (!cancelled) {
          setOnboardingStatus(OnboardingStatus.NOT_STARTED);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (!storageMode) return;
    if (isLoading) return;
    if (!hasHydrated) return;
    if (
      onboardingStatus !== OnboardingStatus.NOT_STARTED &&
      onboardingStatus !== OnboardingStatus.IN_PROGRESS
    ) {
      return;
    }

    const isEmpty = !bookmarkGroups || bookmarkGroups.length === 0;
    if (!isEmpty) return;

    setOnboardingStatus(OnboardingStatus.IN_PROGRESS);
    try {
      void chrome?.storage?.local?.set?.({
        [ONBOARDING_STORAGE_KEY]: OnboardingStatus.IN_PROGRESS,
      });
    } catch {
      // best-effort
    }
  }, [
    activeWorkspaceId,
    storageMode,
    isLoading,
    hasHydrated,
    onboardingStatus,
    bookmarkGroups,
  ]);

  /**
   * Wait for the workspace registry bootstrap to finish, then hydrate local state with the
   * registered workspaces and active workspace identifier.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await registryReady;                 // init + migrate (once)
        const reg = await loadRegistry();    // single source of truth
        if (!reg || cancelled) return;

        setWorkspaces(reg.items);
        setActiveWorkspaceId(reg.activeId);

        if (process.env.NODE_ENV !== "production") {
          console.debug("[Mindful] Active workspace:", reg.activeId);
        }
      } catch (e) {
        console.error("Failed to load workspace registry:", e);
        // leave activeWorkspaceId as null so downstream effects bail gracefully
      }
    })();
    return () => { cancelled = true; };
  }, []);  // empty deps → one-time on mount

  /**
   * Log when the storage mode stabilises so we can correlate downstream effects in devtools.
   */
  useEffect(() => {
    if (storageMode) {
      console.debug('[AppContextProvider] ready:', { userId, storageMode });
    }
  }, [userId, storageMode]);

  /**
   * Phase 0 bootstrap: resolve the initial storage mode as fast as possible by checking
   * for explicit anon overrides, silent Amplify sessions, or falling back to LOCAL.
   */
  useEffect(() => {
    let cancelled = false;
    console.log('[AppContextProvider] phase0 start: user?', !!user);

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
            console.log('[AppContextProvider] forced LOCAL due to anon mode');
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
              console.log('[AppContextProvider] ready (SILENT AUTH):', {
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
          console.log('[AppContextProvider] ready (UNAUTH):', {
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
        console.log('[AppContextProvider] Signed in user attributes: ', attributes);

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
        console.log('[AppContextProvider] User provided storage type: ', storedType);
        const effectiveType =
          preferredStorageMode || storedType || DEFAULT_STORAGE_MODE;
        console.log('[AppContextProvider] Effective storage type: ', effectiveType);

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
        console.warn(`Auth bootstrap failed, falling back to ${LOCAL_USER_ID}:`, err);
        if (!cancelled) {
          setUserId(LOCAL_USER_ID);
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
    if (!activeWorkspaceId) return;
    if (storageMode === StorageMode.REMOTE && isHydratingRemote) return; // don't seed while remote gating

    const storageAdapter = getAdapter(storageMode);
    if (storageAdapter) {
      const seed = storageAdapter.readPhase1aSnapshot(activeWorkspaceId);
      console.log('[AppContextProvider] Cached (LOCAL fp via storageAdapter) in phase 1a: ', seed);
      if (Array.isArray(seed) && seed.length && !deepEqual(bookmarkGroups, seed)) {
        setBookmarkGroups(seed);
        setHasHydrated(true);
      }
    } else { 
      // Future/REMOTE path (kept for completeness)
      const cached = readBookmarkCacheSync(activeWorkspaceId) as BookmarkSnapshot | null;
      console.log('[AppContextProvider] Cached (REMOTE) bookmarks in phase 1a: ', cached);
      if (cached?.data && Array.isArray(cached.data) && !deepEqual(bookmarkGroups, cached.data)) {
        setBookmarkGroups(cached.data as BookmarkGroupType[]);
        setHasHydrated(true);
      }
    }
  }, [authKey, storageMode, activeWorkspaceId]); // treat anon as stable key

  /**
   * Phase 1b: asynchronously read the session cache plus groups index so UI elements can render
   * meaningful data while the full remote hydration runs in the background.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      if (!storageMode || !activeWorkspaceId) {            
        setIsLoading(false);
        return;
      }

      if (storageMode === StorageMode.REMOTE && isHydratingRemote) {
        // Don't paint from caches while we’re gating for remote
        setIsLoading(false);
        return;
      }

      try {
        const id = authMode === AuthMode.AUTH ? resolvedUserId : LOCAL_USER_ID;
        const storageAdapter = getAdapter(storageMode);
        if (storageAdapter) {
          const cached = await storageAdapter.readPhase1bSessionSnapshot(activeWorkspaceId);
          if (!cancelled && cached?.data && Array.isArray(cached.data) && cached.data.length) {
            setBookmarkGroups((prev) => (deepEqual(prev, cached.data) ? prev : (cached.data as BookmarkGroupType[])));
            setHasHydrated(true);
          }
        } else {
          // Future/REMOTE path: keep existing session cache read
          const cached = await readBookmarkCacheSession(activeWorkspaceId) as BookmarkSnapshot | null;
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
  }, [authKey, storageMode, user, activeWorkspaceId]);

  /**
   * Phase 2: load the authoritative bookmark list (remote or local) during idle time, update caches,
   * and clear the remote hydration gate when complete.
   */
  useEffect(() => {
    if (isMigrating) return;
    if (!storageMode || !activeWorkspaceId) return;

    // Always resolve a concrete id (LOCAL_USER_ID for anon)
    const id = authMode === AuthMode.AUTH ? resolvedUserId : LOCAL_USER_ID;
    if (!id) return;

    let cancelled = false;

    /**
     * Trigger the authoritative bookmark load and cache refresh for the active workspace.
     *
     * @returns Promise from the load pipeline, used for idle scheduling management.
     */
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
  }, [authKey, storageMode, isMigrating, user, isHydratingRemote, activeWorkspaceId]);

  /**
   * Listen for cross-view "bookmarks updated" signals and visibility changes so the context
   * can refresh data without blocking the primary loading indicator.
   */
  useEffect(() => {
    if (isMigrating) return;

    /**
     * Pull the latest bookmark payload for the active workspace and update state without touching the global loading indicators.
     */
    const reload = async () => {
      try {
        if (!activeWorkspaceId) return;
        const id = authMode === AuthMode.AUTH ? resolvedUserId : LOCAL_USER_ID;
        await loadAndCache(userId, id, storageMode, activeWorkspaceId, setBookmarkGroups, deepEqual);
      } catch (e) {
        console.error('Reload after update failed:', e);
      }
    };

    // Runtime messages (e.g., popup saved/imported)
    /**
     * React to chrome runtime messages indicating bookmark mutations from other surfaces.
     *
     * @param msg Cross-context message payload emitted by the extension runtime.
     */
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
    /**
     * Refresh bookmarks when the current document regains visibility.
     */
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
  }, [authKey, storageMode, isMigrating, user, activeWorkspaceId]);
  
  /**
   * Keep the chrome.storage.session tiny index mirror isolated to the active workspace.
   * We seed null (placeholder) and let writers populate real values after loads.
   */
  useEffect(() => {
    (async () => {
      if (!activeWorkspaceId) return;
      if (storageMode === StorageMode.REMOTE && isHydratingRemote) return; // don't touch mirrors while gating remote
      try {
        await clearSessionGroupsIndexExcept(activeWorkspaceId);
        await writeGroupsIndexSession(activeWorkspaceId, []);
      } catch {}
    })();
  }, [activeWorkspaceId, storageMode, isHydratingRemote]);

    useEffect(() => {
    let cancelled = false;

    (async () => {
      const initial = await loadInitialTheme();
      if (cancelled) return;

      setTheme(initial);
      applyTheme(initial);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (theme !== ThemeChoice.SYSTEM) return;
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(ThemeChoice.SYSTEM);

    try {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {
      // older browsers
      mq.addListener?.(handler);
      return () => mq.removeListener?.(handler);
    }
  }, [theme]);
  /* ---------------------------------------------------------- */

  // ----- render gate: only block first paint if we truly have nothing -----
  if (isLoading && !groupsIndex.length && !hasHydrated) {
    return <div>Loading…</div>;
  }

  const contextValue: AppContextValue = {
    workspaces,
    activeWorkspaceId,
    // Set wrapper so callers don't get a plain state setter, which could cause divergence
    // from the registry on disk.
    setActiveWorkspaceId: updateActiveWorkspaceId,

    groupsIndex,
    bookmarkGroups,
    setBookmarkGroups,
    userId: userId ?? LOCAL_USER_ID, // Always expose the actual resolved userId (LOCAL_USER_ID when anon)
    storageMode,
    setStorageMode: handleStorageModeChange,
    isSignedIn,
    authMode,
    isLoading,
    isMigrating,
    setIsMigrating,
    userAttributes,
    setUserAttributes,
    hasHydrated,
    isHydratingRemote,

    // Onboarding
    onboardingStatus,
    shouldShowOnboarding,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,

    // Themes
    theme,
    setThemePreference,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
