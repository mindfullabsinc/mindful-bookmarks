import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
/* CSS styles */
import "@/styles/Login.css";
/* Constants and Types */
import { EMPTY_GROUP_IDENTIFIER, ONBOARDING_NEW_GROUP_PREFILL, } from "@/core/constants/constants";
import { StorageMode } from "@/core/constants/storageMode";
/* Hooks */
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { ensureImportedGroup } from "@/hooks/useCopyTo";
/* Utilities */
import { getUserStorageKey } from '@/core/utils/storageKeys';
/* Scripts */
import { loadInitialBookmarks } from '@/scripts/bookmarksData';
import { AppContext } from "@/scripts/AppContextProvider";
import { copyItems, moveItems } from "@/scripts/copyBookmarks";
/* Components */
import TopBanner from "@/components/TopBanner";
import DraggableGrid from '@/components/DraggableGrid';
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import CopyToModal from "@/components/modals/CopyToModal";
import { Toast } from "@/components/primitives/Toast";
// Lazy-load AnalyticsProvider so anon mode never imports it
const AnalyticsProviderLazy = React.lazy(async () => {
    const mod = await import("@/analytics/AnalyticsProvider");
    const Provider = mod.default ??
        (({ children }) => _jsx(_Fragment, { children: children }));
    return { default: Provider };
});
/* ---------------------------------------------------------- */
/**
 * Render the Mindful new-tab surface, wiring bookmark context, storage switching,
 * and auth hand-offs for both signed-in and anonymous flows.
 *
 * @param {{ sub?: string }} [user] Authenticated Cognito user object, when available.
 * @param {() => Promise<void> | void} [signIn] Optional callback invoked when the user clicks sign-in.
 * @param {() => Promise<void> | void} [signOut] Optional callback invoked when the user clicks sign-out.
 * @returns {ReactElement} New tab React tree.
 */
