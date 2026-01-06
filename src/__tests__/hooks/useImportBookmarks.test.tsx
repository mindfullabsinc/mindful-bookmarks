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
 * Modal mock — now uses onSelectionChange + onComplete
 */
jest.mock('@/components/modals/ImportBookmarksModal', () => {
  const React = require('react');

  return {
    __esModule: true,
    default: function ImportBookmarksModalStub(props: any) {
      if (!props.isOpen) return null;

      // Always point at the latest props (so we call the latest onComplete closure)
      const propsRef = React.useRef(props);
      propsRef.current = props;

      const flush = () =>
        new Promise<void>((resolve) => {
          // macrotask so React has a chance to commit + rerender
          setTimeout(() => resolve(), 0);
        });

      return (
        <div data-testid="import-modal">
          <button onClick={() => propsRef.current.onClose()}>Close</button>

          <button
            onClick={async () => {
              const payload = JSON.stringify([
                { groupName: 'Imported A', bookmarks: [{ name: 'One', url: 'https://one.com' }] },
                { groupName: 'Imported B', bookmarks: [] },
                { groupName: '__EMPTY__', bookmarks: [] },
              ]);

              propsRef.current.onSelectionChange({ jsonData: payload });

              // Wait for rerender so onComplete captures updated selection
              await flush();

              await propsRef.current.onComplete();
            }}
          >
            Upload JSON
          </button>

          <button
            onClick={async () => {
              propsRef.current.onSelectionChange({ importBookmarks: true });
              await flush();
              await propsRef.current.onComplete();
            }}
          >
            Import Chrome (flat)
          </button>

          <button
            onClick={async () => {
              propsRef.current.onSelectionChange({ tabScope: 'current' });
              await flush();
              await propsRef.current.onComplete();
            }}
          >
            Import Open Tabs
          </button>
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
function Harness() {
  const { openImport, renderModal } = useImportBookmarks();
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

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    // This now sets selection.jsonData + calls onComplete()
    await user.click(screen.getByRole('button', { name: /upload json/i }));

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

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /import chrome \(flat\)/i }));

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

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => expect(screen.getByTestId('import-modal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /import open tabs/i }));

    await waitFor(() => {
      const latest = start.getState().map((g) => g.groupName);
      expect(latest).toEqual(['From Tabs', '__EMPTY__']);
    });

    // Modal should auto-close after onComplete finishes
    await waitFor(() => {
      expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
    });
  });
});
