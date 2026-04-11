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
import * as ChromeUtils from '@/core/utils/chrome';
import * as StorageKeysUtils from '@/core/utils/storageKeys';
import { StorageMode, type StorageModeType } from '@/core/constants/storageMode';
import { commitManualImportIntoWorkspace } from '@/scripts/import/commitManualImportIntoWorkspace';
import { createWorkspaceServiceLocal } from '@/scripts/import/workspaceServiceLocal';
/* ---------------------------------------------------------- */

/* -------------------- Drag-and-drop test helpers -------------------- */
/**
 * Returns stable jest.fn() instances stored on globalThis so they survive
 * jest.mock() hoisting and remain accessible inside mock factories.
 */
function getDragTestMocks() {
  const g = globalThis as any;
  if (!g.__newTabDragMocks__) {
    g.__newTabDragMocks__ = {
      bumpPostImport: jest.fn(),
      bumpWorkspacesVersion: jest.fn(),
    };
  }
  return g.__newTabDragMocks__ as {
    bumpPostImport: jest.Mock;
    bumpWorkspacesVersion: jest.Mock;
  };
}
/* ---------------------------------------------------------- */

/* -------------------- Mocks -------------------- */

jest.mock('@/scripts/import/workspaceServiceLocal', () => ({
  createWorkspaceServiceLocal: jest.fn(() => ({})),
}));

jest.mock('@/scripts/import/commitManualImportIntoWorkspace', () => ({
  commitManualImportIntoWorkspace: jest.fn(),
}));

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

    const dragMocks = getDragTestMocks();
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
      workspaces: {},
      bumpPostImport: dragMocks.bumpPostImport,
      bumpWorkspacesVersion: dragMocks.bumpWorkspacesVersion,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
  }

  return { __esModule: true, AppContextProvider, AppContext };
});

