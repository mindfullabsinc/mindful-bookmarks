/**
 * @file utilities.test.ts
 * Tests for core utils in "@/core/utils/utilities".
 *
 * Covers:
 *  - getUserStorageKey
 *  - createUniqueID
 *  - constructValidURL
 *  - normalizeUrl
 *  - isCurrentTabTheNewTab
 *  - refreshOtherMindfulTabs
 *  - refreshActiveMindfulTab
 *  - toE164
 */

import {
  getUserStorageKey,
  createUniqueID,
  constructValidURL,
  normalizeUrl,
  isCurrentTabTheNewTab,
  refreshOtherMindfulTabs,
  refreshActiveMindfulTab,
  toE164,
} from '@/core/utils/utilities';

// Force a stable expected new tab URL for tests
jest.mock('@/core/constants/constants', () => ({
  __esModule: true,
  CHROME_NEW_TAB: 'chrome://newtab/',
}));

/* -------------------- Chrome + BroadcastChannel Shims -------------------- */
// Lightweight shims that support both callback-style and Promise-style query().
type Tab = { id?: number; url?: string; active?: boolean };

const makeQueryMock = (tabsToReturn: Tab[] = []) =>
  jest.fn((queryOrCb: any, maybeCb?: (tabs: Tab[]) => void) => {
    // Support callback style: chrome.tabs.query(filter, cb)
    if (typeof maybeCb === 'function') {
      maybeCb(tabsToReturn);
      return;
    }
    // Support promise style: await chrome.tabs.query(filter)
    return Promise.resolve(tabsToReturn);
  });

const makeReloadMock = () => jest.fn(() => Promise.resolve());

const makeSendMessageMock = () => jest.fn(() => Promise.resolve());

let bcInstance: { postMessage: jest.Mock; close: jest.Mock };
let BroadcastChannelMock: jest.Mock;

beforeAll(() => {
  // @ts-ignore
  global.chrome = global.chrome || {};
  // @ts-ignore
  global.chrome.runtime = global.chrome.runtime || {};
  // @ts-ignore
  global.chrome.runtime.sendMessage = makeSendMessageMock();

  // @ts-ignore
  global.chrome.tabs = global.chrome.tabs || {};
  // query/reload are assigned per-test in beforeEach to control returns
  // @ts-ignore
  global.chrome.tabs.query = makeQueryMock([]);
  // @ts-ignore
  global.chrome.tabs.reload = makeReloadMock();

  // Factory-style constructor mock
  bcInstance = { postMessage: jest.fn(), close: jest.fn() };
  BroadcastChannelMock = jest.fn().mockImplementation(() => bcInstance);
  // @ts-ignore
  global.BroadcastChannel = BroadcastChannelMock;
});

beforeEach(() => {
  jest.clearAllMocks();

  // reset bc instance mocks
  bcInstance.postMessage.mockReset();
  bcInstance.close.mockReset();

  // Reset default query to return an empty list unless a test overrides it
  // @ts-ignore
  global.chrome.tabs.query = makeQueryMock([]);
  // @ts-ignore
  global.chrome.tabs.reload = makeReloadMock();
  // @ts-ignore
  global.chrome.runtime.sendMessage = makeSendMessageMock();
});

afterAll(() => {
  // @ts-ignore
  delete global.BroadcastChannel;
});

/* -------------------- Unit Tests -------------------- */

describe('getUserStorageKey', () => {
  it('builds namespaced key by workspace and user', () => {
    expect(getUserStorageKey('user-1', 'ws-a')).toBe('WS_ws-a__bookmarks_user-1');
  });
});

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

describe('constructValidURL', () => {
  it('prepends http:// when protocol is missing', () => {
    expect(constructValidURL('example.com')).toBe('http://example.com');
  });

  it('leaves http and https URLs unchanged', () => {
    expect(constructValidURL('http://foo.com')).toBe('http://foo.com');
    expect(constructValidURL('https://bar.org')).toBe('https://bar.org');
  });
});

