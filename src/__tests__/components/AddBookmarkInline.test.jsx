import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AddBookmarkInline } from '@/components/AddBookmarkInline';
import { AppContext } from '@/scripts/AppContextProvider';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { constructValidURL } from '@/core/utils/Utilities';

// Mock the custom hook and utilities
jest.mock('@/hooks/useBookmarkManager');
jest.mock('@/core/utils/Utilities');

jest.mock('@/analytics/AnalyticsContext', () => {
  const React = require('react');
  const stub = { capture: jest.fn(), optOut: false, setOptOut: jest.fn(), userId: 'test' };
  return {
    // If anything renders the provider, make it a no-op wrapper
    AnalyticsProvider: ({ children }) => <>{children}</>,
    // Context export (in case some code accesses it directly)
    AnalyticsContext: React.createContext(stub),
    // The hook used by AddBookmarkInline → return a stable stub
    useAnalytics: () => stub,
  };
});

// Mock the AppContext
const mockContext = {
  bookmarkGroups: [{ groupName: 'Test Group', bookmarks: [] }],
  setBookmarkGroups: jest.fn(),
  userId: 'test-user-123',
};

// Mock the return value of the custom hook
const mockAddNamedBookmark = jest.fn();
useBookmarkManager.mockReturnValue({
  addNamedBookmark: mockAddNamedBookmark,
});

// Mock the utility function
constructValidURL.mockImplementation(url => `https://www.${url}`);

describe('AddBookmarkInline Component', () => {

  // Function to render the component with the mock context
  const renderComponent = () => {
    return render(
      <AppContext.Provider value={mockContext}>
        <AddBookmarkInline groupIndex={0} />
      </AppContext.Provider>
    );
  };

  // Cleanup mocks after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initially render the "Add a link" button', () => {
    renderComponent();
    expect(screen.getByText('+ Add a link')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
  });

  test('should show the new bookmark form when "Add a link" button is clicked', () => {
    renderComponent();
    const addButton = screen.getByText('+ Add a link');
    fireEvent.click(addButton);

    expect(screen.getByPlaceholderText('Enter a link name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a link URL')).toBeInTheDocument();
    expect(screen.getByText('Add link')).toBeInTheDocument();
  });

  test('should update input fields as the user types', () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    const nameInput = screen.getByPlaceholderText('Enter a link name');
    const urlInput = screen.getByPlaceholderText('Enter a link URL');

    fireEvent.change(nameInput, { target: { value: 'Google' } });
    fireEvent.change(urlInput, { target: { value: 'google.com' } });

    expect(nameInput.value).toBe('Google');
    expect(urlInput.value).toBe('google.com');
  });

  test('should call addNamedBookmark and hide the form on submit', async () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    const nameInput = screen.getByPlaceholderText('Enter a link name');
    const urlInput = screen.getByPlaceholderText('Enter a link URL');
    const submitButton = screen.getByText('Add link');

    fireEvent.change(nameInput, { target: { value: 'Google' } });
    fireEvent.change(urlInput, { target: { value: 'google.com' } });
    fireEvent.click(submitButton);
    
    // We need to wait for the async handleSubmit to complete
    await screen.findByText('+ Add a link');

    expect(constructValidURL).toHaveBeenCalledWith('google.com');
    expect(mockAddNamedBookmark).toHaveBeenCalledWith('Google', 'https://www.google.com', 'Test Group');
    
    // The form should be hidden after submission
    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
  });

  test('should call handleSubmit when Enter key is pressed in the form', async () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    const nameInput = screen.getByPlaceholderText('Enter a link name');
    const urlInput = screen.getByPlaceholderText('Enter a link URL');

    fireEvent.change(nameInput, { target: { value: 'Facebook' } });
    fireEvent.change(urlInput, { target: { value: 'facebook.com' } });

    // Simulate pressing Enter on the URL input
    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });
    
    await screen.findByText('+ Add a link');

    expect(constructValidURL).toHaveBeenCalledWith('facebook.com');
    expect(mockAddNamedBookmark).toHaveBeenCalledWith('Facebook', 'https://www.facebook.com', 'Test Group');
  });

  test('should hide the form when the close button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    // Make sure the form is visible first
    expect(screen.getByPlaceholderText('Enter a link name')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /close form/i });
    fireEvent.click(closeButton);

    // The form should now be hidden
    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
    expect(screen.getByText('+ Add a link')).toBeInTheDocument();
  });
});
