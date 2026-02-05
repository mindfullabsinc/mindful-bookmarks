/**
 * Ensure a URL string includes an explicit protocol, defaulting to http:// when missing.
 *
 * @param url Raw URL string provided by the user.
 * @returns Normalized URL string with protocol prepended if necessary.
 */
export function constructValidURL(url: string): string {
  // Check if the URL is missing the protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Prepend the protocol to the URL
    const urlWithProtocol = `http://${url}`;
    return urlWithProtocol;
  } else {
    return url;
  }
}

/**
 * Normalize a URL string into a consistent, canonical form.
 *
 * Used primarily for bookmark de-duplication across workspaces.
 * The goal is to treat different textual representations of the same site
 * (e.g. differing in case, trailing slashes, default ports, or query order)
 * as equivalent.
 *
 * Behavior:
 *  - Lowercases hostnames.
 *  - Removes default ports (80 for http, 443 for https).
 *  - Removes fragment/hash (`#...`).
 *  - Collapses repeated slashes and removes a trailing slash (except for root).
 *  - Sorts query parameters alphabetically for deterministic comparison.
 *  - Returns the trimmed input unchanged if parsing fails.
 *
 * @param {string} input
 *   The raw URL string to normalize. May include whitespace or be partially malformed.
 *
 * @returns {string}
 *   A normalized, canonical URL string suitable for use in a Set/map key.
 *   If the input is invalid, returns the trimmed original string.
 *
 * @example
 * normalizeUrl("HTTPS://Example.com:443/foo/?b=2&a=1#frag")
 * // → "https://example.com/foo?a=1&b=2"
 */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    // Lowercase host, strip default ports, drop hash, keep query (users often care)
    u.hash = "";
    u.host = u.hostname.toLowerCase() + (u.port && !["80","443"].includes(u.port) ? `:${u.port}` : "");
    // Remove trailing slash for path (except root) and collapse multiple slashes
    u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    // Sort query keys for stable comparison
    if (u.search) {
      const sp = new URLSearchParams(u.search);
      const keys = [...sp.keys()].sort();
      const rebuilt = new URLSearchParams();
      keys.forEach(k => rebuilt.set(k, sp.get(k) ?? ""));
      u.search = rebuilt.toString() ? `?${rebuilt}` : "";
    }
    return u.toString();
  } catch {
    // If it's not a valid URL, fall back to trimmed input
    return input.trim();
  }
}

/**
 * Check whether a string begins with an HTTP or HTTPS scheme.
 *
 * @param u URL string to inspect.
 * @returns True when the string looks like an HTTP(S) URL.
 */
export function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}
