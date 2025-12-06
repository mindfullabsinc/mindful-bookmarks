/**
 * Build the chrome.storage key used to persist bookmarks for a specific user.
 *
 * @param userId Identifier for the user whose bookmarks are being stored.
 * @param workspaceId Workspace namespace that scopes the stored data.
 * @returns Namespaced storage key string.
 */
export function getUserStorageKey(userId: string, workspaceId: string): string {
  return `WS_${workspaceId}__${getGroupsStorageKey(userId)}`;
}

export function getGroupsStorageKey(userId: string): string {
  return `bookmarks_${userId}`
}