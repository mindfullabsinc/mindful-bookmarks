// src/__tests__/components/PopUpComponent.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// 🔁 Test the WRAPPER that handles Loading/Signed-out/Signed-in
import PopupPage from '@/pages/PopupPage';

// Mocks
import { getCurrentUser } from 'aws-amplify/auth';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';

// --------------------
// Shared mock data
// --------------------
const MOCK_BOOKMARK_GROUPS = [
  { id: '1', groupName: 'Tech' },
  { id: '2', groupName: 'Recipes' },
];

// --------------------
// Module mocks
// --------------------

// Mock Amplify.configure and the json it loads
jest.mock('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }));
jest.mock('/amplify_outputs.json', () => ({}), { virtual: true });

// Mock Amplify Auth
jest.mock('aws-amplify/auth');

// Provide a tiny AppContext + Provider so the inner component can consume groups
jest.mock('@/scripts/AppContextProvider', () => {
  const React = require('react');
    const AppContext = React.createContext({});
    const AppContextProvider = ({ children, user = null, preferredStorageMode = 'local' }) => (
      <AppContext.Provider
        value={{
          groupsIndex: [],
          bookmarkGroups: MOCK_BOOKMARK_GROUPS,
          userId: user?.userId || null,
          storageMode: preferredStorageMode, // <-- critical for PopUpComponent’s default selection
        }}
      >
        {children}
      </AppContext.Provider>
    );
  return { AppContext, AppContextProvider };
});

// Mock bookmark manager hook
jest.mock('@/hooks/useBookmarkManager', () => ({
  useBookmarkManager: jest.fn(() => ({ addNamedBookmark: jest.fn() })),
  loadInitialBookmarks: jest.fn(),
}));

// Utilities
jest.mock('@/core/utils/utilities', () => ({
  constructValidURL: jest.fn((url) => 'https://' + url.replace(/^https?:\/\//, '')),
})); 

// Mock Amplify Hub (avoid real listeners)
jest.mock('aws-amplify/utils', () => ({
  Hub: { listen: jest.fn(() => () => {}) },
}));

// Mock Amplify UI <Authenticator>, <ThemeProvider>, and useAuthenticator
// Mock Amplify UI <Authenticator>, <ThemeProvider>, and useAuthenticator
jest.mock('@aws-amplify/ui-react', () => {
  const React = require('react');
  const { getCurrentUser } = require('aws-amplify/auth');

  const ThemeProvider = ({ children }) => <>{children}</>;

  const Authenticator = ({ children }) => {
    const [state, setState] = React.useState('loading');
    const [user, setUser] = React.useState(null);

    React.useEffect(() => {
      let mounted = true;
      Promise.resolve()
        .then(() => getCurrentUser())
        .then((u) => { if (!mounted) return; setUser(u || { username: 'test' }); setState('signedIn'); })
        .catch(() => { if (!mounted) return; setState('signedOut'); });
      return () => { mounted = false; };
    }, []);

    if (state === 'loading') return <div>Loading...</div>;
    if (state === 'signedOut') return <div>Please sign in on the new tab page to add bookmarks.</div>;
    return typeof children === 'function' ? children({ user }) : children;
  };

  Authenticator.Provider = ({ children }) => <>{children}</>;

  const useAuthenticator = () => ({ route: 'signIn' });
  const createTheme = (obj = {}) => obj;

  return { ThemeProvider, Authenticator, useAuthenticator, createTheme };
});

jest.mock('@/analytics/AnalyticsProvider', () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));


// --------------------
// Browser API shims for JSDOM
// --------------------
global.chrome = {
  tabs: {
    query: jest.fn((opts, cb) => {
      cb([{ url: 'https://example.com', title: 'Mock Tab Title' }]);
    }),
  },
  runtime: { id: 'test-extension-id' }, // <-- allow PopUpComponent to call window.close()
};
global.window.close = jest.fn();

// keep tests isolated from persisted group selection across runs
afterEach(() => {
  try { localStorage.clear(); } catch {}
});

// --------------------
// Tests
// --------------------
describe('PopupPage Authentication Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows loading state initially', async () => {
    getCurrentUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ userId: 'u1' }), 0))
    );
    
    render(<PopupPage />);
    // Switch ANON → AUTH so the lazy <Authenticator> mounts
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    
    // Assert the initial loading UI from our mocked <Authenticator>
    expect(await screen.findByText(/Loading\.\.\./i)).toBeInTheDocument();
  
    // Allow it to resolve so the test doesn’t leave open handles
    await waitFor(() => expect(true).toBe(true));
  });

  test('shows "Please sign in" when user is not authenticated', async () => {
    getCurrentUser.mockRejectedValue(new Error('No user signed in'));
    render(<PopupPage />);
  
    // Switch to AUTH to render the mocked <Authenticator> signed-out view
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    
    expect(await screen.findByText(/Please sign in on the new tab page to add bookmarks\./i))
      .toBeInTheDocument();
  });
});

