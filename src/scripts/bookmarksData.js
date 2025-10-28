// src/scripts/bookmarksData.js
import { Storage } from "@/scripts/Storage";
import { StorageType } from "@/scripts/Constants";


/**
 * Load the initial bookmark groups.
 * 
 * @param {string|null} userId
 * @param {StorageType} storageType
 * @param {{ noLocalFallback?: boolean }} opts
 */
export async function loadInitialBookmarks(userId, storageType, opts = {}) {
  const { noLocalFallback = false } = opts;

  if (!userId) return [];

  // LOCAL mode: read from chrome.storage.local as usual
  if (storageType === StorageType.LOCAL) {
    const localStore = new Storage(StorageType.LOCAL);
    try {
      return (await localStore.load(userId)) ?? [];
    } catch {
      return [];
    }
  }

  // REMOTE mode: try remote first
  const remoteStore = new Storage(StorageType.REMOTE);
  try {
    const remote = await remoteStore.load(userId);
    // remoteStorageStrategy.load already returns [] on error, so just return
    // whatever it gave us (array or empty)
    if (noLocalFallback) return remote ?? [];
    // optional fallback to LOCAL if you allow it
    if (remote && remote.length) return remote;
  } catch {
    // swallow – we'll consider fallback below (if allowed)
  }

  // Only reach here if remote failed or was empty.
  // If you said "no local fallback", return [] and DO NOT show local cache.
  if (noLocalFallback) return [];

  // Fallback to LOCAL (only when explicitly allowed by the caller)
  try {
    const localStore = new Storage(StorageType.LOCAL);
    return (await localStore.load(userId)) ?? [];
  } catch {
    return [];
  }
}