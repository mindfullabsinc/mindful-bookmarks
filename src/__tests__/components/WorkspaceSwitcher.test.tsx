/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';

// ---- Mocks ----
const mock_getActiveWorkspaceId = jest.fn<Promise<string>, []>();
const mock_listLocalWorkspaces = jest.fn<Promise<any[]>, [any?]>();
const mock_createLocalWorkspace = jest.fn<Promise<{ id: string; name: string }>, [string]>();
const mock_renameWorkspace = jest.fn<Promise<void>, [string, string]>();
const mock_archiveWorkspace = jest.fn<Promise<void>, [string]>();

jest.mock('@/workspaces/registry', () => ({
  __esModule: true,
  getActiveWorkspaceId: () => mock_getActiveWorkspaceId(),
  listLocalWorkspaces: () => mock_listLocalWorkspaces(),
  createLocalWorkspace: (name: string) => mock_createLocalWorkspace(name),
  renameWorkspace: (id: string, name: string) => mock_renameWorkspace(id, name),
  archiveWorkspace: (id: string) => mock_archiveWorkspace(id),
}));

const mock_clearSessionGroupsIndexExcept = jest.fn<Promise<void>, [string]>();
const mock_writeGroupsIndexSession = jest.fn<Promise<void>, [string, Array<{ id: string; groupName: string }>]>();

jest.mock('@/scripts/caching/bookmarkCache', () => ({
  __esModule: true,
  clearSessionGroupsIndexExcept: (id: string) => mock_clearSessionGroupsIndexExcept(id),
  writeGroupsIndexSession: (
    id: string,
    groups: Array<{ id: string; groupName: string }>
  ) => mock_writeGroupsIndexSession(id, groups),
}));

// Mock the AppContext module and use ITS context instance in tests
jest.mock('@/scripts/AppContextProvider', () => {
  const React = require('react');
  return {
    __esModule: true,
    AppContext: React.createContext({
      setActiveWorkspaceId: async (_: string) => {},
      activeWorkspaceId: 'ws-a',
    }),
  };
});
// Import the mocked context so we can provide our spy to the component
import { AppContext } from '@/scripts/AppContextProvider';
const setActiveWorkspaceId = jest.fn(async () => {});

// ---- Helpers ----
function arrange(initial = {
  activeId: 'ws-a',
  workspaces: [
    { id: 'ws-a', name: 'Alpha', createdAt: 1, updatedAt: 1, storageMode: 'LOCAL' },
    { id: 'ws-b', name: 'Beta', createdAt: 2, updatedAt: 2, storageMode: 'LOCAL' },
  ],
}) {
  mock_getActiveWorkspaceId.mockResolvedValue(initial.activeId);
  mock_listLocalWorkspaces.mockResolvedValue(initial.workspaces);
  mock_writeGroupsIndexSession.mockResolvedValue();
  mock_clearSessionGroupsIndexExcept.mockResolvedValue();

  // Wrap in a provider that exposes our spy function
  const Provider = ({ children }: { children?: React.ReactNode }) => (
    <AppContext.Provider value={{ setActiveWorkspaceId, activeWorkspaceId: initial.activeId } as any}>
      {children}
    </AppContext.Provider>
  );

  return render(
    <Provider>
      <WorkspaceSwitcher />
    </Provider>
  );
}

// Mock prompt/confirm
const promptSpy = jest.spyOn(window, 'prompt').mockImplementation(() => null);
const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);

beforeEach(() => {
  jest.clearAllMocks();
  promptSpy.mockImplementation(() => null);
  confirmSpy.mockImplementation(() => true);
});

