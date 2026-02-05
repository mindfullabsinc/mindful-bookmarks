/**
 * @file storageKeys.test.ts
 * Tests for utils in "@/core/utils/storageKeys".
 *
 * Covers:
 *  - getUserStorageKey
 */
import { getUserStorageKey } from "@/core/utils/storageKeys";


describe('getUserStorageKey', () => {
  it('builds namespaced key by workspace and user', () => {
    expect(getUserStorageKey('user-1', 'ws-a')).toBe('WS_ws-a__bookmarks_user-1');
  });
});