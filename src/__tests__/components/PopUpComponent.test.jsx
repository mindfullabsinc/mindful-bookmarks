import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* Component & context */
import PopUpComponent from '@/components/PopUpComponent';
import { AppContext } from '@/scripts/AppContextProvider';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';
import { SELECT_NEW } from '@/core/utils/lastSelectedGroup';

import { within } from '@testing-library/dom';

// Make lastSelectedGroup helpers no-ops to avoid BroadcastChannel/poll delays
jest.mock('@/core/utils/lastSelectedGroup', () => ({
  SELECT_NEW: '__NEW_GROUP__',
  lastGroupKey: jest.fn(() => 'test-last-key'),
  writeLastSelectedGroup: jest.fn(),
  broadcastLastSelectedGroup: jest.fn(),
}));

// --- Mock chrome.tabs.query ---
beforeAll(() => {
  // Minimal chrome mock with runtime.id so window.close() gets called
  global.chrome = {
    tabs: {
      query: jest.fn((query, cb) =>
        cb([{ url: 'example.com', title: 'Example Site' }])
      ),
    },
    runtime: { id: 'test-extension-id' },
  };
});

afterAll(() => {
  // @ts-ignore
  delete global.chrome;
});

// --- Mock useBookmarkManager and expose the inner mock safely ---
jest.mock('@/hooks/useBookmarkManager', () => {
  const addNamedBookmarkMock = jest.fn();
  return {
    __esModule: true,
    useBookmarkManager: () => ({ addNamedBookmark: addNamedBookmarkMock }),
    // expose for tests
    addNamedBookmarkMock,
  };
});
import { addNamedBookmarkMock } from '@/hooks/useBookmarkManager';

// Silence window.alert in tests (and let us assert on it)
const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});

afterEach(() => {
  jest.clearAllMocks();
  // Persisted default group is scoped by (userId, storageMode); clear to avoid cross-test leakage
  try { localStorage.clear(); } catch {}
});

function renderWithContext(groups, opts = {}) {
  const ctxValue = {
    // fast index not required here; component will use bookmarkGroups fallback
    groupsIndex: [],
    bookmarkGroups: groups,
    // ensure scope is known so the default selection logic runs
    userId: opts.userId ?? 'u_test',
    storageMode: opts.storageMode ?? 'local',
    activeWorkspaceId: opts.activeWorkspaceId ?? 'ws-a',
  };
  return render(
    <AppContext.Provider value={ctxValue}>
      <PopUpComponent />
    </AppContext.Provider>
  );
}

describe('PopUpComponent', () => {
  test('defaults to first non-empty group and submits with existing group', async () => {
    const groups = [
      { id: 'g0', groupName: EMPTY_GROUP_IDENTIFIER },
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Personal' },
    ];

    renderWithContext(groups);

    // Wait for initial tab effect to populate fields
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^Name$/i })).toHaveValue('Example Site')
    );
    expect(screen.getByLabelText(/URL/i)).toHaveValue('example.com');

    // Dropdown should default to the first *non-empty* group (id value), label "Work"
    const groupSelect = screen.getByRole('combobox', { name: /^Group$/i });
    expect(groupSelect).toHaveValue('g1'); // value is id
    // also assert the visible label of the selected option
    const selected = within(groupSelect).getByRole('option', { selected: true });
    expect(selected).toHaveTextContent('Work');

    // Submit without changing anything
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));

    // constructValidURL should add http:// to example.com
    expect(addNamedBookmarkMock).toHaveBeenCalledTimes(1);
    expect(addNamedBookmarkMock).toHaveBeenCalledWith(
      'Example Site',
      'http://example.com',
      'Work'
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  test('selecting "New Group" requires a name; then submits with new group name', async () => {
    const groups = [
      { id: 'g0', groupName: EMPTY_GROUP_IDENTIFIER },
      // no valid existing groups -> default to "New Group"
    ];
    renderWithContext(groups);
    
    // Wait for effects
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^Name$/i })).toHaveValue('Example Site')
    );

    // Disable native form validation so the onSubmit handler runs
    const form = screen.getByRole('form', { name: /add bookmark/i });
    form.noValidate = true; // equivalent to adding `novalidate`

    // It should default to "New Group" (value is SELECT_NEW; label is "New Group")
    const groupSelect = screen.getByRole('combobox', { name: /^Group$/i });
    expect(groupSelect).toHaveValue(SELECT_NEW);
    const selected = within(groupSelect).getByRole('option', { selected: true });
    expect(selected).toHaveTextContent('New Group');

    // "New Group Name" input should be visible
    const newGroupInput = screen.getByLabelText(/New Group Name/i);

    // Case 1: try to submit without new group name -> alerts and does not submit
    await userEvent.clear(newGroupInput);
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(alertSpy).toHaveBeenCalled();
    expect(addNamedBookmarkMock).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();

    // Case 2: provide a new group name, then submit -> calls addNamedBookmark
    await userEvent.type(newGroupInput, 'Reading List');

    // Optionally tweak name/url to ensure values are read from inputs
    const nameInput = screen.getByRole('textbox', { name: /^Name$/i });
    const urlInput  = screen.getByRole('textbox', { name: /^URL$/i });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Cool Article');

    await userEvent.clear(screen.getByLabelText(/URL/i));
    await userEvent.type(screen.getByLabelText(/URL/i), 'news.ycombinator.com');

    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));

    expect(addNamedBookmarkMock).toHaveBeenCalledTimes(1);
    expect(addNamedBookmarkMock).toHaveBeenCalledWith(
      'Cool Article',
      'http://news.ycombinator.com',
      'Reading List'
    );
    // Close happens after async id-upgrade path; wait for it
    await waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 2000 });
  });
});
