// src/scripts/bookmarksData.js
import { Storage } from "@/scripts/Storage";

export async function loadInitialBookmarks(userId, storageType) {
  if (!userId) return [];
  const storage = new Storage(storageType);
  return storage.load(userId);
}