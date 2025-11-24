import { CHROME_NEW_TAB } from '@/core/constants/constants';

/**
 * Build the chrome.storage key used to persist bookmarks for a specific user.
 *
 * @param userId Identifier for the user whose bookmarks are being stored.
 * @param workspaceId Workspace namespace that scopes the stored data.
 * @returns Namespaced storage key string.
 */
export function getUserStorageKey(userId: string, workspaceId: string): string {
  return `WS_${workspaceId}__bookmarks_${userId}`;
}
/**
 * Generate a short pseudo-random identifier suitable for local keys.
 *
 * @returns Random alphanumeric identifier.
 */
export function createUniqueID (): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

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
 * Determine whether the currently active tab is the Mindful new tab page.
 *
 * @returns Promise resolving to true when the active tab is the new tab.
 */
export const isCurrentTabTheNewTab = () => {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      var currentTab = tabs[0];
      if (currentTab.url === CHROME_NEW_TAB) {
        // This is the new tab page
        resolve(true);
      } else {
        resolve(false);
      } 
    });
  });
}

/**
 * Notify every Mindful surface that bookmarks changed,
 * then (optionally) hard-refresh any known tabs.
 *
 * @returns Promise that resolves once notifications are dispatched.
 */
export async function refreshOtherMindfulTabs() {
  // 1) Broadcast to all extension views (popup, new tab, options, background)
  if (chrome?.runtime?.sendMessage) {
    await chrome.runtime.sendMessage({ type: 'MINDFUL_BOOKMARKS_UPDATED' })
      .catch(() => { /* no listener is fine — silence this */ });
  }

  // 2) Broadcast to any non-extension pages that might be listening
  try {
    const bc = new BroadcastChannel('mindful');
    bc.postMessage({ type: 'MINDFUL_BOOKMARKS_UPDATED' });
    bc.close();
  } catch (e) {
    // BroadcastChannel not available or blocked (ok to ignore)
  }

  // 3) Reload all NewTab tabs except for the active one 
  // Wrap in try/catch so it’s a no-op without "tabs" permission.
  try {
    const tabs = await chrome.tabs.query({
      url: [
        'chrome-extension://*/newtab.html',
        'chrome-extension://*/options.html',
      ],
    });

    // Get the active tab id up front
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTabId = activeTabs[0]?.id;
  
    for (const t of tabs) {
      if ((t.id !== undefined) && (t.id !== activeTabId)) {
        chrome.tabs
          .reload(t.id)
          .catch((err) => {
            // Handle only reload errors (not query errors)
            console.warn(`Failed to reload tab ${t.id}:`, err);
          });
      }
    }
  } catch (err) {
    // Handle query-level errors (e.g., no "tabs" permission)
    console.warn("Unable to query tabs:", err);
  }
}

/**
 * Reload the currently active browser tab when it is displaying the Mindful new tab page.
 *
 * @returns Promise that resolves after attempting the reload.
 */
export async function refreshActiveMindfulTab() {
  // Reload the current active tab if it is pointed to newtab (aka Mindful page)
  const tabs = await chrome.tabs.query({}); // Promise<Tab[]>
  for (const tab of tabs) {
    if (tab.active && tab.url === CHROME_NEW_TAB && tab.id !== undefined) {
      await chrome.tabs.reload(tab.id); // tab.id narrowed to number
    }
  }
}

/**
 * Convert a phone number into E.164 format, assuming +1 when ten digits are provided.
 *
 * @param p Raw phone number string.
 * @returns Normalized E.164 phone number.
 */
export function toE164(p: string): string {
  if (!p) return "";
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
