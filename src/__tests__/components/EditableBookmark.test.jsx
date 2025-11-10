import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { EditableBookmark } from '@/components/EditableBookmark'; 
import { AppContext } from '@/scripts/AppContextProvider'; 
import { useBookmarkManager } from '@/hooks/useBookmarkManager'; 

// Mocks
jest.mock('@/hooks/useBookmarkManager');
jest.mock('@/core/utils/utilities', () => ({
  createUniqueID: jest.fn(() => 'unique-id-123'),
}));
const mockOpenCopyTo = jest.fn();
jest.mock('@/scripts/events/copyToBridge', () => ({
  openCopyTo: (...args) => mockOpenCopyTo(...args),
}));

describe('EditableBookmark Component', () => {
  const mockEditBookmarkName = jest.fn();
  const mockDeleteBookmark = jest.fn();

  // Add an id for copy/move payload assertions
  const mockBookmark = { id: 'bookmark-1', name: 'Google', url: 'https://google.com' };
  const mockBookmarkGroups = [
    {
      groupName: 'Search Engines',
      bookmarks: [mockBookmark, { id: 'bookmark-2', name: 'Bing', url: 'https://bing.com' }],
    },
  ];
  const mockSetBookmarkGroups = jest.fn();
  
  // Reusable renderer with optional context overrides
  const renderComponent = (ctxOverrides = {}) => {
    useBookmarkManager.mockReturnValue({
      deleteBookmark: mockDeleteBookmark,
      editBookmarkName: mockEditBookmarkName,
    });

    const contextValue = {
      bookmarkGroups: mockBookmarkGroups,
      setBookmarkGroups: mockSetBookmarkGroups,
      userId: 'test-user-id',
      activeWorkspaceId: 'ws-a', // default present for copy/move tests
      ...ctxOverrides,
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
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---
  test('should render the bookmark with correct name, link, and favicon', () => {
    renderComponent();

    const linkElement = screen.getByRole('link', { name: 'Google' });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://google.com');

    const faviconElement = document.querySelector('.favicon');
    expect(faviconElement).toBeTruthy();
    expect(faviconElement).toHaveAttribute('src', expect.stringContaining('google.com'));
    expect(faviconElement.src).toMatch(
      /icons\.duckduckgo\.com\/ip3\/google\.com\.ico|www\.google\.com\/s2\/favicons|t3\.gstatic\.com\/faviconV2/i
    );
  });
  
  // --- Edit name flow ---
  test('should allow editing the bookmark name on edit button click', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const linkElement = screen.getByRole('link', { name: 'Google' });
    const editButton = screen.getByRole('button', { name: /edit bookmark/i });

    await user.click(editButton);

    expect(linkElement).toHaveAttribute('contenteditable', 'true');
    
    linkElement.focus();
    await user.clear(linkElement);
    await user.type(linkElement, 'Google Search');
    fireEvent.keyDown(linkElement, { key: 'Enter', code: 'Enter' });
    
    await waitFor(() => {
      expect(mockEditBookmarkName).toHaveBeenCalledWith(0, 0, 'Google Search');
    });

    expect(linkElement).not.toHaveAttribute('contenteditable', 'true');
    expect(screen.getByRole('link', { name: 'Google Search' })).toBeInTheDocument();
  });

  // --- Delete flow ---
  test('should call deleteBookmark when deletion is confirmed', async () => {
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
    const user = userEvent.setup();
    renderComponent();

    const deleteButton = screen.getByRole('button', { name: /delete bookmark/i });
    await user.click(deleteButton);
    
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete the "Google" bookmark from "Search Engines"?'
    );

    await waitFor(() => {
      expect(mockDeleteBookmark).toHaveBeenCalledWith(0, 0);
    });
  });
  
  test('should not call deleteBookmark when deletion is cancelled', async () => {
    jest.spyOn(window, 'confirm').mockImplementation(() => false);

    const user = userEvent.setup();
    renderComponent();

    const deleteButton = screen.getByRole('button', { name: /delete bookmark/i });
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteBookmark).not.toHaveBeenCalled();
  });

  // --- Copy / Move flow ---
  test('clicking Copy/Move opens the copy modal bridge with correct payload when activeWorkspaceId exists', async () => {
    const user = userEvent.setup();
    renderComponent(); // activeWorkspaceId defaults to 'ws-a'

    const copyBtn = screen.getByRole('button', { name: /copy\/move bookmark/i });
    await user.click(copyBtn);

    expect(mockOpenCopyTo).toHaveBeenCalledTimes(1);
    expect(mockOpenCopyTo).toHaveBeenCalledWith({
      kind: 'bookmark',
      fromWorkspaceId: 'ws-a',
      bookmarkIds: ['bookmark-1'],
    });
  });

  test('clicking Copy/Move does nothing when activeWorkspaceId is missing', async () => {
    const user = userEvent.setup();
    renderComponent({ activeWorkspaceId: undefined });

    const copyBtn = screen.getByRole('button', { name: /copy\/move bookmark/i });
    await user.click(copyBtn);

    expect(mockOpenCopyTo).not.toHaveBeenCalled();
  });
});
