import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { EditableBookmark } from '@/components/EditableBookmark'; 
import { AppContext } from '@/scripts/AppContextProvider'; 
import { useBookmarkManager } from '@/hooks/useBookmarkManager'; 

// Mock the custom hook and utility functions
jest.mock('@/hooks/useBookmarkManager');
jest.mock('@/core/utils/Utilities', () => ({
  createUniqueID: jest.fn(() => 'unique-id-123'),
}));

describe('EditableBookmark Component', () => {
  // Mock functions to be returned by the useBookmarkManager hook
  const mockEditBookmarkName = jest.fn();
  const mockDeleteBookmark = jest.fn();

  // Mock context data
  const mockBookmark = { name: 'Google', url: 'https://google.com' };
  const mockBookmarkGroups = [
    {
      groupName: 'Search Engines',
      bookmarks: [mockBookmark, { name: 'Bing', url: 'https://bing.com' }],
    },
  ];
  const mockSetBookmarkGroups = jest.fn();
  
  // A re-usable setup function to render the component with mocks
  const renderComponent = () => {
    // Before each render, reset the mock hook implementation
    useBookmarkManager.mockReturnValue({
      deleteBookmark: mockDeleteBookmark,
      editBookmarkName: mockEditBookmarkName,
    });

    const contextValue = {
      bookmarkGroups: mockBookmarkGroups,
      setBookmarkGroups: mockSetBookmarkGroups,
      userId: 'test-user-id',
    };

    return render(
      <AppContext.Provider value={contextValue}>
        <EditableBookmark
          bookmark={mockBookmark}
          groupIndex={0}
          bookmarkIndex={0}
        />
      </AppContext.Provider>
    );
  };
  
  // Clear all mocks before each test to ensure isolation
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Test Suites ---

  test('should render the bookmark with correct name, link, and favicon', () => {
    renderComponent();

    // Check if the link is rendered with the correct name and href
    const linkElement = screen.getByRole('link', { name: 'Google' });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://google.com');

    // Check if the favicon is rendered with the correct URL
    // Check if the favicon <img> is present and points at a valid source for google.com
    const faviconElement = document.querySelector('.favicon');
    expect(faviconElement).toBeTruthy();
    expect(faviconElement).toHaveAttribute('src', expect.stringContaining('google.com'));
    // Make the assertion resilient to service order
    expect(faviconElement.src).toMatch(
      /icons\.duckduckgo\.com\/ip3\/google\.com\.ico|www\.google\.com\/s2\/favicons|t3\.gstatic\.com\/faviconV2/i
    );

  });
  
  // ---

  test('should allow editing the bookmark name on edit button click', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Get the link and the edit button
    // Note: It's better to add aria-labels to buttons for accessibility and easier testing
    const linkElement = screen.getByRole('link', { name: 'Google' });
    const editButton = screen.getAllByRole('button')[0]; // Assuming Edit is the first button

    // 1. Click the edit button
    await user.click(editButton);

    // 2. Verify the link is now editable
    expect(linkElement).toHaveAttribute('contenteditable', 'true');
    
    // 3. Simulate user typing a new name and pressing Enter
    linkElement.focus();
    await user.clear(linkElement);
    await user.type(linkElement, 'Google Search');
    fireEvent.keyDown(linkElement, { key: 'Enter', code: 'Enter' });
    
    // 4. Wait for async operations and assert the hook was called
    await waitFor(() => {
      expect(mockEditBookmarkName).toHaveBeenCalledWith(0, 0, 'Google Search');
    });

    // 5. Verify the link is no longer editable
    expect(linkElement).not.toHaveAttribute('contenteditable', 'true');
    
    // 6. Verify the UI updates with the new name
    expect(screen.getByRole('link', { name: 'Google Search' })).toBeInTheDocument();
  });

  // ---

  test('should call deleteBookmark when deletion is confirmed', async () => {
    // Spy on window.confirm and mock its return value to 'true'
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
    
    const user = userEvent.setup();
    renderComponent();

    const deleteButton = screen.getAllByRole('button')[1]; // Assuming Delete is the second button

    // 1. Click the delete button
    await user.click(deleteButton);
    
    // 2. Verify window.confirm was called with the correct message
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete the Google bookmark from Search Engines?'
    );

    // 3. Wait for async deletion and verify the hook was called
    await waitFor(() => {
      expect(mockDeleteBookmark).toHaveBeenCalledWith(0, 0);
    });
  });
  
  // ---

  test('should not call deleteBookmark when deletion is cancelled', async () => {
    // Spy on window.confirm and mock its return value to 'false'
    jest.spyOn(window, 'confirm').mockImplementation(() => false);

    const user = userEvent.setup();
    renderComponent();

    const deleteButton = screen.getAllByRole('button')[1];

    // 1. Click the delete button
    await user.click(deleteButton);

    // 2. Verify window.confirm was called
    expect(window.confirm).toHaveBeenCalled();
    
    // 3. Verify the delete function was NOT called
    expect(mockDeleteBookmark).not.toHaveBeenCalled();
  });
});