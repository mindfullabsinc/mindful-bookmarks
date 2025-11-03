import { CHROME_NEW_TAB } from '@/core/constants/Constants';

/**
 * Build the chrome.storage key used to persist bookmarks for a specific user.
 *
 * @param userId Identifier for the user whose bookmarks are being stored.
 * @returns Namespaced storage key string.
 */
export function getUserStorageKey(userId: string): string {
  return `bookmarks_${userId}`;
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

  // 3) (Optional) If you already reload tabs, keep doing it here.
  // Wrap in try/catch so it’s a no-op without "tabs" permission.
  try {
    const tabs = await chrome.tabs.query({
      url: [
        'chrome-extension://*/newtab.html',
        'chrome-extension://*/options.html',
      ],
    });
  
    for (const t of tabs) {
      if (t.id !== undefined) {
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
