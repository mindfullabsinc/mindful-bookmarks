/* -------------------- Imports -------------------- */
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';

/* Hooks and Utilities */
import { AppContext } from "@/scripts/AppContextProvider";
import type { AppContextValue } from "@/scripts/AppContextProvider";
import { constructValidURL } from '@/core/utils/utilities';
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
    await addNamedBookmark(name.trim(), urlWithProtocol, groupNameToUse);

    if (selectedGroupId === SELECT_NEW) {
      // 3) Try to resolve the **id** briefly; if found, overwrite storage and rebroadcast with id
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
      }
    } else {
      // Existing group path: persist id and broadcast id
      writeLastSelectedGroup(key, selectedGroupId);
      broadcastLastSelectedGroup({
        workspaceId: activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID,
        groupId: selectedGroupId,
      });
    }

    try { if (chrome?.runtime?.id) window.close(); } catch {}
  };

  // Build options from whichever list is currently available (value = **id**)
  const groupOptions = useMemo<React.ReactElement[]>(
    () =>
      availableGroups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.groupName}
        </option>
      )),
    [availableGroups]
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /**
   * Reset the one-time selection when the storage scope changes.
   */
  useEffect(() => {
    choseInitialRef.current = false;
  }, [scopeKey]);

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
          {groupOptions}
          <option value={SELECT_NEW}>New Group</option>
        </select>

        {selectedGroupId === SELECT_NEW && (
          <div className="space-y-1">
            <label
              htmlFor="new-group-input"
              className="text-neutral-700 dark:text-neutral-300"
            >
              New Group Name
            </label>
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
            htmlFor="bookmark-name"
            className="text-neutral-700 dark:text-neutral-300"
          >
            Name
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
            required
          />
        </div>

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
