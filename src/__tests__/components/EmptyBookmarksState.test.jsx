/**
 * @file EmptyBookmarksState.test.jsx
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import EmptyBookmarksState from '@/components/EmptyBookmarksState';
import { AppContext } from '@/scripts/AppContextProvider';
import { EMPTY_GROUP_IDENTIFIER } from '@/core/constants/Constants';

import useImportBookmarks, {
  mockOpenImport,
  mockRenderModal,
  mockUseImportBookmarks,
} from '@/hooks/useImportBookmarks';

// ---- Mock useImportBookmarks ----------------------------------------------
jest.mock('@/hooks/useImportBookmarks', () => {
  const mockOpenImport = jest.fn();
  const mockRenderModal = jest.fn(() => <div data-testid="import-modal">Mock Import Modal</div>);

  const mockUseImportBookmarks = jest.fn(() => ({
    openImport: mockOpenImport,
    renderModal: mockRenderModal,
  }));

  return {
    __esModule: true,
    default: mockUseImportBookmarks,
    // expose fns so tests can assert calls
    mockOpenImport,
    mockRenderModal,
    mockUseImportBookmarks,
  };
});

// ---- Helpers ---------------------------------------------------------------
const DISMISS_KEY = 'mindful.emptyStateDismissed';
const CHECKLIST_KEY = 'mindful.emptyStateChecklist';

const renderWithContext = (ui, { groups } = {}) => {
  const value = { bookmarkGroups: groups };
  return render(
    <AppContext.Provider value={value}>{ui}</AppContext.Provider>
  );
};

const trulyEmpty = [];
const placeholderOnly = [
  { groupName: EMPTY_GROUP_IDENTIFIER, bookmarks: [] },
];

// A named group with a bookmark
const populated = [
  { groupName: 'Work', bookmarks: [{ id: '1', name: 'GPT', link: 'https://chat.openai.com' }] },
];

// ---- Reset storage between tests ------------------------------------------
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

// ---- Tests -----------------------------------------------------------------
describe('EmptyBookmarksState', () => {
  test('renders for a truly empty dashboard (no groups) and shows primary actions', () => {
    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: trulyEmpty });

    const region = screen.getByRole('region', { name: /getting started with bookmarks/i });
    expect(region).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /welcome to mindful/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import bookmarks/i })).toBeInTheDocument();

    // Checklist items are present
    const quickStart = within(region).getByText(/quick start/i);
    expect(quickStart).toBeInTheDocument();
    expect(screen.getByLabelText(/create a group/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add a link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/try local ↔︎ sync/i)).toBeInTheDocument();
  });

  test('calls onCreateGroup when "Create your first group" is clicked', async () => {
    const user = userEvent.setup();
    const onCreateGroup = jest.fn();

    renderWithContext(<EmptyBookmarksState onCreateGroup={onCreateGroup} />, { groups: trulyEmpty });

    await user.click(screen.getByRole('button', { name: /create your first group/i }));
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
  });

  test('Import bookmarks triggers openImport and renders the hook-provided modal', async () => {
    const user = userEvent.setup();

    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: placeholderOnly });

    await user.click(screen.getByRole('button', { name: /Import bookmarks/i }));
    expect(mockOpenImport).toHaveBeenCalledTimes(1);

    // The modal UI is controlled by the hook; we ensure renderModal() is being used
    expect(screen.getByTestId('import-modal')).toHaveTextContent(/mock import modal/i);
  });

  test('close (X) hides the panel, sets localStorage, and calls onClose if provided', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} onClose={onClose} />, { groups: trulyEmpty });

    const closeBtn = screen.getByRole('button', { name: /close getting started panel/i });
    await user.click(closeBtn);

    // Component should no longer render
    expect(screen.queryByRole('region', { name: /getting started with bookmarks/i })).not.toBeInTheDocument();

    // Dismiss flag persisted
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');

    // onClose called
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not render when previously dismissed via localStorage', () => {
    localStorage.setItem(DISMISS_KEY, '1');

    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: trulyEmpty });

    expect(screen.queryByRole('region', { name: /getting started with bookmarks/i })).not.toBeInTheDocument();
  });

  test('auto-hides when not truly empty AND all checklist items are checked', () => {
    // Pre-seed checklist with triedStorage = true; the component will auto-check createdGroup/addedBookmark
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify({
      createdGroup: false,
      addedBookmark: false,
      triedStorage: true,
    }));

    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: populated });

    // Not truly empty AND (auto-check first two) → allChecked = true → should not render
    expect(screen.queryByRole('region', { name: /getting started with bookmarks/i })).not.toBeInTheDocument();
  });

  test('checking a checklist item persists to localStorage', async () => {
    const user = userEvent.setup();

    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: trulyEmpty });

    const tryStorage = screen.getByLabelText(/try local ↔︎ sync/i);
    expect(tryStorage).toBeInTheDocument();

    // Initially false (unless seeded). Toggle to true.
    await user.click(tryStorage);

    const saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}');
    expect(saved.triedStorage).toBe(true);
  });

  test('renders when only placeholder group(s) exist with zero bookmarks', () => {
    renderWithContext(<EmptyBookmarksState onCreateGroup={jest.fn()} />, { groups: placeholderOnly });

    expect(screen.getByRole('region', { name: /getting started with bookmarks/i })).toBeInTheDocument();
  });
});
