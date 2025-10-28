import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';
import { EMPTY_GROUP_IDENTIFIER, StorageMode } from '@/scripts/Constants';

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
jest.mock('@/scripts/Utilities', () => ({
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
  Storage: jest.fn().mockImplementation(() => {
    return {
      save: mockStorageSave,
      load: mockStorageLoad,
    };
  }),
}));

// Import after mocks are defined to get a reference to the mock functions
const { v4: mockV4 } = require('uuid');
const { refreshOtherMindfulTabs } = require('@/scripts/Utilities');


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
        storageMode: StorageMode,
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
    expect(mockStorageSave).toHaveBeenCalledWith(finalGroups, 'user-1');
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
        storageMode: StorageMode,
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
    expect(mockStorageSave).toHaveBeenCalledWith(finalGroups, 'user-2');
    expect(refreshOtherMindfulTabs).toHaveBeenCalledTimes(1);
  });
});
