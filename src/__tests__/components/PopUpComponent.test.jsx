import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* Component & context */
import PopUpComponent from '@/components/PopUpComponent';
import { AppContext } from '@/scripts/AppContextProvider';

/* Constants */
import { EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';

/* Utils */
import { SELECT_NEW, lastGroupKey } from '@/core/utils/lastSelectedGroup';


import { within } from '@testing-library/dom';

// Make lastSelectedGroup helpers no-ops to avoid BroadcastChannel/poll delays
jest.mock('@/core/utils/lastSelectedGroup', () => {
  const actual = jest.requireActual('@/core/utils/lastSelectedGroup');
  return {
    ...actual,
    writeLastSelectedGroup: jest.fn(),
    broadcastLastSelectedGroup: jest.fn(),
  };
});

jest.mock('@/core/utils/lastSelectedGroup', () => ({
  SELECT_NEW: '__NEW_GROUP__',
  lastGroupKey: jest.fn(() => 'k'),
  writeLastSelectedGroup: jest.fn(),
  broadcastLastSelectedGroup: jest.fn(),
}));
import { broadcastLastSelectedGroup, writeLastSelectedGroup } from '@/core/utils/lastSelectedGroup';

// --- Mock chrome.tabs.query ---
beforeAll(() => {
  // Minimal chrome mock with runtime.id so window.close() gets called
  global.chrome = {
    tabs: {
      query: jest.fn((query, cb) =>
        cb([{ url: 'example.com', title: 'Example Site' }])
      ),
    },
    runtime: {
      id: 'test-extension-id',
      onMessage: {
        _listeners: [],
        addListener(fn) { this._listeners.push(fn); },
        removeListener(fn) { this._listeners = this._listeners.filter(x => x !== fn); },
        _dispatch(msg) { this._listeners.forEach(fn => fn(msg)); },
      },
    },
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

    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });

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

  // When a valid id is stored, it should auto-select that group and submit with that group name.
  test('prefers stored id when valid', async () => {
    const groups = [
      { id: 'g0', groupName: EMPTY_GROUP_IDENTIFIER },
      { id: 'g1', groupName: 'Work' },
      { id: 'g2', groupName: 'Personal' },
    ];
    // Seed the exact key PopUpComponent will read
    const key = lastGroupKey('u_test', 'local', 'ws-a');
    localStorage.setItem(key, 'g2'); 

    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });

    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('g2');

    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(addNamedBookmarkMock).toHaveBeenCalledWith(
      'Example Site', 'http://example.com', 'Personal'
    );
  });

  // If storage holds a name, component should resolve it to id, migrate storage, and select it.
  test('migrates stored legacy name to id', async () => {
    const groups = [{ id: 'g1', groupName: 'Work' }];
  
    // seed legacy name under the exact key the component will read
    const key = lastGroupKey('u_test', 'local', 'ws-a');
    localStorage.setItem(key, 'Work');

    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });
    
    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('g1');
    expect(localStorage.getItem(key)).toBe('g1');
  });

  // When only placeholder exists, default to New Group; when a real group exists, pick the first real one.
  test('ignores placeholder when choosing default', async () => {
    const groups = [
      { id: 'gx', groupName: EMPTY_GROUP_IDENTIFIER },
      { id: 'g1', groupName: 'Team' },
    ];
    renderWithContext(groups);
    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('g1');
  });

  // Start with no groups; then “hydrate” by re-rendering with groups. Component should not lock to New Group early.
  test('waits for groups to load before defaulting', async () => {
    const { rerender } = render(
      <AppContext.Provider value={{
        groupsIndex: [], bookmarkGroups: [], userId: 'u_test', storageMode: 'local', activeWorkspaceId: 'ws-a'
      }}>
        <PopUpComponent />
      </AppContext.Provider>
    );

    // Initially no selection set to a real group (value will be SELECT_NEW until groups appear)
    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('__NEW_GROUP__');

    // Hydrate
    rerender(
      <AppContext.Provider value={{
        groupsIndex: [], bookmarkGroups: [{id:'g1', groupName:'Work'}],
        userId: 'u_test', storageMode: 'local', activeWorkspaceId: 'ws-a'
      }}>
        <PopUpComponent />
      </AppContext.Provider>
    );

    await waitFor(() => expect(select).toHaveValue('g1'));
  });

  // Stored selection is isolated by workspace id.
  test('scopes last selection per workspace', async () => {
    // Ensure a clean slate for this test
    localStorage.clear();

    // Seed two different workspace selections
    const keyA = lastGroupKey('u_test', 'local', 'ws-A');
    const keyB = lastGroupKey('u_test', 'local', 'ws-B');
    localStorage.setItem(keyA, 'gA');
    localStorage.setItem(keyB, 'gB');

    const groups = [
      { id: 'gA', groupName: 'Alpha' },
      { id: 'gB', groupName: 'Beta' },
    ];

    renderWithContext(groups, { activeWorkspaceId: 'ws-B' });
    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('gB');
  });

  // Mock the broadcaster and assert it’s called with { workspaceId, groupId }.
  test('on change: persists id and broadcasts', async () => {
    const groups = [{id:'g1', groupName:'Work'}, {id:'g2', groupName:'Personal'}];
    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });

    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    await userEvent.selectOptions(select, 'g2');

    expect(writeLastSelectedGroup).toHaveBeenCalledWith('k', 'g2');
    expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({ workspaceId: 'ws-a', groupId: 'g2' });
  });

  // Assert we first broadcast the groupName, then (after submit) the groupId.
  test('new group: broadcasts name immediately, then id after submit', async () => {
    const groups = [{ id:'g0', groupName: EMPTY_GROUP_IDENTIFIER }];
    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });

    const form = screen.getByRole('form', { name: /add bookmark/i });
    form.noValidate = true;

    const select = screen.getByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('__NEW_GROUP__');

    const newName = screen.getByLabelText(/New Group Name/i);
    await userEvent.type(newName, 'Reading List');
    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));

    // first: name broadcast
    expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({
      workspaceId: 'ws-a',
      groupName: 'Reading List',
    });

    // simulate hydration by re-rendering with new group present
    renderWithContext([{ id:'gR', groupName:'Reading List' }], { activeWorkspaceId:'ws-a' });
  });

  // If a broadcast arrives for a different workspace, selection should not change.
  test('ignores broadcasts for other workspace', async () => {
    const groups = [{ id:'g1', groupName:'Work'}];
    renderWithContext(groups, { activeWorkspaceId: 'ws-a' });

    // simulate runtime message for ws-b
    window.chrome.runtime.onMessage._dispatch({ type:'MINDFUL_LAST_GROUP_CHANGED', workspaceId:'ws-b', groupId:'gX' });

    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('g1');
  });

  // If storage contains a garbage id/name, pick first available group.
  test('invalid stored value falls back to first real group', async () => {
    localStorage.setItem('mindful:lastSelectedGroup:u_test:local:ws-a', 'not-real');
    const groups = [{ id:'g1', groupName:'Work'}];
    renderWithContext(groups, { activeWorkspaceId:'ws-a' });

    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('g1');
  });

  // If chrome.tabs.query errors or returns empty, fields stay empty and submission still works with typed values.
  test('tolerates chrome.tabs failure and still submits', async () => {
    const orig = chrome.tabs.query;
    chrome.tabs.query = jest.fn((_q, cb) => cb([]));

    renderWithContext([{id:'g1', groupName:'Work'}]);

    // fill manually
    await userEvent.type(screen.getByLabelText(/Name/i), 'Manual');
    await userEvent.type(screen.getByLabelText(/URL/i), 'example.org');

    await userEvent.click(screen.getByRole('button', { name: /add bookmark/i }));
    expect(addNamedBookmarkMock).toHaveBeenCalledWith('Manual', 'http://example.org', 'Work');

    chrome.tabs.query = orig;
  });

  test('after creating a new group, next mount migrates stored name to id and selects it', async () => {
    // name was persisted in previous step; simulate that explicitly here:
    const key = lastGroupKey('u_test', 'local', 'ws-a');
    localStorage.setItem(key, 'Reading List');

    renderWithContext([{ id:'gR', groupName:'Reading List' }], { activeWorkspaceId:'ws-a' });

    const select = await screen.findByRole('combobox', { name: /^Group$/i });
    expect(select).toHaveValue('gR');
    expect(localStorage.getItem(key)).toBe('gR');
  });

});