describe('normalizeUrl', () => {
  it('normalizes case, strips default ports, removes hash, collapses slashes, sorts query', () => {
    const input = 'HTTPS://Example.com:443//foo///bar/?b=2&a=1#frag';
    const out = normalizeUrl(input);
    expect(out).toBe('https://example.com/foo/bar?a=1&b=2');
  });

  it('keeps non-default ports', () => {
    const input = 'http://EXAMPLE.com:8080/path/';
    const out = normalizeUrl(input);
    expect(out).toBe('http://example.com:8080/path');
  });

  it('returns trimmed input if URL parsing fails', () => {
    const input = '   not a url   ';
    expect(normalizeUrl(input)).toBe('not a url');
  });

  it('removes trailing slash from path except root', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo');
  });
});

describe('isCurrentTabTheNewTab', () => {
  it('resolves true when active tab URL matches CHROME_NEW_TAB', async () => {
    // @ts-ignore
    global.chrome.tabs.query = makeQueryMock([{ url: 'chrome://newtab/' }]);
    await expect(isCurrentTabTheNewTab()).resolves.toBe(true);
  });

  it('resolves false when active tab URL differs', async () => {
    // @ts-ignore
    global.chrome.tabs.query = makeQueryMock([{ url: 'https://example.com' }]);
    await expect(isCurrentTabTheNewTab()).resolves.toBe(false);
  });
});

describe('refreshOtherMindfulTabs', () => {
  it('broadcasts runtime + BroadcastChannel and reloads matching extension tabs', async () => {
    // Return two extension tabs, one with id
    const tabs: Tab[] = [
      { id: 10, url: 'chrome-extension://abc/newtab.html' },
      { id: 11, url: 'chrome-extension://abc/options.html' },
    ];
    // @ts-ignore
    global.chrome.tabs.query = jest.fn(() => Promise.resolve(tabs));
    // @ts-ignore
    const reloadMock = (global.chrome.tabs.reload as jest.Mock);

    await refreshOtherMindfulTabs();

    // runtime message sent
    expect(BroadcastChannelMock).toHaveBeenCalledWith('mindful');

    expect(bcInstance.postMessage).toHaveBeenCalledWith({
      type: 'MINDFUL_BOOKMARKS_UPDATED',
    });
    expect(bcInstance.close).toHaveBeenCalled();

    // Tabs queried with URL filters and each tab reloaded
    // @ts-ignore
    expect(global.chrome.tabs.query).toHaveBeenCalledWith({
      url: [
        'chrome-extension://*/newtab.html',
        'chrome-extension://*/options.html',
      ],
    });
    expect(reloadMock).toHaveBeenCalledTimes(1);  // reload the second Mindful tab but not the active one
    expect(reloadMock).toHaveBeenNthCalledWith(1, 11);  
  });

  it('swallows query errors (no tabs permission) gracefully', async () => {
    // @ts-ignore
    global.chrome.tabs.query = jest.fn(() => Promise.reject(new Error('No permission')));
    await expect(refreshOtherMindfulTabs()).resolves.toBeUndefined();

    // runtime message still attempted
    // @ts-ignore
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalled();
    // reload not called because query failed
    // @ts-ignore
    expect(global.chrome.tabs.reload).not.toHaveBeenCalled();
  });
});

describe('refreshActiveMindfulTab', () => {
  it('reloads only the active tab when it is the new tab page', async () => {
    const tabs: Tab[] = [
      { id: 1, url: 'https://example.com', active: false },
      { id: 2, url: 'chrome://newtab/', active: true },
    ];
    // @ts-ignore
    global.chrome.tabs.query = jest.fn(() => Promise.resolve(tabs));
    // @ts-ignore
    const reloadMock = (global.chrome.tabs.reload as jest.Mock);

    await refreshActiveMindfulTab();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledWith(2);
  });

  it('does nothing when active tab is not the new tab page', async () => {
    const tabs: Tab[] = [{ id: 3, url: 'https://example.com', active: true }];
    // @ts-ignore
    global.chrome.tabs.query = jest.fn(() => Promise.resolve(tabs));
    // @ts-ignore
    const reloadMock = (global.chrome.tabs.reload as jest.Mock);

    await refreshActiveMindfulTab();

    expect(reloadMock).not.toHaveBeenCalled();
  });
});

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
