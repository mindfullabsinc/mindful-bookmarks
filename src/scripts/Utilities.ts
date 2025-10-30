import { CHROME_NEW_TAB } from './Constants';


export function getUserStorageKey(userId: string): string {
  return `bookmarks_${userId}`;
}

export function createUniqueID() {
  return Date.now() + Math.random();
}

export function constructValidURL(url: string): string {
  // Check if the URL is missing the protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Prepend the protocol to the URL
    const urlWithProtocol = `http://${url}`;
    return urlWithProtocol;
  } else {
    return url;
  }
  // if (!/^https?:\/\//i.test(url)) {
  //   url = 'http://' + url;
  // }
  // url = new URL(url);
  // if (!/^www\./i.test(url.hostname)) {
  //   url.hostname = 'www.' + url.hostname;
  // }
  // return url.href;
}

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

export async function refreshActiveMindfulTab() {
  // Reload the current active tab if it is pointed to newtab (aka Mindful page)
  const tabs = await chrome.tabs.query({}); // Promise<Tab[]>
  for (const tab of tabs) {
    if (tab.active && tab.url === CHROME_NEW_TAB && tab.id !== undefined) {
      await chrome.tabs.reload(tab.id); // tab.id narrowed to number
    }
  }
}

export function toE164(p: string): string {
  if (!p) return "";
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}