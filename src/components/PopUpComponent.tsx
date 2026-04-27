/* -------------------- Imports -------------------- */
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';

/* Hooks and Utilities */
import { AppContext } from "@/scripts/AppContextProvider";
import type { AppContextValue } from "@/scripts/AppContextProvider";
import { constructValidURL } from '@/core/utils/url';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { SELECT_NEW, lastGroupKey, writeLastSelectedGroup, broadcastLastSelectedGroup } from '@/core/utils/lastSelectedGroup';
import { DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';

/* Constants */
import { URL_PATTERN, EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';
/* ---------------------------------------------------------- */

/* ----------------------- Class-level helper functions ----------------------- */
/**
 * Read a string from localStorage while swallowing any access errors (e.g., when disabled).
 *
 * @param key LocalStorage key to read.
 * @returns Stored value or empty string on failure.
 */
const safeRead = (key: string): string => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};
/**
 * Write a string to localStorage while ignoring storage errors.
 *
 * @param key LocalStorage key to write.
 * @param v Value to store (defaults to empty string when falsy).
 */
const safeWrite = (key: string, v: string) => {
  try { localStorage.setItem(key, v || ''); } catch {}
};

/** Try to resolve a stored value to a valid group id.
 *  - Prefers direct id match
 *  - Falls back to legacy "stored name" match (for migration)
 */
/**
 * Convert a previously stored group identifier (id or legacy name) into a valid current id.
 *
 * @param storedValue Persisted value read from storage.
 * @param groups Current list of available groups.
 * @returns Matching group id or empty string when not found.
 */
function resolveStoredToGroupId(
  storedValue: string,
  groups: Array<{ id: string; groupName: string }>
): string {
  if (!storedValue) return '';
  const byId = groups.find(g => g.id === storedValue);
  if (byId) return byId.id;
  const byName = groups.find(g => g.groupName === storedValue); // legacy path
  return byName ? byName.id : '';
}

/** Capitalize the first letter of each word. */
function capitalizeWords(s = ''): string {
  return s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

/** Derive a human-readable bookmark name from a URL (mirrors AddBookmarkInline). */
function deriveNameFromUrl(u: string): string {
  try {
    const { hostname, pathname } = new URL(u);
    const host = hostname.replace(/^www\./, '');
    const domain = host.split('.').slice(0, -1).join('.') || host;
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

/** Build the localStorage key for the group recency order array. */
const groupRecentOrderKey = (userId: string | null, storageMode: string | null, workspaceId: string | null) =>
  `mindful:groupRecentOrder:${userId || 'local'}:${storageMode || 'local'}:${workspaceId || 'default'}`;

/** Push an id to the front of a recency list (dedup + cap at 100). */
function pushRecent(order: string[], id: string): string[] {
  return [id, ...order.filter(x => x !== id)].slice(0, 100);
}

/** Try to find a group's id by name, retrying briefly as state hydrates. */
async function findGroupIdByName(
  name: string,
  getGroups: () => Array<{ id: string; groupName: string }>,
  attempts = 8,
  delayMs = 50
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const groups = getGroups();
    const hit = groups.find(g => g.groupName === name);
    if (hit?.id) return hit.id;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return '';
}
/* ---------------------------------------------------------- */

/**
 * Popup UI for adding bookmarks into an existing or new group, remembering the last selection per workspace.
 */
export default function PopUpComponent() {
  /* -------------------- Context / state -------------------- */
  // Pull the fast index and the hydrated groups from context
  const { groupsIndex, bookmarkGroups, userId, storageMode, activeWorkspaceId } =
    useContext(AppContext) as AppContextValue;

  // Actions
  const { addNamedBookmark } = useBookmarkManager();

  // Selection state (store **id**; not name)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(SELECT_NEW);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  // Recency order (ids of most-recently-used groups, most-recent first)
  const [recentOrder, setRecentOrder] = useState<string[]>([]);

  // Whether the user has explicitly asked to create a new group (only matters when there are no existing groups)
  const [showingNewGroupForm, setShowingNewGroupForm] = useState(false);

  // Only choose a default once per scope (userId+storageMode+workspaceId)
  const choseInitialRef = useRef(false);
  const scopeKey = `${userId || 'local'}::${storageMode || 'local'}::${activeWorkspaceId}`;

  // Resolve available groups quickly (use the small index immediately; hydrate later)
  const availableGroups = useMemo<Array<{ id: string; groupName: string }>>(() => {
    const base = ((groupsIndex?.length ? groupsIndex : bookmarkGroups) ?? []) as Array<{
      id: string;
      groupName: string;
    }>;
    return base.filter((g) => g.groupName !== EMPTY_GROUP_IDENTIFIER);
  }, [groupsIndex, bookmarkGroups]);

  // Top 3 most-recently-used groups (in recency order)
  const RECENT_LIMIT = 5;
  const recentGroups = useMemo(() =>
    recentOrder
      .map(entry =>
        availableGroups.find(g => g.id === entry) ??
        availableGroups.find(g => g.groupName === entry)  // fallback: name stored before ID resolved
      )
      .filter((g): g is { id: string; groupName: string } => !!g)
      .slice(0, RECENT_LIMIT),
    [availableGroups, recentOrder]
  );

  // All groups in alphabetical order
  const alphaGroups = useMemo(() =>
    [...availableGroups].sort((a, b) => a.groupName.localeCompare(b.groupName)),
    [availableGroups]
  );

  // Always read the freshest list (prefer hydrated)
  const getLatestGroups = () => {
    const base = ((groupsIndex?.length ? groupsIndex : bookmarkGroups) ?? []) as Array<{ id: string; groupName: string }>;
    return base.filter(g => g.groupName !== EMPTY_GROUP_IDENTIFIER);
  };
  /* ---------------------------------------------------------- */

  /* -------------------- Local helper functions -------------------- */
  // Keep the selection stable and persisted on user changes (store **id**)
  /**
   * Update the selected group id both locally and in persisted state.
   *
   * @param e Change event emitted by the select input.
   */
  const onGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value; // id or SELECT_NEW
    setSelectedGroupId(val);
    const key = lastGroupKey(userId, storageMode, activeWorkspaceId);
    if (val !== SELECT_NEW) {
      writeLastSelectedGroup(key, val);
      broadcastLastSelectedGroup({
        workspaceId: activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID,
        groupId: val
      });
      const newOrder = pushRecent(recentOrder, val);
      setRecentOrder(newOrder);
      safeWrite(groupRecentOrderKey(userId, storageMode ?? null, activeWorkspaceId), JSON.stringify(newOrder));
    }
    choseInitialRef.current = true;
  };

  /**
   * Submit handler that validates inputs, persists the bookmark, and optionally closes the popup.
   *
   * @param event Form submission event.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let groupNameToUse = '';
    if (selectedGroupId === SELECT_NEW) {
      groupNameToUse = newGroupInput.trim();
      if (!groupNameToUse) {
        alert("Please enter a name for the new group.");
        return;
      }
    } else {
      const grp = availableGroups.find(g => g.id === selectedGroupId);
      groupNameToUse = grp?.groupName || '';
      if (!groupNameToUse) {
        alert("Please pick a valid group.");
        return;
      }
    }

    const urlWithProtocol = constructValidURL(url);
    const finalName = name.trim() || deriveNameFromUrl(urlWithProtocol) || urlWithProtocol;
    const key = lastGroupKey(userId, storageMode, activeWorkspaceId);

    // 1) If NEW: immediately persist **name** and broadcast **name** as a fallback.
    if (selectedGroupId === SELECT_NEW) {
      // Write legacy value (name) so the next popup can resolve to id on mount
      writeLastSelectedGroup(key, groupNameToUse);
      broadcastLastSelectedGroup({
        workspaceId: activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID,
        groupName: groupNameToUse,
      });
    }

    // 2) Do the actual add (this will create the group if NEW)
    await addNamedBookmark(finalName, urlWithProtocol, groupNameToUse);

    if (selectedGroupId === SELECT_NEW) {
      // 3) Immediately record the new group name in recency storage so it shows on the next
      //    popup open even if ID resolution below times out before the popup closes.
      const orderKey = groupRecentOrderKey(userId, storageMode ?? null, activeWorkspaceId);
      const orderWithName = pushRecent(recentOrder, groupNameToUse);
      setRecentOrder(orderWithName);
      safeWrite(orderKey, JSON.stringify(orderWithName));

      // 4) Try to resolve the **id** briefly; if found, upgrade name→id in recency storage
      const createdGroupId = await findGroupIdByName(
        groupNameToUse,
        getLatestGroups, /* attempts */ 10, /* delayMs */ 100
      );

      if (createdGroupId) {
        setSelectedGroupId(createdGroupId);
        writeLastSelectedGroup(key, createdGroupId);
        broadcastLastSelectedGroup({
          workspaceId: activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID,
          groupId: createdGroupId,
        });
        const upgraded = pushRecent(orderWithName.filter(x => x !== groupNameToUse), createdGroupId);
        setRecentOrder(upgraded);
        safeWrite(orderKey, JSON.stringify(upgraded));
      }
    } else {
      // Existing group path: persist id and broadcast id
      writeLastSelectedGroup(key, selectedGroupId);
      broadcastLastSelectedGroup({
        workspaceId: activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID,
        groupId: selectedGroupId,
      });
      const newOrder = pushRecent(recentOrder, selectedGroupId);
      setRecentOrder(newOrder);
      safeWrite(groupRecentOrderKey(userId, storageMode ?? null, activeWorkspaceId), JSON.stringify(newOrder));
    }

    try { if (chrome?.runtime?.id) window.close(); } catch {}
  };

  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset the one-time selection when the storage scope changes.
   */
  useEffect(() => {
    choseInitialRef.current = false;
  }, [scopeKey]);

  /**
   * Load recency order from localStorage when the scope changes.
   * Falls back to seeding from the last-selected group key so returning users
   * see at least one entry in "Recently used" on first launch of the new code.
   */
  useEffect(() => {
    if (!storageMode) return;
    try {
      const raw = localStorage.getItem(groupRecentOrderKey(userId, storageMode ?? null, activeWorkspaceId));
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRecentOrder(parsed);
        return;
      }
    } catch {}
    // No recency history yet — seed from the last-selected group if available
    const lastSelected = safeRead(lastGroupKey(userId, storageMode, activeWorkspaceId));
    setRecentOrder(lastSelected ? [lastSelected] : []);
  }, [userId, storageMode, activeWorkspaceId]);

  /**
   * Pick a stable initial selection once per scope, preferring previously stored ids.
   */
  useEffect(() => {
    if (choseInitialRef.current) return;
    if (!storageMode) return; // wait until scope is known

    const key = lastGroupKey(userId, storageMode, activeWorkspaceId);
    const storedRaw = safeRead(key);
    const resolvedId = resolveStoredToGroupId(storedRaw, availableGroups);

    if (resolvedId) {
      setSelectedGroupId(resolvedId);
      safeWrite(key, resolvedId); // migrate legacy "name" to "id"
      choseInitialRef.current = true;
      return;
    }

    if (availableGroups.length > 0) {
      const firstId = availableGroups[0].id;
      setSelectedGroupId(firstId);
      safeWrite(key, firstId);
      choseInitialRef.current = true;
    }
    // else: wait for groups to load
  }, [availableGroups, userId, storageMode, activeWorkspaceId]);

  /**
   * Prefill the form with the active tab's title and URL.
   */
  useEffect(() => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const t = tabs?.[0];
        if (!t) return;
        if (t.url) setUrl(t.url);
        if (t.title) setName(t.title);
      });
    } catch {
      /* noop in non-extension environments */
    }
  }, []);

  /**
   * Listen for cross-context events so the popup stays in sync with other Mindful surfaces.
   */
  useEffect(() => {
    let chan: BroadcastChannel | null = null;

    try {
      chan = new BroadcastChannel('MINDFUL_UI');
      chan.onmessage = (ev) => {
        const msg = ev?.data;
        if (!msg || msg.type !== 'MINDFUL_LAST_GROUP_CHANGED') return;
        if (msg.workspaceId !== activeWorkspaceId) return;

        const incomingId: string | undefined = msg.groupId;
        const incomingName: string | undefined = msg.groupName;

        let resolvedId = '';
        if (incomingId && availableGroups.some(g => g.id === incomingId)) {
          resolvedId = incomingId;
        } else if (incomingName) {
          const hit = availableGroups.find(g => g.groupName === incomingName);
          resolvedId = hit?.id ?? '';
        }
        if (!resolvedId) return;

        const key = lastGroupKey(userId, storageMode, activeWorkspaceId);
        writeLastSelectedGroup(key, resolvedId);
        setSelectedGroupId(resolvedId);
        choseInitialRef.current = true;
      }; 
    } catch {}

    // Also listen via chrome.runtime in case other contexts can't see BroadcastChannel
    function onRuntimeMsg(msg: { type?: string; workspaceId?: string; groupId?: string; groupName?: string }) {
      if (!msg || msg.type !== 'MINDFUL_LAST_GROUP_CHANGED') return;
      if (msg.workspaceId !== activeWorkspaceId) return;
      const incomingId = msg.groupId;
      const incomingName = msg.groupName;
      
      let resolvedId = '';
      if (incomingId && availableGroups.some(g => g.id === incomingId)) {
        resolvedId = incomingId;
      } else if (incomingName) {
        const hit = availableGroups.find(g => g.groupName === incomingName);
        resolvedId = hit?.id ?? '';
      }
      if (!resolvedId) return;
      
      const key = lastGroupKey(userId, storageMode, activeWorkspaceId);
      writeLastSelectedGroup(key, resolvedId);
      setSelectedGroupId(resolvedId);
      choseInitialRef.current = true; 
    }
    try { chrome?.runtime?.onMessage?.addListener?.(onRuntimeMsg); } catch {}
  
    return () => {
      try { chrome?.runtime?.onMessage?.removeListener?.(onRuntimeMsg); } catch {}
      try { chan?.close?.(); } catch {}
    };
  }, [availableGroups, userId, storageMode, activeWorkspaceId]);
  /* ---------------------------------------------------------- */

  /* ----------------------- Main component UI ----------------------- */
  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="space-y-3"
        aria-label="Add Bookmark"
      >
        <label
          htmlFor="group-dropdown"
          className="text-neutral-700 dark:text-neutral-300"
        >
          Group
        </label>
        {availableGroups.length === 0 && !showingNewGroupForm ? (
          /* ── No groups yet: show placeholder + create CTA ── */
          <>
            <select
              id="group-dropdown"
              disabled
              className="w-full rounded-2xl border px-3 py-2 outline-none
                        bg-white dark:bg-neutral-900
                        border-neutral-200 dark:border-neutral-800
                        text-neutral-400 dark:text-neutral-600"
            >
              <option>No groups yet</option>
            </select>
            <button
              type="button"
              onClick={() => setShowingNewGroupForm(true)}
              className="w-full rounded-2xl border border-dashed border-blue-600 dark:border-blue-400
                        px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400
                        hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors cursor-pointer"
            >
              + New Group
            </button>
          </>
        ) : selectedGroupId !== SELECT_NEW ? (
          /* ── Has groups: dropdown ── */
          <>
            <select
              id="group-dropdown"
              className="w-full rounded-2xl border px-3 py-2 outline-none
                        bg-white dark:bg-neutral-900
                        border-neutral-200 dark:border-neutral-800
                        text-neutral-700 dark:text-neutral-300
                        focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              value={selectedGroupId}
              onChange={onGroupChange}
            >
              {recentGroups.length > 0 && (
                <optgroup label="Recently used">
                  {recentGroups.map(g => (
                    <option key={`recent-${g.id}`} value={g.id}>{g.groupName}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All groups">
                {alphaGroups.map(g => (
                  <option key={`all-${g.id}`} value={g.id}>{g.groupName}</option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              onClick={() => setSelectedGroupId(SELECT_NEW)}
              className="w-full rounded-2xl border border-dashed border-blue-600 dark:border-blue-400
                        px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400
                        hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors cursor-pointer"
            >
              + New Group
            </button>
          </>
        ) : (
          /* ── New group input ── */
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="new-group-input"
                className="text-neutral-700 dark:text-neutral-300"
              >
                New Group Name
              </label>
              <button
                type="button"
                onClick={() => {
                  if (availableGroups.length > 0) {
                    setSelectedGroupId(alphaGroups[0]?.id ?? '');
                  } else {
                    setShowingNewGroupForm(false);
                  }
                }}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <input
              id="new-group-input"
              className="w-full rounded-2xl border px-3 py-2 outline-none
                        bg-white dark:bg-neutral-900
                        border-neutral-200 dark:border-neutral-800
                        text-neutral-900 dark:text-neutral-100
                        focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              value={newGroupInput}
              onChange={(e) => setNewGroupInput(e.target.value)}
              required
            />
          </div>
        )}

        <div className="space-y-1">
          <label
            htmlFor="bookmark-url"
            className="text-neutral-700 dark:text-neutral-300"
          >
            URL
          </label>
          <input
            id="bookmark-url"
            pattern={URL_PATTERN}
            className="w-full rounded-2xl border px-3 py-2 outline-none
                      bg-white dark:bg-neutral-900
                      border-neutral-200 dark:border-neutral-800
                      text-neutral-900 dark:text-neutral-100
                      focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="bookmark-name"
            className="text-neutral-700 dark:text-neutral-300"
          >
            Name (optional)
          </label>
          <input
            id="bookmark-name"
            className="w-full rounded-2xl border px-3 py-2 outline-none
                      bg-white dark:bg-neutral-900
                      border-neutral-200 dark:border-neutral-800
                      text-neutral-900 dark:text-neutral-100
                      focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="cursor-pointer w-full rounded-2xl px-4 py-2 font-semibold transition
                    bg-blue-600 hover:bg-blue-500 text-white"
        >
          Add Bookmark
        </button>
      </form>
    </div>
  );
  /* ---------------------------------------------------------- */
}
