/**
 * @file phone.test.ts
 * Tests for core utils in "@/core/utils/phone".
 *
 * Covers:
 *  - toE164
 */

import { toE164 } from "@/core/utils/phone";

describe('toE164', () => {
  it('returns empty string for falsy input', () => {
    expect(toE164('')).toBe('');
  });

  it('passes through when already E.164', () => {
    expect(toE164('+15551234567')).toBe('+15551234567');
  });

  it('assumes +1 for 10-digit US numbers', () => {
    expect(toE164('(555) 123-4567')).toBe('+15551234567');
  });

  it('prefixes + for non-10-digit numbers after stripping non-digits', () => {
    // Note: this function intentionally does not try to interpret international prefixes
    expect(toE164('011 44 20 7946 0958')).toBe('+011442079460958');
  });
});