// src/__tests__/pages/PopupPage.local.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import PopupPage from '@/pages/PopupPage';


/* -------------------- Minimal component mocks -------------------- */
// Keep PopUpComponent tiny & observable so we don't pull in its dependencies.
jest.mock('@/components/PopUpComponent', () => ({
  __esModule: true,
  default: () => <div data-testid="popup-component">PopUpComponent</div>,
}));

// Intercept AppContextProvider to verify preferredStorageMode="local"
type CapturedAppCtxCall = { preferredStorageMode?: string; user?: unknown };
const appCtxCalls: CapturedAppCtxCall[] = [];

jest.mock('@/scripts/AppContextProvider', () => {
  const React = require('react');
  const AppContextProvider = ({
    children,
    preferredStorageMode = 'local',
    user = null,
  }: {
    children: React.ReactNode;
    preferredStorageMode?: string;
    user?: unknown;
  }) => {
    appCtxCalls.push({ preferredStorageMode, user });
    return (
      <div
        data-testid="app-context"
        data-storage-mode={preferredStorageMode}
        data-user={user ? 'true' : 'false'}
      >
        {children}
      </div>
    );
  };
  return { __esModule: true, AppContextProvider };
});

/* -------------------- Browser/Chrome API shims -------------------- */
const mockTabsCreate = jest.fn((_opts: unknown, cb?: () => void) => cb && cb());
const mockGetURL = jest.fn((p: string) => `chrome-extension://test-ext/${p}`);

beforeAll(() => {
  const chromeShim = {
    runtime: {
      id: 'test-ext-id',
      getURL: mockGetURL,
      lastError: undefined,
      sendMessage: jest.fn(),
    },
    tabs: {
      create: mockTabsCreate,
      query: jest.fn(
        (_opts: unknown, cb: (tabs: Array<{ url: string; title: string }>) => void) =>
          cb([{ url: 'https://example.com', title: 'Mock Tab Title' }])
      ),
      reload: jest.fn(),
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),            // default: no stored mode
        set: jest.fn().mockResolvedValue(undefined),
      },
    },
    extension: {
      getViews: jest.fn().mockReturnValue([]),
    },
  } as any; // 👈 prevent TS from enforcing full chrome typings

  // Assign as any to avoid full type constraint on global.chrome
  (global as any).chrome = chromeShim;

  // window.close is called after opening the Mindful tab
  (window as any).close = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
  appCtxCalls.length = 0;
});

describe('PopupPage (local-only mode)', () => {
  it('renders PopUpComponent wrapped in AppContextProvider with preferredStorageMode="local"', async () => {
    render(<PopupPage />);

    // PopupPage returns null until it has loaded mode/ready → wait for child
    const pop = await screen.findByTestId('popup-component');
    expect(pop).toBeInTheDocument();

    // AppContextProvider was used and forced to local-only mode
    const ctx = screen.getByTestId('app-context');
    expect(ctx).toHaveAttribute('data-storage-mode', 'local');

    // Also confirm via captured props to guard regressions
    expect(appCtxCalls.length).toBeGreaterThan(0);
    expect(appCtxCalls[0].preferredStorageMode).toBe('local');
    expect(appCtxCalls[0].user).toBeNull();
  });

  it('clicking "Open Mindful" opens newtab.html and closes the popup', async () => {
    render(<PopupPage />);
    await screen.findByTestId('popup-component');

    const btn = screen.getByRole('button', { name: /open mindful/i });
    fireEvent.click(btn);

    expect(mockGetURL).toHaveBeenCalledWith('newtab.html');
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    const callArg = mockTabsCreate.mock.calls[0][0] as { url: string };
    expect(callArg).toMatchObject({ url: 'chrome-extension://test-ext/newtab.html' });

    // window.close() is called after tabs.create callback
    expect((window as any).close).toHaveBeenCalledTimes(1);
  });

  it('if storage explicitly contains ANON, still renders local-only', async () => {
    (global.chrome.storage.local.get as jest.Mock).mockResolvedValueOnce({
      mindful_auth_mode: 'ANON',
    });

    render(<PopupPage />);
    await screen.findByTestId('popup-component');

    const ctx = screen.getByTestId('app-context');
    expect(ctx).toHaveAttribute('data-storage-mode', 'local');
  });
});
