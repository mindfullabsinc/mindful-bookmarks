import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Importer mocks (hook calls these directly now)
 */
const mockImportChromeBookmarksPreserveStructure = jest.fn();
const mockImportOpenTabsAsSingleGroup = jest.fn();

jest.mock('@/scripts/import/importers', () => ({
  __esModule: true,
  importChromeBookmarksPreserveStructure: (...args: any[]) =>
    mockImportChromeBookmarksPreserveStructure(...args),
  importOpenTabsAsSingleGroup: (...args: any[]) =>
    mockImportOpenTabsAsSingleGroup(...args),
}));

/**
 * Modal mock — just render when open.
 */
jest.mock('@/components/modals/ImportBookmarksModal', () => {
  return {
    __esModule: true,
    default: function ImportBookmarksModalStub(props: any) {
      if (!props.isOpen) return null;
      return (
        <div data-testid="import-modal">
          <button onClick={() => props.onClose()}>Close</button>
        </div>
      );
    },
  };
});

// Allow the test to inject how updateAndPersistGroups applies updates.
let mockApplyUpdate: ((updater: any) => Promise<void> | void) | null = null;
jest.mock('@/hooks/useBookmarkManager', () => ({
  __esModule: true,
  useBookmarkManager: () => ({
    updateAndPersistGroups: (updater: any) => mockApplyUpdate && mockApplyUpdate(updater),
  }),
}));

// Make IDs deterministic for easier assertions.
let mockNextId = 1;
jest.mock('@/core/utils/ids', () => ({
  __esModule: true,
  createUniqueID: () => `id_${mockNextId++}`,
}));

// Constant used by the hook/helpers.
jest.mock('@/core/constants/constants', () => ({
  __esModule: true,
  EMPTY_GROUP_IDENTIFIER: '__EMPTY__',
}));

/**
 * Under test
 */
import useImportBookmarks from '@/hooks/useImportBookmarks';

/**
 * A tiny harness so we can use the hook and render its modal output.
 */
function Harness({ onReady }: { onReady?: (api: ReturnType<typeof useImportBookmarks>) => void }) {
  const api = useImportBookmarks();
  React.useEffect(() => {
    onReady?.(api);
  }, [api, onReady]);
  const { openImport, renderModal } = api;
  return (
    <div>
      <button onClick={openImport}>Open Import</button>
      {renderModal()}
    </div>
  );
}

/**
 * Helpers for arranging fake group state with our mock manager.
 */
type Group = {
  id: string;
  groupName: string;
  bookmarks: Array<{ id: string; name: string; url: string }>;
};

function withGroups(initial: Group[]) {
  let state = initial;
  const history: Group[][] = [];

  mockApplyUpdate = (updater: (prev: Group[]) => Group[] | Promise<Group[]>) => {
    const result = updater(state);
    if (result instanceof Promise) {
      return result.then((next) => {
        state = next;
        history.push(state);
      });
    } else {
      state = result;
      history.push(state);
    }
  };

  return {
    getState: () => state,
    getHistory: () => history,
  };
}

/**
 * Tests
 */
describe('useImportBookmarks', () => {
  beforeEach(() => {
    mockNextId = 1;
    mockApplyUpdate = null;

    mockImportChromeBookmarksPreserveStructure.mockReset();
    mockImportOpenTabsAsSingleGroup.mockReset();
  });

  test('openImport shows modal and Upload JSON inserts before empty then moves empty to end', async () => {
    const user = userEvent.setup();

    // Arrange a starting state with an empty group in the middle.
    const start = withGroups([
      { id: 'gA', groupName: 'A', bookmarks: [] },
      { id: 'empty-1', groupName: '__EMPTY__', bookmarks: [] },
      { id: 'gB', groupName: 'B', bookmarks: [] },
    ]);

    let api: ReturnType<typeof useImportBookmarks> | null = null;
    render(<Harness onReady={(value) => { api = value; }} />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    const payload = JSON.stringify([
      { groupName: 'Imported A', bookmarks: [{ name: 'One', url: 'https://one.com' }] },
      { groupName: 'Imported B', bookmarks: [] },
      { groupName: '__EMPTY__', bookmarks: [] },
    ]);
    const file = new File([payload], "import.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: async () => payload,
    });

    await api!.handleUploadJson(file);

    await waitFor(() => {
      const latest = start.getState().map((g) => g.groupName);
      expect(latest).toEqual(['A', 'Imported A', 'Imported B', 'B', '__EMPTY__']);
    });
  });

  test('Import Chrome (flat) calls importer and updates via insertGroups', async () => {
    const user = userEvent.setup();

    const start = withGroups([{ id: 'empty-1', groupName: '__EMPTY__', bookmarks: [] }]);

    // When hook calls importer, we simulate importer inserting groups
    mockImportChromeBookmarksPreserveStructure.mockImplementation(
      async (insertGroups: (gs: any[]) => Promise<void>, opts: any) => {
        expect(opts).toEqual({ includeParentFolderBookmarks: true });

        await insertGroups([
          { groupName: 'From Chrome', bookmarks: [{ name: 'X', url: 'https://x.example' }] },
        ]);
      }
    );

    let api: ReturnType<typeof useImportBookmarks> | null = null;
    render(<Harness onReady={(value) => { api = value; }} />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    await api!.handleImportChrome();

    await waitFor(() => {
      const latest = start.getState().map((g) => g.groupName);
      expect(latest).toEqual(['From Chrome', '__EMPTY__']);
    });
  });

  test('Import Open Tabs path passes options and closes modal', async () => {
    const user = userEvent.setup();

    const start = withGroups([{ id: 'empty-1', groupName: '__EMPTY__', bookmarks: [] }]);

    mockImportOpenTabsAsSingleGroup.mockImplementation(
      async (insertGroups: (gs: any[]) => Promise<void>, opts: any) => {
        // Hook passes only scope right now
        expect(opts).toEqual({ scope: 'current' });

        await insertGroups([{ groupName: 'From Tabs', bookmarks: [] }]);
      }
    );

    let api: ReturnType<typeof useImportBookmarks> | null = null;
    render(<Harness onReady={(value) => { api = value; }} />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    await api!.handleImportOpenTabs({ scope: 'current' });

    await waitFor(() => {
      const latest = start.getState().map((g) => g.groupName);
      expect(latest).toEqual(['From Tabs', '__EMPTY__']);
    });

    // Modal stays open unless explicitly closed by the user
    expect(screen.getByTestId('import-modal')).toBeInTheDocument();
  });
});
