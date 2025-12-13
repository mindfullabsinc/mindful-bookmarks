/**
 * Simple helper to return a capitalized version of a string.
 *
 * @param str String identifier to convert.
 * @returns Original string with its first letter capitalized.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}