describe('WorkspaceSwitcher', () => {
  test('boots with active workspace name on the vertical tab and lists workspaces when opened', async () => {
    arrange();

    // initial label is the active workspace's name
    await waitFor(() => {
      // the vertical label is inside the opener button
      expect(screen.getByRole('button', { name: /show workspaces/i })).toBeInTheDocument();
    });

    // open the panel
    const opener = screen.getByRole('button', { name: /show workspaces/i });
    fireEvent.click(opener);

    // wait for the dialog AND the rows to render
    await screen.findByRole('dialog', { name: /workspace switcher/i });
    await screen.findByRole('button', { name: 'Alpha' });
    await screen.findByRole('button', { name: 'Beta' });

    expect(mock_listLocalWorkspaces).toHaveBeenCalledTimes(1);
    expect(mock_getActiveWorkspaceId).toHaveBeenCalledTimes(1);
  });

  test('switching to another workspace calls setActiveWorkspaceId and cleans session mirror', async () => {
    arrange();

    // open
    fireEvent.click(screen.getByRole('button', { name: /show workspaces/i }));
    await screen.findByRole('dialog', { name: /workspace switcher/i });

    // switch to ws-b
    const betaBtn = await screen.findByRole('button', { name: 'Beta' });
    fireEvent.click(betaBtn);

    await waitFor(() => {
      expect(setActiveWorkspaceId).toHaveBeenCalledWith('ws-b');
    });

    // session mirror hygiene
    expect(mock_clearSessionGroupsIndexExcept).toHaveBeenCalledWith('ws-b');
    expect(mock_writeGroupsIndexSession).toHaveBeenCalledWith('ws-b', []);

    // refresh called
    expect(mock_listLocalWorkspaces).toHaveBeenCalledTimes(2); // once on mount + once after switch
    expect(mock_getActiveWorkspaceId).toHaveBeenCalledTimes(2);
  });

  test('creating a workspace makes it active and clears the session mirror', async () => {
    arrange();
    mock_createLocalWorkspace.mockResolvedValue({ id: 'ws-c', name: 'Local Workspace' });

    // open
    fireEvent.click(screen.getByRole('button', { name: /show workspaces/i }));
    await screen.findByRole('dialog', { name: /workspace switcher/i });

    // click "＋ New Local Workspace"
    fireEvent.click(await screen.findByRole('button', { name: /new local workspace/i }))

    await waitFor(() => {
      expect(mock_createLocalWorkspace).toHaveBeenCalledWith('Local Workspace');
      expect(setActiveWorkspaceId).toHaveBeenCalledWith('ws-c');
    });

    expect(mock_clearSessionGroupsIndexExcept).toHaveBeenCalledWith('ws-c');
    expect(mock_writeGroupsIndexSession).toHaveBeenCalledWith('ws-c', []);
    // refresh: list workspaces called again
    expect(mock_listLocalWorkspaces).toHaveBeenCalledTimes(2);
  });

  test('rename workspace prompts for new name and refreshes list', async () => {
    arrange();
    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /show workspaces/i }));
    await screen.findByRole('dialog', { name: /workspace switcher/i });
    await screen.findAllByRole('button', { name: /rename/i }); // ensure rows rendered

    // prompt returns a new value
    promptSpy.mockImplementation(() => 'Renamed');

    // click first row's rename
    const renameBtn = await screen.findByRole('button', { name: /rename alpha/i });
    fireEvent.click(renameBtn);

    await waitFor(() => {
      expect(mock_renameWorkspace).toHaveBeenCalledWith('ws-a', 'Renamed');
    });

    // refresh happens
    expect(mock_listLocalWorkspaces).toHaveBeenCalledTimes(2);
    expect(mock_getActiveWorkspaceId).toHaveBeenCalledTimes(2);
  });

  test('archive workspace confirms, archives, re-reads active ws and cleans session mirror', async () => {
    arrange({ // make Beta active initially so archive Alpha is simple
      activeId: 'ws-b',
      workspaces: [
        { id: 'ws-a', name: 'Alpha', createdAt: 1, updatedAt: 1, storageMode: 'LOCAL' },
        { id: 'ws-b', name: 'Beta', createdAt: 2, updatedAt: 2, storageMode: 'LOCAL' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /show workspaces/i }));
    await screen.findByRole('dialog', { name: /workspace switcher/i });
    await screen.findByRole('button', { name: 'Alpha' }); // ensure rows rendered

    // archive alpha
    const archiveBtn = await screen.findByRole('button', { name: /archive alpha/i }); 
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(mock_archiveWorkspace).toHaveBeenCalledWith('ws-a');
    });

    // After archive, component asks registry for current active id and sets it back
    await waitFor(() => {
      expect(setActiveWorkspaceId).toHaveBeenCalledWith('ws-b');
    });
    expect(mock_clearSessionGroupsIndexExcept).toHaveBeenCalledWith('ws-b');
    expect(mock_writeGroupsIndexSession).toHaveBeenCalledWith('ws-b', []);

    // refresh
    expect(mock_listLocalWorkspaces).toHaveBeenCalledTimes(2);
    expect(mock_getActiveWorkspaceId).toHaveBeenCalledTimes(3);
  });
});
