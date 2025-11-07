import { getUserStorageKey } from '@/core/utils/utilities';
import { StorageMode } from '@/core/constants/storageMode';
import type { StorageModeType } from '@/core/constants/storageMode';
import type { WorkspaceIdType } from '@/core/constants/workspaces';
import type { BookmarkGroupType } from '@/core/types/bookmarks';
import { fetchAuthSession } from 'aws-amplify/auth';
import amplifyOutputs from '../../amplify_outputs.json';

/**
 * Shape of the storage strategy implementations.
 */
interface StorageStrategy {
  load: (userId: string, workspaceId: WorkspaceIdType) => Promise<BookmarkGroupType[]>;
  save: (data: BookmarkGroupType[], userId: string, workspaceId: WorkspaceIdType) => Promise<unknown>;
  delete: (userId: string, workspaceId: WorkspaceIdType) => Promise<void>;
}

const API_INVOKE_URL: string = amplifyOutputs.custom.API.bookmarks.endpoint;

const chromeStorageStrategy: StorageStrategy = {
  /**
   * Load bookmark groups for a user/workspace pair from chrome.storage.local.
   *
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace to scope the storage key.
   * @returns Stored bookmarks array (empty when missing).
   */
  async load(userId: string, workspaceId: WorkspaceIdType): Promise<BookmarkGroupType[]> {
    const userStorageKey = getUserStorageKey(userId, workspaceId);
    const result = await chrome.storage.local.get(userStorageKey);
    return (result[userStorageKey] as BookmarkGroupType[] | undefined) ?? [];
  },
  /**
   * Persist bookmark groups to chrome.storage.local for the given user/workspace.
   *
   * @param data Bookmark payload to persist.
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace to scope the storage key.
   */
  async save(data: BookmarkGroupType[], userId: string, workspaceId: WorkspaceIdType): Promise<void> {
    const userStorageKey = getUserStorageKey(userId, workspaceId);
    await chrome.storage.local.set({ [userStorageKey]: data });
  },
  /**
   * Remove bookmark data for a user/workspace from chrome.storage.local.
   *
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace to scope the storage key.
   */
  async delete(userId: string, workspaceId: WorkspaceIdType): Promise<void> {
    const userStorageKey = getUserStorageKey(userId, workspaceId);
    await chrome.storage.local.remove(userStorageKey);
  },
};

const remoteStorageStrategy: StorageStrategy = {
  /**
   * Retrieve bookmark groups from the remote API for the given user/workspace.
   *
   * @param userId Cognito user identifier.
   * @param workspaceId Workspace namespace for the request (reserved for future use).
   * @returns Remote bookmarks array (empty on error).
   */
  async load(userId: string, workspaceId: WorkspaceIdType): Promise<BookmarkGroupType[]> {
    void workspaceId; // currently unused but reserved for future multi-workspace remote support
    try {
      const { tokens } = await fetchAuthSession();
      if (!tokens) throw new Error('User is not authenticated.');
      const idToken = tokens.idToken?.toString();
      if (!idToken) throw new Error('No id token present.');

      const response = await fetch(`${API_INVOKE_URL}/bookmarks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load bookmarks: ${response.statusText}`);
      }

      const payload = (await response.json()) as BookmarkGroupType[];
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.error('Error loading bookmarks from remote storage:', error);
      return []; // Fallback to an empty array to prevent app crash
    }
  },

  /**
   * Persist bookmark groups to the remote API for the given user/workspace.
   *
   * @param data Bookmark payload to persist.
   * @param userId Cognito user identifier.
   * @param workspaceId Workspace namespace for the request (reserved for future use).
   */
  async save(data: BookmarkGroupType[], userId: string, workspaceId: WorkspaceIdType): Promise<unknown> {
    void workspaceId;
    try {
      const { tokens } = await fetchAuthSession();
      if (!tokens || !tokens.idToken) {
        throw new Error('User is not authenticated.');
      }
      const idToken = tokens.idToken.toString();

      const headers = {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(`${API_INVOKE_URL}/bookmarks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(`Failed to save bookmarks: ${errorData.message || response.statusText}`);
      }

      console.log('[Storage] Bookmarks saved successfully via API.');
      return response.json();
    } catch (error) {
      console.error('Error saving bookmarks to remote storage:', error);
      throw error;
    }
  },

  /**
   * Remove bookmark data from the remote API for the given user/workspace.
   *
   * @param userId Cognito user identifier.
   * @param workspaceId Workspace namespace for the request (reserved for future use).
   */
  async delete(userId: string, workspaceId: WorkspaceIdType): Promise<void> {
    void workspaceId;
    try {
      const { tokens } = await fetchAuthSession();
      if (!tokens) throw new Error('User is not authenticated.');
      const idToken = tokens.idToken?.toString();
      if (!idToken) throw new Error('No id token present.');

      const response = await fetch(`${API_INVOKE_URL}/bookmarks`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete bookmarks: ${response.statusText}`);
      }

      console.log('[Storage] Bookmarks deleted successfully via API.');
    } catch (error) {
      console.error('Error deleting bookmarks from remote storage:', error);
      throw error;
    }
  },
};

// --- Main Storage Class ---

export class Storage {
  private strategy: StorageStrategy;

  /**
   * Create a storage wrapper bound to either the local or remote strategy.
   *
   * @param type Desired storage mode (`local` or `remote`).
   */
  constructor(type: StorageModeType = StorageMode.LOCAL) {
    this.strategy = type === StorageMode.REMOTE ? remoteStorageStrategy : chromeStorageStrategy;
  }

  /**
   * Load bookmarks via the configured storage strategy.
   *
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace.
   */
  load(userId: string, workspaceId: WorkspaceIdType): Promise<BookmarkGroupType[]> {
    return this.strategy.load(userId, workspaceId);
  }

  /**
   * Persist bookmarks via the configured storage strategy.
   *
   * @param data Bookmark payload.
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace.
   */
  save(data: BookmarkGroupType[], userId: string, workspaceId: WorkspaceIdType): Promise<unknown> {
    return this.strategy.save(data, userId, workspaceId);
  }

  /**
   * Delete bookmarks via the configured storage strategy.
   *
   * @param userId Cognito or local user identifier.
   * @param workspaceId Workspace namespace.
   */
  delete(userId: string, workspaceId: WorkspaceIdType): Promise<void> {
    return this.strategy.delete(userId, workspaceId);
  }
}
