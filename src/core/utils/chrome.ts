import { CHROME_NEW_TAB } from '@/core/constants/constants';
import { BrowserSourceService, RawItem } from "@/scripts/import/smartImport";

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