export function NewTabPage({ user, signIn, signOut }) {
    /* -------------------- Context / state --------------------*/
    const appCtx = useContext(AppContext);
    const { bookmarkGroups: bookmarkGroupsRaw, setBookmarkGroups, userId, activeWorkspaceId, storageMode, isMigrating, userAttributes, isSignedIn, hasHydrated, isHydratingRemote, } = useContext(AppContext);
    const gridRef = useRef(null);
    const ready = !!(hasHydrated && !(storageMode !== StorageMode.LOCAL && isHydratingRemote));
    // --- De-dupe bursts from message + storage ---
    const lastAuthSignalAtRef = useRef(0);
    const lastModeSignalAtRef = useRef(0);
    // Get all actions from the custom bookmarks hook
    const { addEmptyBookmarkGroup, exportBookmarksToJSON, importBookmarksFromJSON, changeStorageMode, } = useBookmarkManager();
    // Copy modal state + pending request
    const [copyOpen, setCopyOpen] = useState(false);
    const pendingCopyRef = useRef(null);
    const [toastMsg, setToastMsg] = useState(null);
    const toast = (msg) => setToastMsg(msg);
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
        }
        catch { }
    };
    /**
     * Handle cross-view auth signals by forcing a reload when a newer timestamp arrives.
     *
     * @param {number} [at=Date.now()] Millisecond timestamp associated with the auth event.
     */
    const handleAuthSignal = (at = Date.now()) => {
        if (at <= lastAuthSignalAtRef.current)
            return; // ignore duplicates
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
        if (at <= lastModeSignalAtRef.current)
            return;
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
        try {
            await globalThis?.chrome?.storage?.session?.remove?.(['groupsIndex', 'bookmarkGroups']);
        }
        catch { }
        try {
            await globalThis?.chrome?.storage?.local?.remove?.(['groupsIndex', 'bookmarkGroups']);
        }
        catch { }
        // If your BookmarkCache uses localStorage, optionally nuke known keys here.
        try {
            // conservative: only remove keys we know might exist
            Object.keys(localStorage || {}).forEach(k => {
                if (k.startsWith('mindful_cache_') || k.startsWith('bookmarkCache_')) {
                    try {
                        localStorage.removeItem(k);
                    }
                    catch { }
                }
            });
        }
        catch { }
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
            if (el)
                el.scrollIntoView({ block: 'center' });
        }
        catch (e) {
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
        try {
            globalThis.chrome?.storage?.local?.set({ authSignalAt: at, authSignal: 'signedOut' });
        }
        catch { }
        try {
            globalThis.chrome?.runtime?.sendMessage?.({ type, at }, () => { globalThis.chrome?.runtime?.lastError; });
        }
        catch { }
    }
    /**
     * Notify other contexts that storage preferences switched to anonymous/local mode.
     *
     * @returns {void}
     */
    function broadcastLocalModeEdge() {
        const at = Date.now();
        try {
            globalThis.chrome?.storage?.local?.set({ mindful_auth_mode: 'anon', modeSignalAt: at });
        }
        catch { }
        try {
            globalThis.chrome?.runtime?.sendMessage?.({ type: 'MODE_SWITCHED_TO_ANON', at }, () => { globalThis.chrome?.runtime?.lastError; });
        }
        catch { }
    }
    /**
     * Default sign-out handler: logs out via Amplify, clears caches, broadcasts signals, and reloads.
     *
     * @returns {Promise<void>} Resolves after the UI reload is requested.
     */
    const defaultSignOut = async () => {
        try {
            const { signOut: amplifySignOut } = await import("aws-amplify/auth");
            try {
                await amplifySignOut({ global: true });
            }
            catch { }
        }
        catch { }
        await clearBookmarkCaches();
        broadcastAuthEdge('USER_SIGNED_OUT');
        broadcastLocalModeEdge();
        clearAuthHash();
        try {
            window.location.reload();
        }
        catch { }
    };
    /**
     * Execute a confirmed copy or move request emitted by the modal, then surface the result via toast.
     *
     * @param destWorkspaceId Workspace identifier that should receive the copied data.
     * @param move When true, perform a move (transfer) instead of a copy.
     */
    const handleCopyConfirm = useCallback(async (destWorkspaceId, move) => {
        console.log("[NewTabPage.tsx] In handleCopyConfirm()");
        console.log("[NewTabPage.tsx] move: ", move);
        const payload = pendingCopyRef.current;
        setCopyOpen(false);
        pendingCopyRef.current = null;
        if (!payload)
            return;
        try {
            const moveOrCopyFunction = move ? moveItems : copyItems;
            if (!userId) {
                // TODO: throw error
                return;
            }
            const fromStorageKey = getUserStorageKey(userId, payload.fromWorkspaceId);
            const toStorageKey = getUserStorageKey(userId, destWorkspaceId);
            if (payload.kind === "workspace") {
                // Copy *all groups* from source workspace → dest
                const res = await moveOrCopyFunction({
                    fromWorkspaceId: payload.fromWorkspaceId,
                    toWorkspaceId: destWorkspaceId,
                    fromStorageKey: fromStorageKey,
                    toStorageKey: toStorageKey,
                    target: { kind: "group", groupId: "__ALL__" }, // handled below
                    dedupeByUrl: true,
                    chunkSize: 200,
                });
                toast(`${res.added} links added • ${res.skipped} links skipped`);
                return;
            }
            if (payload.kind === "group") {
                const res = await moveOrCopyFunction({
                    fromWorkspaceId: payload.fromWorkspaceId,
                    toWorkspaceId: destWorkspaceId,
                    fromStorageKey: fromStorageKey,
                    toStorageKey: toStorageKey,
                    target: { kind: "group", groupId: payload.groupId },
                    dedupeByUrl: true,
                    chunkSize: 200,
                });
                toast(`${res.added} links added • ${res.skipped} links skipped`);
                return;
            }
            // bookmark → dest “Imported” group
            const intoGroupId = await ensureImportedGroup(destWorkspaceId, toStorageKey);
            const res = await moveOrCopyFunction({
                fromWorkspaceId: payload.fromWorkspaceId,
                toWorkspaceId: destWorkspaceId,
                fromStorageKey: fromStorageKey,
                toStorageKey: toStorageKey,
                target: { kind: "bookmark", bookmarkIds: payload.bookmarkIds, intoGroupId },
                dedupeByUrl: true,
                chunkSize: 200,
            });
            toast(`${res.added} links added • ${res.skipped} links skipped`);
        }
        catch (err) {
            toast(`Copy failed: ${err?.message ?? String(err)}`);
        }
    }, [toast, userId]);
    /* ---------------------------------------------------------- */
    /* -------------------- Effects -------------------- */
    /**
     * On mount, check stored auth mode and strip any hash-based authenticator prompts if the user
     * explicitly chose anonymous mode in a prior session.
     */
    useEffect(() => {
        (async () => {
            try {
                const { mindful_auth_mode } = (await globalThis?.chrome?.storage?.local?.get?.('mindful_auth_mode')) ?? {};
                if (mindful_auth_mode === 'anon') {
                    const h = window.location.hash || '';
                    if (h.includes('auth=')) {
                        history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
                }
            }
            catch { }
        })();
    }, []);
    /**
     * Ensure an empty placeholder group exists once data is hydrated so users can immediately add
     * bookmarks without manually creating a group first.
     */
    useEffect(() => {
        // Avoid adding an empty group before we know if cache / real data exist
        if (!ready)
            return;
        if (!hasHydrated)
            return;
        if (!bookmarkGroupsRaw)
            return;
        if (bookmarkGroupsRaw.length === 0) {
            addEmptyBookmarkGroup();
            return;
        }
        const hasEmpty = bookmarkGroupsRaw.some(g => g.groupName === EMPTY_GROUP_IDENTIFIER);
        if (!hasEmpty)
            addEmptyBookmarkGroup();
    }, [hasHydrated, bookmarkGroupsRaw, addEmptyBookmarkGroup]);
    /**
     * When operating in LOCAL storage mode, listen for chrome.storage updates from other tabs so
     * this view stays in sync with cross-window edits.
     */
    useEffect(() => {
        // Only attach this listener if we are in LOCAL storage mode.
        // It's irrelevant for remote storage.
        if (!activeWorkspaceId)
            return;
        if (storageMode !== StorageMode.LOCAL || !userId) {
            return; // Do nothing if in remote mode or not signed in.
        }
        if (isMigrating) { // Don't run this effect while migrating storage
            console.log("Migration in progress, storage listener is paused.");
            return;
        }
        const handleStorageChange = async (changes, area) => {
            const userStorageKey = getUserStorageKey(userId, activeWorkspaceId);
            if (area === "local" && changes[userStorageKey]) {
                console.log("Local storage changed in another tab. Reloading bookmarks...");
                // Pass the correct storageMode to the loading function.
                const freshGroups = await loadInitialBookmarks(userId, activeWorkspaceId, storageMode, {
                    noLocalFallback: storageMode !== StorageMode.LOCAL
                });
                setBookmarkGroups(freshGroups || []);
            }
        };
        globalThis.chrome?.storage?.onChanged?.addListener(handleStorageChange);
        // The cleanup function runs when dependencies change, removing the old listener.
        return () => {
            globalThis.chrome?.storage?.onChanged?.removeListener?.(handleStorageChange);
        };
    }, [userId, storageMode, activeWorkspaceId, setBookmarkGroups, isMigrating]); // Re-runs if user or storageMode changes
    /**
     * Subscribe to runtime messages signaling auth changes or storage mode flips so this page can
     * react to popup-driven events without polling.
     */
    useEffect(() => {
        const onMsg = (msg) => {
            if (msg?.type === 'USER_SIGNED_IN' || msg?.type === 'USER_SIGNED_OUT') {
                if (msg?.type === 'USER_SIGNED_OUT') {
                    try {
                        clearBookmarkCaches();
                    }
                    catch { }
                }
                handleAuthSignal(Number(msg.at) || Date.now());
            }
            else if (msg?.type === 'MODE_SWITCHED_TO_ANON') {
                clearAuthHash();
                handleModeAnonSignal(Number(msg.at) || Date.now());
            }
        };
        try {
            globalThis.chrome?.runtime?.onMessage?.addListener?.(onMsg);
        }
        catch { }
        return () => { try {
            globalThis.chrome?.runtime?.onMessage?.removeListener?.(onMsg);
        }
        catch { } };
    }, []);
    /**
     * Mirror the runtime listener with a chrome.storage observer so persisted timestamps from other
     * contexts trigger the same auth or mode reactions here.
     */
    useEffect(() => {
        const storageEvents = globalThis.chrome?.storage?.onChanged;
        if (!storageEvents?.addListener)
            return () => { };
        const onStorageAuth = (changes, area) => {
            if (area !== 'local')
                return;
            if (changes?.authSignalAt?.newValue) {
                handleAuthSignal(Number(changes.authSignalAt.newValue));
            }
            if (changes?.modeSignalAt?.newValue) {
                clearAuthHash();
                handleModeAnonSignal(Number(changes.modeSignalAt.newValue));
            }
        };
        try {
            storageEvents.addListener(onStorageAuth);
        }
        catch { }
        return () => { try {
            storageEvents.removeListener(onStorageAuth);
        }
        catch { } };
    }, []);
    /**
     * Register a window-level listener for copy-to modal open events so other surfaces can trigger the modal.
     */
    useEffect(() => {
        const onOpen = (e) => {
            const ev = e;
            pendingCopyRef.current = ev.detail ?? null;
            setCopyOpen(!!ev.detail);
        };
        window.addEventListener("mindful:copyto:open", onOpen);
        return () => window.removeEventListener("mindful:copyto:open", onOpen);
    }, []);
    /* ---------------------------------------------------------- */
    // Ensure every group has a bookmarks array, as required by DraggableGrid's type
    // Keep the empty placeholder group (add-new-group box) pinned to the end.
    const normalizedGroups = (bookmarkGroupsRaw ?? [])
        .map((g) => ({ ...g, bookmarks: g?.bookmarks ?? [] }))
        .sort((a, b) => {
            if (a.groupName === EMPTY_GROUP_IDENTIFIER) return 1;
            if (b.groupName === EMPTY_GROUP_IDENTIFIER) return -1;
            return 0;
        });
    // Only mount Analytics when signed in
    // Only mount Analytics when signed in
    const content = (_jsxs("div", { className: "min-h-screen bg-gray-100 dark:bg-neutral-950 overflow-x-hidden", children: [_jsx(TopBanner, { onExportBookmarks: exportBookmarksToJSON, userAttributes: userAttributes, onSignIn: signIn || defaultSignIn, onSignOut: signOut || defaultSignOut, isSignedIn: isSignedIn /* prefer context-derived status over props */, onStorageModeChange: changeStorageMode }), _jsxs("div", { className: "relative", children: [_jsx(WorkspaceSwitcher, {}), ready && (_jsxs("div", { className: "\n              pl-[20px] md:pl-[24px] lg:pl-[32px]\n              mt-3 md:mt-4\n              transition-[padding-left]\n            ", children: [_jsx(DraggableGrid, { ref: gridRef, user: isSignedIn ? { sub: userId } : null, bookmarkGroups: normalizedGroups }), _jsx(CopyToModal, { open: copyOpen, onClose: () => {
                                    setCopyOpen(false);
                                    pendingCopyRef.current = null;
                                }, onConfirm: handleCopyConfirm, currentWorkspaceId: activeWorkspaceId }), _jsx(Toast, { message: toastMsg })] }))] })] }));
    // Render path—signed in → lazy analytics; anon → plain content
    return isSignedIn ? (_jsx(React.Suspense, { fallback: _jsx("div", {}), children: _jsx(AnalyticsProviderLazy, { children: content }) })) : (content);
}
