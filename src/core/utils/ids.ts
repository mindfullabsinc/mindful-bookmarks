/**
 * Generate a short pseudo-random identifier suitable for local keys.
 *
 * @returns Random alphanumeric identifier.
 */
export function createUniqueID (): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}