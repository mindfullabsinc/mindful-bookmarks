import { WorkspaceIdType } from "../constants/workspaces";

// src/core/utils/lastSelectedGroup.ts
export const SELECT_NEW = '__NEW_GROUP__';

/**
 * Generate the localStorage key that tracks the last-selected group for a user/workspace combo.
 *
 * @param userId Cognito or local user id.
 * @param storageMode Active storage mode (`local` or `remote`).
 * @param workspaceId Workspace identifier.
 * @returns Scoped persistence key.
 */
export const lastGroupKey = (
  userId?: string | null,
  storageMode?: string | null,
  workspaceId?: WorkspaceIdType | null
) => `mindful:lastSelectedGroup:${userId || 'local'}:${storageMode || 'local'}:${workspaceId || 'default'}`;

/**
 * Persist the last-selected group identifier for a scoped user/workspace combo.
 *
 * @param key LocalStorage key produced by `lastGroupKey`.
 * @param groupId Group identifier to store (new group uses `SELECT_NEW`).
 */
export function writeLastSelectedGroup(key: string, groupId: string) {
  try { localStorage.setItem(key, groupId || ''); } catch {}
}

/**
 * Read the last-selected group identifier for a scope.
 *
 * @param key LocalStorage key produced by `lastGroupKey`.
 * @returns Stored group id or empty string when none exists.
 */
export function readLastSelectedGroup(key: string) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

/**
 * Broadcast last-selected group changes to all extension contexts.
 *
 * @param payload Workspace identifier and optional group metadata to sync.
 */
export function broadcastLastSelectedGroup(payload: {
  workspaceId: string;
  groupId?: string;     // now optional
  groupName?: string;   // new optional fallback
}) {
  try {
    const chan = new BroadcastChannel('MINDFUL_UI');
    chan.postMessage({ type: 'MINDFUL_LAST_GROUP_CHANGED', ...payload });
    chan.close?.();
  } catch {}

  try {
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage({
        type: 'MINDFUL_LAST_GROUP_CHANGED',
        ...payload,
      });
    }
  } catch {}
}
