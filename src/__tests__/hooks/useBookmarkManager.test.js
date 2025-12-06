import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';
import { EMPTY_GROUP_IDENTIFIER } from '@/core/constants/constants';
import { StorageMode } from '@/core/constants/storageMode';
import { DEFAULT_LOCAL_WORKSPACE_ID } from '@/core/constants/workspaces';

// --- Mocks ---

// NOTE: All mocking and setup for console.error is now handled globally
// in the jest.setup.js file to ensure it runs before any test files are evaluated.

// Mocking chrome APIs for a Node (Jest) environment
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: jest.fn(),
  },
};

// Mock the v4 function from the uuid library to return predictable IDs
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

// Mock the utilities module
jest.mock('@/core/utils/storageKeys', () => ({
  getUserStorageKey: (userId) => `bookmarks-${userId}`,
  refreshOtherMindfulTabs: jest.fn(),
}));

// Mock the dnd-kit arrayMove utility
jest.mock('@dnd-kit/sortable', () => ({
  arrayMove: (array, from, to) => {
    const newArray = [...array];
    const [movedItem] = newArray.splice(from, 1);
    newArray.splice(to, 0, movedItem);
    return newArray;
  },
}));

// --- Robust Mocking Strategy ---
let mockStorageSave;
let mockStorageLoad;

jest.mock('@/scripts/Storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    save: (...args) => mockStorageSave(...args),   // <-- spread args so 3rd param is OK
    load: (...args) => mockStorageLoad(...args),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mocks are defined to get a reference to the mock functions
const { v4: mockV4 } = require('uuid');
const { refreshOtherMindfulTabs } = require('@/core/utils/chrome');


// --- Test Suite ---

describe.each([
  { storageMode: StorageMode.LOCAL, description: 'local' },
  { storageMode: StorageMode.REMOTE, description: 'remote' },
])('useBookmarkManager with $description storage', ({ storageMode }) => {

  const createWrapper = (mockContextValue) => {
    return ({ children }) => (
      <AppContext.Provider value={mockContextValue}>
        {children}
      </AppContext.Provider>
    );
  };

  beforeEach(() => {
    // We only need to clear mocks here now.
    jest.clearAllMocks();
    mockStorageSave = jest.fn().mockResolvedValue(undefined);
    mockStorageLoad = jest.fn().mockResolvedValue([]);
    refreshOtherMindfulTabs.mockResolvedValue(undefined);

    let count = 1;
    mockV4.mockImplementation(() => `mock-uuid-${count++}`);
  });

  // --- Test Cases (will run for each storage type) ---

  it('should add a new bookmark in a NEW group', async () => {
    // ARRANGE
    const initialGroups = [
      { groupName: 'Work', id: 'group-1', bookmarks: [] },
      { groupName: EMPTY_GROUP_IDENTIFIER, id: 'empty-id', bookmarks: [] },
    ];
    
    const setBookmarkGroups = jest.fn().mockImplementation(updater => {
        if (typeof updater === 'function') {
            updater(initialGroups);
        }
    });
    
    const { result } = renderHook(() => useBookmarkManager(), {
      wrapper: createWrapper({
        bookmarkGroups: initialGroups,
        setBookmarkGroups,
        userId: 'user-1',
        storageMode: StorageMode.LOCAL,
        setStorageMode: jest.fn(),
        user: { identityId: 'user-1' },
      }),
    });

    // ACT
    await act(async () => {
      await result.current.addNamedBookmark('New Site', 'https://newsite.com', 'Social Media');
    });

    // ASSERT
    expect(setBookmarkGroups).toHaveBeenCalledTimes(1);
    const updaterFn = setBookmarkGroups.mock.calls[0][0];
    const finalGroups = updaterFn(initialGroups);

    expect(finalGroups.length).toBe(3);
    expect(mockStorageSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ groupName: 'Work', id: 'group-1', bookmarks: [] }),
        expect.objectContaining({
          groupName: 'Social Media',
          id: expect.any(String),
          bookmarks: [
            expect.objectContaining({
              name: 'New Site',
              url: 'https://newsite.com',
              id: expect.any(String),
            }),
          ],
        }),
        expect.objectContaining({
          groupName: EMPTY_GROUP_IDENTIFIER,
          id: 'empty-id',
          bookmarks: [],
        }),
      ]),
      'user-1',
      DEFAULT_LOCAL_WORKSPACE_ID,    // <-- include the 3rd arg your hook actually passes
    );
    expect(refreshOtherMindfulTabs).toHaveBeenCalledTimes(1);
  });

  it('should add a new bookmark to an EXISTING group', async () => {
    // ARRANGE
    const initialGroups = [
      { groupName: 'Work', id: 'group-1', bookmarks: [{ name: 'Internal Docs', url: 'https://docs.internal', id: 'bm-1' }] },
      { groupName: 'Personal', id: 'group-2', bookmarks: [] },
    ];

    const setBookmarkGroups = jest.fn().mockImplementation(updater => {
        if (typeof updater === 'function') {
            updater(initialGroups);
        }
    });

    const { result } = renderHook(() => useBookmarkManager(), {
      wrapper: createWrapper({
        bookmarkGroups: initialGroups,
        setBookmarkGroups,
        userId: 'user-2',
        storageMode: StorageMode.LOCAL,
        setStorageMode: jest.fn(),
        user: { identityId: 'user-2' },
      }),
    });

    // ACT
    await act(async () => {
      await result.current.addNamedBookmark('Company Blog', 'https://blog.co', 'Work');
    });

    // ASSERT
    const updaterFn = setBookmarkGroups.mock.calls[0][0];
    const finalGroups = updaterFn(initialGroups);
    const workGroup = finalGroups.find(g => g.groupName === 'Work');

    expect(workGroup.bookmarks.length).toBe(2);
    expect(workGroup.bookmarks[1].name).toBe('Company Blog');
    expect(mockStorageSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          groupName: 'Work',
          id: 'group-1',
          bookmarks: expect.arrayContaining([
            expect.objectContaining({ id: 'bm-1', name: 'Internal Docs', url: 'https://docs.internal' }),
            expect.objectContaining({ name: 'Company Blog', url: 'https://blog.co', id: expect.any(String) }),
          ]),
        }),
        expect.objectContaining({ groupName: 'Personal', id: 'group-2', bookmarks: [] }),
      ]),
      'user-2',
      DEFAULT_LOCAL_WORKSPACE_ID,
    );
    expect(refreshOtherMindfulTabs).toHaveBeenCalledTimes(1);
  });
});