jest.mock('@/scripts/workspaces/registry', () => {
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

jest.mock('@/core/utils/storageKeys', () => ({
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
    onOrganize?: () => void;
    onStorageModeChange?: (mode: StorageModeType) => void;
    isSignedIn: boolean;
    isOrganizing?: boolean;
    userAttributes?: { email?: string };
  }) => (
    <div data-testid="top-banner">
      <button type="button" onClick={props.onExportBookmarks}>Export Bookmarks</button>
      <button type="button" onClick={props.onOrganize} disabled={props.isOrganizing}>
        Organize Workspace
      </button>
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
const chromeUtilsMock = ChromeUtils as jest.Mocked<typeof ChromeUtils>;
const storageKeysUtilsMock = StorageKeysUtils as jest.Mocked<typeof StorageKeysUtils>;
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
  let mockUpdateAndPersistGroups: jest.Mock;
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
    mockUpdateAndPersistGroups = jest.fn(async (updater?: () => unknown) => (
      typeof updater === 'function' ? updater() : undefined
    ));

    const mockHandleUploadJson = jest.fn<Promise<void>, [File]>(async () => {});
    const mockHandleImportChrome = jest.fn<Promise<void>, []>(async () => {});
    const mockHandleImportOpenTabs = jest.fn<
      Promise<void>,
      [{ scope?: "current" | "all" }]
    >(async () => {});

    const mockedHookValue = {
      openImport: mockOpenImport,
      closeImport: mockCloseImport,
      renderModal: mockRenderModal,
      busy: false,

      handleUploadJson: mockHandleUploadJson,
      handleImportChrome: mockHandleImportChrome,
      handleImportOpenTabs: mockHandleImportOpenTabs,
    } satisfies ReturnType<typeof useImportBookmarksDefault>;

    useImportBookmarksMock.mockReturnValue(mockedHookValue);

    (useBookmarkManagerMock.useBookmarkManager as jest.Mock).mockReturnValue({
      addEmptyBookmarkGroup: mockAddEmptyBookmarkGroup,
      exportBookmarksToJSON: mockExportBookmarksToJSON,
      importBookmarksFromJSON: mockImportBookmarksFromJSON,
      changeStorageMode: mockChangeStorageMode,
      updateAndPersistGroups: mockUpdateAndPersistGroups,
    });

    // Seed the real loader used by the provider
    bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(mockBookmarkGroups);

    mockSignOut = jest.fn();
    storageKeysUtilsMock.getUserStorageKey.mockReturnValue(`bookmarks_${mockUserId}`);
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
      const storageKey = storageKeysUtilsMock.getUserStorageKey.mock.results[0]?.value ?? `bookmarks_${mockUserId}`;
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

  it('organizes only the active workspace when the AI Organize button is clicked', async () => {
    const workspaceGroups = [
      {
        id: 'g1',
        groupName: 'Work',
        bookmarks: [{ id: 'b1', name: 'Doc', url: 'https://docs.com', faviconUrl: 'https://docs.com/favicon.ico' }],
      },
      {
        id: 'g2',
        groupName: 'Personal',
        bookmarks: [{ id: 'b2', name: 'Mail', url: 'https://mail.com' }],
      },
    ];
    bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(workspaceGroups as any);

    render(
      <AppContextProvider user={mockUser}>
        <NewTabPage user={mockUser} />
      </AppContextProvider>
    );

    await screen.findByTestId('top-banner');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /organize workspace/i }));
    });

    await waitFor(() => {
      expect(mockUpdateAndPersistGroups).toHaveBeenCalledWith(expect.any(Function));
    });

    const buildNextGroups = mockUpdateAndPersistGroups.mock.calls[0][0];
    expect(
      buildNextGroups().map((group: { groupName: string; bookmarks: Array<{ id: string; faviconUrl?: string }> }) => ({
        groupName: group.groupName,
        bookmarkIds: group.bookmarks.map(bookmark => bookmark.id),
        firstBookmarkFavicon: group.bookmarks[0]?.faviconUrl,
      }))
    ).toEqual([
      {
        groupName: 'Imported',
        bookmarkIds: ['b1', 'b2'],
        firstBookmarkFavicon: 'https://docs.com/favicon.ico',
      },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* NewTabPage – file drag-and-drop                                      */
/* ------------------------------------------------------------------ */

describe('NewTabPage file drag-and-drop', () => {
  const { bumpPostImport, bumpWorkspacesVersion } = getDragTestMocks();
  const mockCommit = commitManualImportIntoWorkspace as jest.Mock;
  const mockCreateService = createWorkspaceServiceLocal as jest.Mock;
  const fakeService = { __service: 'fake' };

  /* Helpers */

  /** Dispatch a dragenter event on window, optionally carrying files. */
  function fireDragEnter(withFiles = true) {
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('dragenter', { cancelable: true }), {
          dataTransfer: { types: withFiles ? ['Files'] : [] },
        })
      );
    });
  }

  /** Dispatch a dragleave event on window. */
  function fireDragLeave() {
    act(() => window.dispatchEvent(new Event('dragleave')));
  }

  /** Dispatch a drop event carrying the given file. */
  function fireDrop(file: File) {
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('drop', { cancelable: true }), {
          dataTransfer: { types: ['Files'], files: [file] },
        })
      );
    });
  }

  /** Create a File and patch .text() since jsdom doesn't implement Blob.text(). */
  function makeFile(name: string, content: string, type: string) {
    const file = new File([content], name, { type });
    (file as any).text = () => Promise.resolve(content);
    return file;
  }

  function makeJsonFile(name = 'bookmarks.json', content = '{"tabs":[]}') {
    return makeFile(name, content, 'application/json');
  }

  /** Render the page and wait until fully hydrated (Toast is in the ready subtree). */
  async function renderPage() {
    (globalThis as any).__TEST_STORAGE_MODE__ = StorageMode.LOCAL;
    render(
      <AppContextProvider user={null}>
        <NewTabPage />
      </AppContextProvider>
    );
    await screen.findByTestId('top-banner');
    await screen.findByTestId('draggable-grid');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    bumpPostImport.mockClear();
    bumpWorkspacesVersion.mockClear();
    mockCreateService.mockReturnValue(fakeService);
    mockCommit.mockResolvedValue(undefined);
    (globalThis as any).__TEST_STORAGE_MODE__ = StorageMode.LOCAL;
    bookmarksDataMock.loadInitialBookmarks.mockResolvedValue(mockBookmarkGroups);
    (useBookmarkManagerMock.useBookmarkManager as jest.Mock).mockReturnValue({
      addEmptyBookmarkGroup: jest.fn(),
      exportBookmarksToJSON: jest.fn(),
      importBookmarksFromJSON: jest.fn(),
      changeStorageMode: jest.fn(),
      updateAndPersistGroups: jest.fn(),
    });
    useImportBookmarksMock.mockReturnValue({
      openImport: jest.fn(),
      closeImport: jest.fn(),
      renderModal: jest.fn(() => <div />),
      busy: false,
      handleUploadJson: jest.fn(),
      handleImportChrome: jest.fn(),
      handleImportOpenTabs: jest.fn(),
    } as any);
  });

  afterEach(() => cleanup());

  /* -- Overlay visibility -- */

  test('shows drop overlay when a file is dragged over the page', async () => {
    await renderPage();
    fireDragEnter(true);
    expect(screen.getByText('Drop to import bookmarks')).toBeInTheDocument();
    expect(screen.getByText('.json or .html files supported')).toBeInTheDocument();
  });

  test('does not show drop overlay for non-file drags (e.g. dragging text)', async () => {
    await renderPage();
    fireDragEnter(false);
    expect(screen.queryByText('Drop to import bookmarks')).not.toBeInTheDocument();
  });

  test('hides overlay when drag leaves the page', async () => {
    await renderPage();
    fireDragEnter(true);
    expect(screen.getByText('Drop to import bookmarks')).toBeInTheDocument();
    fireDragLeave();
    expect(screen.queryByText('Drop to import bookmarks')).not.toBeInTheDocument();
  });

  test('keeps overlay visible across nested dragenter events, hides only when counter reaches zero', async () => {
    await renderPage();
    fireDragEnter(true);
    fireDragEnter(true); // enter a nested element
    fireDragLeave();     // leave the nested element – still dragging over page
    expect(screen.getByText('Drop to import bookmarks')).toBeInTheDocument();
    fireDragLeave();     // leave the page entirely
    expect(screen.queryByText('Drop to import bookmarks')).not.toBeInTheDocument();
  });

  test('hides overlay on drop', async () => {
    await renderPage();
    fireDragEnter(true);
    expect(screen.getByText('Drop to import bookmarks')).toBeInTheDocument();
    fireDrop(makeJsonFile());
    expect(screen.queryByText('Drop to import bookmarks')).not.toBeInTheDocument();
  });

  /* -- Import logic -- */

  test('calls commitManualImportIntoWorkspace with correct args when a JSON file is dropped', async () => {
    await renderPage();
    fireDrop(makeJsonFile('my-bookmarks.json', '{"groups":[]}'));

    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: {
          jsonData: '{"groups":[]}',
          jsonFileName: 'my-bookmarks.json',
          workspaceName: 'my-bookmarks',
        },
        purposes: [],
        purpose: 'personal',
        workspaceService: fakeService,
      })
    );
  });

  test('accepts .html files and strips extension for workspace name', async () => {
    await renderPage();
    fireDrop(makeFile('chrome-export.html', '<html></html>', 'text/html'));

    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({
          jsonFileName: 'chrome-export.html',
          workspaceName: 'chrome-export',
        }),
      })
    );
  });

  test('shows success toast and bumps workspace version after successful drop', async () => {
    await renderPage();
    fireDrop(makeJsonFile());

    expect(await screen.findByText('Bookmarks imported successfully!')).toBeInTheDocument();
    expect(bumpWorkspacesVersion).toHaveBeenCalledTimes(1);
  });

  test('calls bumpPostImport with the previous workspace IDs after a 150 ms delay', async () => {
    jest.useFakeTimers();
    try {
      await renderPage();
      fireDrop(makeJsonFile());

      await waitFor(() => expect(bumpWorkspacesVersion).toHaveBeenCalledTimes(1));
      expect(bumpPostImport).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(150));
      expect(bumpPostImport).toHaveBeenCalledWith([]); // workspaces:{} → previousIds=[]
    } finally {
      jest.useRealTimers();
    }
  });

  test('shows error toast for unsupported file type', async () => {
    await renderPage();
    fireDrop(makeFile('notes.txt', 'data', 'text/plain'));

    expect(await screen.findByText('Please drop a .json or .html bookmarks file.')).toBeInTheDocument();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('shows error toast when the import throws', async () => {
    mockCommit.mockRejectedValueOnce(new Error('Parse failed'));
    await renderPage();
    fireDrop(makeJsonFile());

    expect(await screen.findByText('Import failed: Parse failed')).toBeInTheDocument();
  });
});
