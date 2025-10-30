import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Modal from 'react-modal';

// Mock the custom hook and context
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { AppContext } from '@/scripts/AppContextProvider';

// Component to test
import { CreateNewGroupPopUp } from '@/components/CreateNewGroupPopUp';

// Mocking the custom hook
jest.mock('@/hooks/useBookmarkManager', () => ({
  useBookmarkManager: jest.fn(),
}));

// Mocking the utility function
jest.mock('@/core/utils/Utilities', () => ({
  constructValidURL: (url) => `https://www.${url}`,
}));

// Set the app element for react-modal
Modal.setAppElement(document.createElement('div'));

describe('CreateNewGroupPopUp', () => {
  // Mock function for adding a bookmark
  const mockAddNamedBookmark = jest.fn();
  const groupName = 'Test Group';

  // Before each test, reset the mock and provide mock return values
  beforeEach(() => {
    useBookmarkManager.mockReturnValue({
      addNamedBookmark: mockAddNamedBookmark,
    });
    jest.clearAllMocks();
  });

  // Test case to check if the component renders the "Add Link" button
  test('renders the add link button', () => {
    render(
      <AppContext.Provider value={{ bookmarkGroups: [], setBookmarkGroups: () => {}, userId: 'test-user' }}>
        <CreateNewGroupPopUp groupName={groupName} />
      </AppContext.Provider>
    );
    expect(screen.getByText('+ Add Link')).toBeInTheDocument();
  });

  // Test case to check if the modal opens and closes
  test('opens and closes the modal', () => {
    render(
      <AppContext.Provider value={{ bookmarkGroups: [], setBookmarkGroups: () => {}, userId: 'test-user' }}>
        <CreateNewGroupPopUp groupName={groupName} />
      </AppContext.Provider>
    );

    // Modal should not be visible initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Click the button to open the modal
    fireEvent.click(screen.getByText('+ Add Link'));

    // Modal should now be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('URL')).toBeInTheDocument();

    // Click the close button
    fireEvent.click(screen.getByText('X'));

    // Modal should be closed
    // We use queryByRole because it returns null if not found, instead of throwing an error
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Test case for handling input changes
  test('handles input changes correctly', () => {
    render(
      <AppContext.Provider value={{ bookmarkGroups: [], setBookmarkGroups: () => {}, userId: 'test-user' }}>
        <CreateNewGroupPopUp groupName={groupName} />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByText('+ Add Link'));

    const nameInput = screen.getByLabelText('Name');
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(nameInput, { target: { value: 'Google' } });
    fireEvent.change(urlInput, { target: { value: 'google.com' } });

    expect(nameInput.value).toBe('Google');
    expect(urlInput.value).toBe('google.com');
  });

  // Test case for form submission
  test('calls addNamedBookmark on form submission', async () => {
    render(
      <AppContext.Provider value={{ bookmarkGroups: [], setBookmarkGroups: () => {}, userId: 'test-user' }}>
        <CreateNewGroupPopUp groupName={groupName} />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByText('+ Add Link'));

    const nameInput = screen.getByLabelText('Name');
    const urlInput = screen.getByLabelText('URL');
    const submitButton = screen.getByText('Add Bookmark');

    // Fill out the form
    fireEvent.change(nameInput, { target: { value: 'Test Bookmark' } });
    fireEvent.change(urlInput, { target: { value: 'test.com' } });

    // Submit the form
    fireEvent.click(submitButton);
    
    // The `addNamedBookmark` function should be called with the correct arguments
    expect(mockAddNamedBookmark).toHaveBeenCalledWith(
      'Test Bookmark',
      'https://www.test.com',
      groupName
    );

    // The input fields should be cleared after submission
    expect(nameInput.value).toBe('');
    expect(urlInput.value).toBe('');
  });
});