describe('PopUp form via PopupPage (signed-in)', () => {
  let mockAddNamedBookmark;

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({ userId: 'test-user-123', username: 'testuser' });

    // Override the default hook return to capture submissions
    mockAddNamedBookmark = jest.fn();
    useBookmarkManager.mockReturnValue({ addNamedBookmark: mockAddNamedBookmark });
  });

  test('renders the form with initial values from the current tab', async () => {
    render(<PopupPage />);

    // Switch to AUTH and allow mocked <Authenticator> to resolve to signed-in
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    // Form should be present with prefilled values from chrome.tabs.query
    expect(await screen.findByLabelText(/^name$/i)).toHaveValue('Mock Tab Title');
    expect(await screen.findByLabelText(/^url$/i)).toHaveValue('https://example.com');
  });

  test('populates the group dropdown and selects the first group by default', async () => {
    render(<PopupPage />);

    // Ensure AUTH chunk rendered
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    await screen.findByRole('option', { name: 'Tech' });

    const groupDropdown = screen.getByLabelText(/^group$/i);
    expect(groupDropdown).toHaveValue('Tech');
    expect(screen.getByRole('option', { name: 'Recipes' })).toBeInTheDocument();
  });

  test('shows and allows typing in the "New Group" input when selected', async () => {
    render(<PopupPage />);

    // Wait until the signed-in form is rendered
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    const groupDropdown = await screen.findByLabelText(/^group$/i);
    
    // Now that the form is present, confirm the conditional input is hidden
    expect(screen.queryByLabelText(/New Group Name/i)).not.toBeInTheDocument();
    
    fireEvent.change(groupDropdown, { target: { value: 'New Group' } });

    const newGroupInput = await screen.findByLabelText(/New Group Name/i);
    expect(newGroupInput).toBeInTheDocument();

    fireEvent.change(newGroupInput, { target: { value: 'My Cool Project' } });
    expect(newGroupInput).toHaveValue('My Cool Project');
  });

  test('submits with an existing group', async () => {
    render(<PopupPage />);
    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    const groupDropdown = await screen.findByLabelText(/^group$/i);
    fireEvent.change(groupDropdown, { target: { value: 'Recipes' } });

    fireEvent.click(screen.getByRole('button', { name: /add bookmark/i }));

    await waitFor(() => {
      expect(mockAddNamedBookmark).toHaveBeenCalledWith(
        'Mock Tab Title',
        'https://example.com',
        'Recipes'
      );
    });
    expect(global.window.close).toHaveBeenCalledTimes(1);
  });

  test('submits with a new group', async () => {
    render(<PopupPage />);

    await screen.findByRole('button', { name: /enable sync by signing in/i });
    fireEvent.click(screen.getByRole('button', { name: /enable sync by signing in/i }));
    const groupDropdown = await screen.findByLabelText(/^group$/i);
    fireEvent.change(groupDropdown, { target: { value: 'New Group' } });

    const newGroupInput = screen.getByLabelText(/New Group Name/i);
    fireEvent.change(newGroupInput, { target: { value: 'Social Media' } });

    fireEvent.click(screen.getByRole('button', { name: /add bookmark/i }));

    await waitFor(() => {
      expect(mockAddNamedBookmark).toHaveBeenCalledWith(
        'Mock Tab Title',
        'https://example.com',
        'Social Media'
      );
    });
    expect(global.window.close).toHaveBeenCalledTimes(1);
  });
});
