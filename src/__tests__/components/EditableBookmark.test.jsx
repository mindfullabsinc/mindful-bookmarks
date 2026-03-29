import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { EditableBookmark } from '@/components/EditableBookmark';
import { AppContext } from '@/scripts/AppContextProvider';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { constructValidURL } from '@/core/utils/url';

// Mocks
jest.mock('@/hooks/useBookmarkManager');
jest.mock('@/core/utils/url');
jest.mock('@/core/utils/ids', () => ({
  createUniqueID: jest.fn(() => 'unique-id-123'),
}));

describe('EditableBookmark Component', () => {
  const mockEditBookmark = jest.fn();
  const mockDeleteBookmark = jest.fn();

  const mockBookmark = { id: 'bookmark-1', name: 'Google', url: 'https://google.com' };
  const mockBookmarkGroups = [
    {
      groupName: 'Search Engines',
      bookmarks: [mockBookmark, { id: 'bookmark-2', name: 'Bing', url: 'https://bing.com' }],
    },
  ];

  const renderComponent = (ctxOverrides = {}) => {
    useBookmarkManager.mockReturnValue({
      deleteBookmark: mockDeleteBookmark,
      editBookmark: mockEditBookmark,
    });

    const contextValue = {
      bookmarkGroups: mockBookmarkGroups,
      userId: 'test-user-id',
      ...ctxOverrides,
    };

    return render(
      <AppContext.Provider value={contextValue}>
        <EditableBookmark bookmark={mockBookmark} groupIndex={0} bookmarkIndex={0} />
      </AppContext.Provider>
    );
  };

  const clipboardWriteText = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    constructValidURL.mockImplementation((url) => url);
    clipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
  });

  // --- Rendering ---
  test('should render the bookmark with correct name and link', () => {
    renderComponent();
    const linkElement = screen.getByRole('link', { name: 'Google' });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://google.com');
  });

  // --- Edit flow ---
  test('edit button opens inline form pre-filled with current URL and name', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /edit bookmark/i }));

    expect(screen.getByPlaceholderText('Enter a link URL')).toHaveValue('https://google.com');
    expect(screen.getByPlaceholderText('Enter a link name (optional)')).toHaveValue('Google');
  });

  test('submitting the edit form calls editBookmark with new values', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /edit bookmark/i }));

    const nameInput = screen.getByPlaceholderText('Enter a link name (optional)');
    await user.clear(nameInput);
    await user.type(nameInput, 'Google Search');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockEditBookmark).toHaveBeenCalledWith(0, 0, 'Google Search', 'https://google.com');
    });
    expect(screen.queryByPlaceholderText('Enter a link URL')).not.toBeInTheDocument();
  });

  test('pressing Enter in the edit form submits it', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /edit bookmark/i }));

    const urlInput = screen.getByPlaceholderText('Enter a link URL');
    fireEvent.keyDown(urlInput.closest('form'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockEditBookmark).toHaveBeenCalledWith(0, 0, 'Google', 'https://google.com');
    });
  });

  test('pressing Escape cancels the edit without saving', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /edit bookmark/i }));
    expect(screen.getByPlaceholderText('Enter a link URL')).toBeInTheDocument();

    const urlInput = screen.getByPlaceholderText('Enter a link URL');
    fireEvent.keyDown(urlInput.closest('form'), { key: 'Escape', code: 'Escape' });

    expect(screen.queryByPlaceholderText('Enter a link URL')).not.toBeInTheDocument();
    expect(mockEditBookmark).not.toHaveBeenCalled();
  });

  // --- Copy flow ---
  test('copy button writes the bookmark URL to clipboard', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /copy link url/i }));

    expect(clipboardWriteText).toHaveBeenCalledWith('https://google.com');
  });

  // --- Delete flow ---
  test('should call deleteBookmark when deletion is confirmed', async () => {
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /delete bookmark/i }));

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

    await user.click(screen.getByRole('button', { name: /delete bookmark/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteBookmark).not.toHaveBeenCalled();
  });
});
