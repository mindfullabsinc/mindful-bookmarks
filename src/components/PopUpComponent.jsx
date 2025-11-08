// PopUpComponent.jsx
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';

/* Hooks and Utilities */
import { AppContext } from "@/scripts/AppContextProvider";
import { constructValidURL } from '@/core/utils/utilities';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

/* Constants */
import { URL_PATTERN, EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';

/* ----------------------- Helpers ----------------------- */
const SELECT_NEW = '__NEW_GROUP__';

/** Build a per-user/per-storage/per-workspace key so scopes don't collide. */
const lastGroupKey = (userId, storageMode, workspaceId) =>
  `mindful:lastSelectedGroup:${userId || 'local'}:${storageMode || 'local'}:${workspaceId || 'default'}`;

const safeRead = (key) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};
const safeWrite = (key, v) => {
  try { localStorage.setItem(key, v || ''); } catch {}
};

/** Try to resolve a stored value to a valid group id.
 *  - Prefers direct id match
 *  - Falls back to legacy "stored name" match (for migration)
 */
function resolveStoredToGroupId(storedValue, groups) {
  if (!storedValue) return '';
  const byId = groups.find(g => g.id === storedValue);
  if (byId) return byId.id;
  const byName = groups.find(g => g.groupName === storedValue); // legacy path
  return byName ? byName.id : '';
}

export default function PopUpComponent() {
  // Pull the fast index and the hydrated groups from context
  const { groupsIndex, bookmarkGroups, userId, storageMode, activeWorkspaceId, currentWorkspaceId, workspaceId } =
    useContext(AppContext);

  // Prefer whatever your context calls it; fall back sanely
  const wsId = activeWorkspaceId || currentWorkspaceId || workspaceId || 'default';

  // Actions
  const { addNamedBookmark } = useBookmarkManager();

  // Selection state (store **id**; not name)
  const [selectedGroupId, setSelectedGroupId] = useState(SELECT_NEW);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  // Only choose a default once per scope (userId+storageMode+workspaceId)
  const choseInitialRef = useRef(false);
  const scopeKey = `${userId || 'local'}::${storageMode || 'local'}::${wsId}`;

  // Resolve available groups quickly (use the small index immediately; hydrate later)
  const availableGroups = useMemo(() => {
    const base = (groupsIndex?.length ? groupsIndex : bookmarkGroups) || [];
    return base.filter((g) => g.groupName !== EMPTY_GROUP_IDENTIFIER);
  }, [groupsIndex, bookmarkGroups]);

  // Reset when scope changes
  useEffect(() => {
    choseInitialRef.current = false;
  }, [scopeKey]);

  // Pick a stable initial selection exactly once per scope:
  // 1) If stored id/name exists and is still valid, keep it.
  // 2) Else choose the first available group's **id**.
  // 3) Else wait (do not lock to "new").
  useEffect(() => {
    if (choseInitialRef.current) return;
    if (!storageMode) return; // wait until scope is known

    const key = lastGroupKey(userId, storageMode, wsId);
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
  }, [availableGroups, userId, storageMode, wsId]);

  // Keep the selection stable and persisted on user changes (store **id**)
  const onGroupChange = (e) => {
    const val = e.target.value; // id or SELECT_NEW
    setSelectedGroupId(val);
    const key = lastGroupKey(userId, storageMode, wsId);
    if (val !== SELECT_NEW) safeWrite(key, val);
    choseInitialRef.current = true;
  };

  // Prefill current tab URL and Title
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

  const handleSubmit = async (event) => {
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

    // Persist the user's last choice (id) so next popup opens with it selected
    const key = lastGroupKey(userId, storageMode, wsId);
    if (selectedGroupId !== SELECT_NEW) safeWrite(key, selectedGroupId);

    await addNamedBookmark(name.trim(), urlWithProtocol, groupNameToUse);

    // Optional: close the popup after successful submission (avoid in tests)
    try { if (chrome?.runtime?.id) window.close(); } catch {}
  };

  // Build options from whichever list is currently available (value = **id**)
  const groupOptions = useMemo(
    () =>
      availableGroups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.groupName}
        </option>
      )),
    [availableGroups]
  );

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
}
