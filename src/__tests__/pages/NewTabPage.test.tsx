/* -------------------- Imports -------------------- */
import React from 'react';
import type { ReactNode } from 'react';
import { render, screen, act, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';

// The component to test
import { NewTabPage } from '@/pages/NewTabPage';

// Scripts 
import { AppContextProvider } from '@/scripts/AppContextProvider';
import * as bookmarksData from '@/scripts/bookmarksData';
import * as useBookmarkManager from '@/hooks/useBookmarkManager';
import useImportBookmarksDefault from '@/hooks/useImportBookmarks';
import * as Utilities from '@/core/utils/utilities';
import { StorageMode, type StorageModeType } from '@/core/constants/storageMode'; 
/* ---------------------------------------------------------- */

/* -------------------- Mocks -------------------- */
const useImportBookmarksMock =
  useImportBookmarksDefault as unknown as jest.MockedFunction<typeof useImportBookmarksDefault>;

/* Scripts and hooks */
jest.mock('@/scripts/AppContextProvider', () => {
  const React = require('react') as typeof import('react');
  const { StorageMode } = require('@/core/constants/storageMode');
  const { LOCAL_USER_ID } = require('@/core/constants/authMode');
  const { DEFAULT_LOCAL_WORKSPACE_ID } = require('@/core/constants/workspaces');
  const { fetchUserAttributes } = require('aws-amplify/auth');
  const { loadInitialBookmarks } = require('@/scripts/bookmarksData');

  type Ctx = { /* …same as before… */ };
  const AppContext = React.createContext<Ctx | null>(null);

  function AppContextProvider({ user, children }: { user: any; children?: React.ReactNode }) {
    const initialMode = (globalThis as any).__TEST_STORAGE_MODE__ ?? StorageMode.LOCAL;
    const [bookmarkGroups, setBookmarkGroups] = React.useState<any[] | null>(null);
    const [storageMode, setStorageMode] = React.useState<string>(initialMode);
    const [userAttributes, setUserAttributes] = React.useState<Record<string, unknown> | undefined>(undefined);
    const [hasHydrated, setHasHydrated] = React.useState(false);
    const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string>(DEFAULT_LOCAL_WORKSPACE_ID);

    const signedInUserId = user?.sub ?? null;
    const isSignedIn = !!signedInUserId;

    const userId = isSignedIn ? signedInUserId : LOCAL_USER_ID;

    const bootedRef = React.useRef(false);

    React.useEffect(() => {
      if (bootedRef.current) return;
      bootedRef.current = true;

      (async () => {
        try {
          if (isSignedIn) {
            // Signed-in: fetch attributes; may switch to REMOTE
            const attrs = await fetchUserAttributes();
            setUserAttributes(attrs);
            const mode = (attrs && (attrs as any)['custom:storage_type']) || storageMode;
            setStorageMode(mode);
            // Give signed-in a distinct ws id just like app code
            setActiveWorkspaceId('ws-local');
          }
          // Anonymous: DO NOT force LOCAL; keep initialMode from the suite
        } catch {}

        try {
          const shouldLoad =
            storageMode === StorageMode.LOCAL ||
            (isSignedIn && storageMode === StorageMode.REMOTE);

          if (shouldLoad) {
            const groups = await loadInitialBookmarks(
              userId as string,
              activeWorkspaceId as string,
              storageMode,
              {}
            );
            setBookmarkGroups(groups || []);
          } else {
            setBookmarkGroups([]);
          }
        } finally {
          setHasHydrated(true);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value: Ctx = {
      bookmarkGroups,
      setBookmarkGroups,
      userId,
      activeWorkspaceId,
      setActiveWorkspaceId: (id: string) => setActiveWorkspaceId(id),
      storageMode,
      isMigrating: false,
      userAttributes,
      isSignedIn,
      hasHydrated,
      isHydratingRemote: false,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
  }

  return { __esModule: true, AppContextProvider, AppContext };
});

jest.mock('@/workspaces/registry', () => {
  // in-memory fake registry for this test file
  const now = () => Date.now();
  let reg = {
    version: 1,
    activeId: 'local',
    items: {
      local: { id: 'local', name: 'Local Workspace', storageMode: 'LOCAL', createdAt: 1, updatedAt: 1 },
    } as Record<string, any>,
    migratedLegacyLocal: true,
  };

  return {
    __esModule: true,
    initializeLocalWorkspaceRegistry: jest.fn(async () => {}),
    loadRegistry: jest.fn(async () => reg),
    setActiveWorkspace: jest.fn(async (id: string) => { reg.activeId = id; }),
    getActiveWorkspaceId: jest.fn(async () => reg.activeId),
    listLocalWorkspaces: jest.fn(async ({ includeArchived } = { includeArchived: false }) => {
      const all = Object.values(reg.items).sort((a: any, b: any) => a.createdAt - b.createdAt);
      return includeArchived ? all : all.filter((w: any) => !w.archived);
    }),
    createLocalWorkspace: jest.fn(async (name = 'Local Workspace') => {
      const id = `local-mock-${Object.keys(reg.items).length + 1}`;
      reg.items[id] = { id, name, storageMode: 'LOCAL', createdAt: now(), updatedAt: now() };
      reg.activeId = id;
      return reg.items[id];
    }),
    renameWorkspace: jest.fn(async (id: string, name: string) => {
      if (reg.items[id]) reg.items[id] = { ...reg.items[id], name, updatedAt: now() };
    }),
    archiveWorkspace: jest.fn(async (id: string) => {
      if (!reg.items[id]) return;
      const live = Object.values(reg.items).filter((w: any) => !w.archived);
      if (live.length <= 1) return; // don’t archive the last one
      reg.items[id] = { ...reg.items[id], archived: true, updatedAt: now() };
      if (reg.activeId === id) {
        const fallback = Object.values(reg.items).find((w: any) => !w.archived)?.id || 'local';
        reg.activeId = fallback as string;
      }
    }),
  };
});

jest.mock('@/hooks/useBookmarkManager', () => ({
  __esModule: true,
  useBookmarkManager: jest.fn(),
}));

jest.mock('@/core/utils/utilities', () => ({
  __esModule: true,
  getUserStorageKey: jest.fn(),
}));

jest.mock('@/analytics/AnalyticsProvider', () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

jest.mock('@/scripts/bookmarksData', () => ({
  __esModule: true,
  loadInitialBookmarks: jest.fn(),
}));

jest.mock('@/scripts/caching/bookmarkCache', () => {
  return {
    __esModule: true,
    writeGroupsIndexSession: jest.fn(async () => {}),
    clearSessionGroupsIndexExcept: jest.fn(async () => {}),
  };
});

/* Components */
jest.mock('@/components/TopBanner', () => ({
  __esModule: true,
  default: (props: {
    onExportBookmarks: () => void;
    onSignOut: () => void;
    onStorageModeChange?: (mode: StorageModeType) => void;
    isSignedIn: boolean;
    userAttributes?: { email?: string };
  }) => (
    <div data-testid="top-banner">
      <button type="button" onClick={props.onExportBookmarks}>Export Bookmarks</button>
      <button type="button" onClick={props.onSignOut}>Sign Out</button>
      <span>{`Signed In: ${props.isSignedIn}`}</span>
      <span>{props.userAttributes?.email}</span>
    </div>
  ),
}));

jest.mock('@/components/DraggableGrid', () => ({
  __esModule: true,
  default: ({ bookmarkGroups }: { bookmarkGroups?: Array<{ groupName: string }> }) => (
    <div data-testid="draggable-grid">
      {bookmarkGroups?.map(group => <div key={group.groupName}>{group.groupName}</div>)}
    </div>
  ),
}));

/* External modules */
jest.mock('aws-amplify/auth', () => ({
  __esModule: true,
  fetchUserAttributes: jest.fn(),
  fetchAuthSession: jest.fn(),
}));


let lastEmptyStateOnImport: (() => void) | undefined;
jest.mock('@/components/EmptyBookmarksState', () => ({
  __esModule: true,
  default: ({ onImport }: { onImport: () => void }) => {
    // expose the latest handler so tests can call it deterministically
    lastEmptyStateOnImport = onImport;
    return (
      <section aria-label="Getting started with bookmarks">
        <button type="button" aria-label="Import bookmarks" onClick={onImport}>
          Import bookmarks
        </button>
      </section>
    );
  },
}));

jest.mock('@/hooks/useImportBookmarks', () => ({
  __esModule: true,
  default: jest.fn(),            // mock default export
  useImportBookmarks: jest.fn(), // (optional) also mock the named export to the same fn if you need it elsewhere
}));

type ChromeStorageChange = { oldValue?: unknown; newValue?: unknown };
type ChromeChangeListener = (changes: Record<string, ChromeStorageChange>, areaName: string) => void | Promise<void>;

// Chrome API mock (stable references)
const chromeMock = {
  storage: {
    onChanged: {
      addListener: jest.fn<ReturnType<jest.Mock>, [ChromeChangeListener]>(),
      removeListener: jest.fn<ReturnType<jest.Mock>, [ChromeChangeListener]>(),
    },
    local: {
      get: jest.fn<Promise<Record<string, unknown>>, [string?]>().mockResolvedValue({}),
      set: jest.fn<Promise<void>, [Record<string, unknown>]>().mockResolvedValue(undefined),
    },
    session: {
      get: jest.fn<Promise<Record<string, unknown>>, [string?]>().mockResolvedValue({}),
      set: jest.fn<Promise<void>, [Record<string, unknown>]>().mockResolvedValue(undefined),
    },
  },
  runtime: {
    onMessage: {
      addListener: jest.fn<ReturnType<jest.Mock>, [(message: { type?: string; at?: number }) => void]>(),
      removeListener: jest.fn<ReturnType<jest.Mock>, [(message: { type?: string; at?: number }) => void]>(),
    },
  },
} as unknown as typeof chrome;

(globalThis as any).chrome = chromeMock;

const useBookmarkManagerMock = useBookmarkManager as jest.Mocked<typeof useBookmarkManager>;
const utilitiesMock = Utilities as jest.Mocked<typeof Utilities>;
const bookmarksDataMock = bookmarksData as jest.Mocked<typeof bookmarksData>;
const fetchUserAttributesMock = fetchUserAttributes as jest.MockedFunction<typeof fetchUserAttributes>;
const fetchAuthSessionMock = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;

// --- Test Data (DO NOT REMOVE) ---
const mockUserId = '123';
const mockUser = { username: 'testuser', sub: mockUserId };
const mockUserAttributes = { email: 'test@example.com' };
type BookmarkGroupTest = {
  id: string;
  groupName: string;
  bookmarks: Array<{ id: string; title: string; url: string }>;
};
const mockBookmarkGroups: BookmarkGroupTest[] = [
  { id: 'g1', groupName: 'Work', bookmarks: [{ id: 'b1', title: 'Doc', url: 'https://docs.com' }] },
  { id: 'g2', groupName: 'Personal', bookmarks: [{ id: 'b2', title: 'Mail', url: 'https://mail.com' }] },
];
/* ---------------------------------------------------------- */

// Wrap the entire suite in describe.each
describe.each([
  { storageMode: StorageMode.LOCAL, description: 'local' },
  { storageMode: StorageMode.REMOTE, description: 'remote' },
])('NewTabPage Component with $description storage', ({ storageMode }) => {
  let mockSignOut: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;
  let mockAddEmptyBookmarkGroup: jest.Mock;
  let mockExportBookmarksToJSON: jest.Mock;
  let mockImportBookmarksFromJSON: jest.Mock;
  let mockChangeStorageMode: jest.Mock;
  let mockOpenImport: jest.Mock;
  let mockCloseImport: jest.Mock;
  let mockRenderModal: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    useImportBookmarksMock.mockReset();

    mockOpenImport = jest.fn<void, []>(() => {});
    mockCloseImport = jest.fn<void, []>(() => {});
    mockRenderModal = jest.fn<React.ReactElement, []>(() => <div data-testid="import-modal" />);

    // Bookmark manager actions used by NewTabPage
    mockAddEmptyBookmarkGroup = jest.fn();
    mockExportBookmarksToJSON = jest.fn();
    mockImportBookmarksFromJSON = jest.fn();
    mockChangeStorageMode = jest.fn();

    const mockedHookValue = {
      openImport: mockOpenImport,
      closeImport: mockCloseImport,
      renderModal: mockRenderModal,
      busy: false, // <-- required
    } satisfies ReturnType<typeof useImportBookmarksDefault>;

    useImportBookmarksMock.mockReturnValue(mockedHookValue);

    (useBookmarkManagerMock.useBookmarkManager as jest.Mock).mockReturnValue({
      addEmptyBookmarkGroup: mockAddEmptyBookmarkGroup,
      exportBookmarksToJSON: mockExportBookmarksToJSON,
      importBookmarksFromJSON: mockImportBookmarksFromJSON,
      changeStorageMode: mockChangeStorageMode,
    });

    // Seed the real loader used by the provider
    bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(mockBookmarkGroups);

    mockSignOut = jest.fn();
    utilitiesMock.getUserStorageKey.mockReturnValue(`bookmarks_${mockUserId}`);
    fetchAuthSessionMock.mockResolvedValue({ identityId: mockUserId });

    // Configure mocks based on the current storageMode for the test run
    fetchUserAttributesMock.mockResolvedValue({
      ...mockUserAttributes,
      'custom:storage_type': storageMode,
    });

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    (globalThis as any).__TEST_STORAGE_MODE__ = storageMode;
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('should load bookmarks and user attributes when a user is present', async () => {
    render(
      <AppContextProvider user={mockUser}>
        <NewTabPage user={mockUser} signOut={mockSignOut} />
      </AppContextProvider>
    );

    await screen.findByTestId('top-banner');
    expect(fetchUserAttributesMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    expect(screen.getByText('Signed In: true')).toBeInTheDocument();
    expect(screen.getByText(mockUserAttributes.email)).toBeInTheDocument();
  });

  it('should respect no-user behavior for this storage mode', async () => {
    fetchAuthSessionMock.mockRejectedValue(new Error('No user is signed in.'));
    fetchUserAttributesMock.mockRejectedValue(new Error('No user is signed in.'));

    render(
      <AppContextProvider user={null}>
        <NewTabPage user={undefined} />
      </AppContextProvider>
    );

    await screen.findByTestId('top-banner');

    if (storageMode === StorageMode.LOCAL) {
      // Anonymous LOCAL loads bookmarks
      expect(bookmarksDataMock.loadInitialBookmarks).toHaveBeenCalledTimes(1);
      expect(fetchUserAttributesMock).not.toHaveBeenCalled();
    } else {
      // Anonymous REMOTE does not load
      expect(bookmarksDataMock.loadInitialBookmarks).not.toHaveBeenCalled();
      expect(fetchUserAttributesMock).not.toHaveBeenCalled();
    }
    
    expect(screen.getByText('Signed In: false')).toBeInTheDocument();
  });

  it('should add an empty bookmark group if one does not exist after loading', async () => {
    bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(mockBookmarkGroups);
    render(
      <AppContextProvider user={mockUser}>
        <NewTabPage user={mockUser} />
      </AppContextProvider>
    );

    await waitFor(() => {
      expect(mockAddEmptyBookmarkGroup).toHaveBeenCalledTimes(1);
    });
  });

  it('should import bookmarks via the EmptyBookmarksState button', async () => {
    // Ensure no stray localStorage hides the real component if your test env leaks between tests
    localStorage.removeItem('mindful.emptyStateChecklist');
    localStorage.removeItem('mindful.emptyStateDismissed');

    render(
      <AppContextProvider user={mockUser}>
        <NewTabPage user={mockUser} signOut={mockSignOut} />
      </AppContextProvider>
    );

    // Wait until the grid proves the content subtree is mounted
    await screen.findByTestId('draggable-grid');

    // Deterministically trigger the same effect as clicking the button
    expect(lastEmptyStateOnImport).toBeDefined();
    await act(async () => { lastEmptyStateOnImport!(); });

    // In remote mode the AnalyticsProvider is lazy-loaded; give React a tick
    await waitFor(() => expect(mockImportBookmarksFromJSON).toHaveBeenCalledTimes(1));
  });
  
  // Conditionally run tests that are only relevant for LOCAL storage
  if (storageMode === StorageMode.LOCAL) {
    it('should listen for storage changes and reload data accordingly', async () => {
      render(
        <AppContextProvider user={mockUser}>
          <NewTabPage user={mockUser} />
        </AppContextProvider>
      );

      await screen.findByTestId('top-banner');

      const addMock = chrome.storage.onChanged.addListener as unknown as jest.Mock;
      expect(addMock).toHaveBeenCalled(); // at least one listener (auth/mode) + local listener

      // Use the first listener (local storage-sync one is added early)
      const storageChangeHandler = addMock.mock.calls[0][0] as ChromeChangeListener;
      const storageKey = utilitiesMock.getUserStorageKey.mock.results[0]?.value ?? `bookmarks_${mockUserId}`;
      const changes = { [storageKey]: { oldValue: [], newValue: [] } };

      bookmarksDataMock.loadInitialBookmarks.mockClear();
      bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(mockBookmarkGroups);

      await act(async () => {
        await storageChangeHandler(changes, 'local');
      });

      await waitFor(() => {
        expect(bookmarksDataMock.loadInitialBookmarks).toHaveBeenCalledTimes(1);
      });
    });

    it('should clean up the storage listener on unmount', async () => {
      const addMock = chrome.storage.onChanged.addListener as unknown as jest.Mock;
      const removeMock = chrome.storage.onChanged.removeListener as unknown as jest.Mock;
      const addsBefore = addMock.mock.calls.length;
      const removesBefore = removeMock.mock.calls.length;

      const { unmount } = render(
        <AppContextProvider user={mockUser}>
          <NewTabPage user={mockUser} />
        </AppContextProvider>
      );

      await screen.findByTestId('top-banner');
      unmount();

      const addsDuring = addMock.mock.calls.length - addsBefore;
      const removesDuring = removeMock.mock.calls.length - removesBefore;

      // invariant: we remove as many as we added during this mount (or more, in StrictMode double-invoke)
      expect(removesDuring).toBeGreaterThanOrEqual(addsDuring);
    });
  }

  it('should handle interactions from the TopBanner component', async () => {
    render(
      <AppContextProvider user={mockUser}>
        <NewTabPage user={mockUser} signOut={mockSignOut} />
      </AppContextProvider>
    );

    await screen.findByTestId('top-banner');

    fireEvent.click(screen.getByText('Export Bookmarks'));
    expect(mockExportBookmarksToJSON).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Sign Out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
