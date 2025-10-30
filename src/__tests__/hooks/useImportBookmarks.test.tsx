import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Mocks
 */
jest.mock('@/components/ImportBookmarksModal', () => {
  // A super-thin stub that exposes three buttons that invoke the props.
  return {
    __esModule: true,
    default: function ImportBookmarksModalStub(props: any) {
      if (!props.isOpen) return null;
      return (
        <div data-testid="import-modal">
          <button onClick={() => props.onClose()}>Close</button>
          
          {/* await the async upload handler */}
          <button
            onClick={async () => {
              {/* Don’t rely on File; provide a Blob-like with .text() */}
              const payload = JSON.stringify([
                { groupName: 'Imported A', bookmarks: [{ name: 'One', url: 'https://one.com' }] },
                { groupName: 'Imported B', bookmarks: [] },
                { groupName: '__EMPTY__', bookmarks: [] },
              ]);
              const fakeFile = { text: async () => payload }; 
              await props.onUploadJson(fakeFile);
            }}
          >
            Upload JSON
          </button>

          {/*await chrome import */}
          <button
            onClick={async () => {
              await props.onImportChrome({ mode: 'flat' });
            }}
          >
            Import Chrome (flat)
          </button>

          {/* await open-tabs import */}
          <button
            onClick={async () => {
              await props.onImportOpenTabs({ scope: 'current', includePinned: true });
            }}
          >
            Import Open Tabs
          </button>

        </div>
      );
    }
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
jest.mock('@/core/utils/Utilities', () => ({
  __esModule: true,
  createUniqueID: () => `id_${mockNextId++}`,
}));

// Constant used by the hook/helpers.
jest.mock('@/core/constants/Constants', () => ({
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
function Harness({ pipelines }: { pipelines?: any }) {
  const { openImport, renderModal } = useImportBookmarks(pipelines);
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
type Group = { id: string; groupName: string; bookmarks: Array<{ id: string; name: string; url: string }> };

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

    // Open modal
    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => {
      expect(screen.getByTestId('import-modal')).toBeInTheDocument();
    });

    // Trigger JSON upload flow (the stub creates a File with two groups + an "__EMPTY__")
    await user.click(screen.getByRole('button', { name: /upload json/i }));

    await waitFor(() => {
       // After upload, the hook:
      //  - normalizes inputs
      //  - inserts imported groups BEFORE the first empty
      //  - ensures a SINGLE empty, moved to the END
      const latest = start.getState().map(g => g.groupName);
      // Expected order: A, Imported A, Imported B, B, __EMPTY__
      expect(latest).toEqual(['A', 'Imported A', 'Imported B', 'B', '__EMPTY__']);
    });
  });

  test('Import Chrome (flat) calls pipeline and updates via insertGroups', async () => {
    const user = userEvent.setup();

    const start = withGroups([
      { id: 'empty-1', groupName: '__EMPTY__', bookmarks: [] },
    ]);

    const pipelines = {
      importChromeBookmarksAsSingleGroup: async (insertGroups: (gs: any[]) => Promise<void>) => {
        await insertGroups([
          { groupName: 'From Chrome', bookmarks: [{ name: 'X', url: 'https://x.example' }] }
        ]);
      }
    };

    render(<Harness pipelines={pipelines} />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => {
      expect(screen.getByTestId('import-modal')).toBeInTheDocument();
    });
      
    await user.click(screen.getByRole('button', { name: /import chrome \(flat\)/i }));
    await waitFor(() => {
      const latest = start.getState().map(g => g.groupName);
      // inserted before empty, then empty moved to end
      expect(latest).toEqual(['From Chrome', '__EMPTY__']);
    });
  });

  test('Import Open Tabs path passes options and closes modal', async () => {
    const user = userEvent.setup();

    const start = withGroups([{ id: 'empty-1', groupName: '__EMPTY__', bookmarks: [] }]);

    const openTabsSpy = jest.fn(async (insertGroups, opts) => {
      // Verify opts passthrough from the stub
      expect(opts).toEqual({ scope: 'current', includePinned: true });
      await insertGroups([{ groupName: 'From Tabs', bookmarks: [] }]);
    });

    const pipelines = { importOpenTabsAsSingleGroup: openTabsSpy };

    render(<Harness pipelines={pipelines} />);

    await user.click(screen.getByRole('button', { name: /open import/i }));
    await waitFor(() => {
      expect(screen.getByTestId('import-modal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /import open tabs/i }));
    await waitFor(() => {
      const latest = start.getState().map(g => g.groupName);
      expect(latest).toEqual(['From Tabs', '__EMPTY__']);
    });

    // Modal should auto-close in the hook after action completes.
    await waitFor(() => {
      expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
    });  
  });
});
