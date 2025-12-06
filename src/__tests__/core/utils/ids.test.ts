/**
 * @file ids.test.ts
 * Tests for utils in "@/core/utils/ids".
 *
 * Covers:
 *  - createUniqueID
 */
import { createUniqueID } from "@/core/utils/ids";


describe('createUniqueID', () => {
  it('returns a 12-char lowercase base36 string (two 6-char chunks)', () => {
    const id = createUniqueID();
    expect(id).toMatch(/^[a-z0-9]{12}$/);
  });

  it('produces different values on multiple calls (very likely)', () => {
    const set = new Set<string>(Array.from({ length: 20 }, () => createUniqueID()));
    expect(set.size).toBe(20);
  });
});