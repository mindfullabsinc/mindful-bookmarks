import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { EditableBookmarkGroupHeading } from '@/components/EditableBookmarkGroupHeading';
import { AppContext } from '@/scripts/AppContextProvider';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";

// Mock the CSS import
jest.mock('@/styles/EditableBookmarkGroupHeading.css', () => ({}));

// Mock the custom hook
jest.mock('@/hooks/useBookmarkManager', () => ({
  useBookmarkManager: jest.fn(),
}));

const NEW_GROUP_NAME_PLACEHOLDER = "+ Add a group";

// --- Test Suite ---
describe('EditableBookmarkGroupHeading', () => {
  let mockEditBookmarkGroupHeading;
  let mockSetBookmarkGroups;
  let mockBookmarkGroups;

  // --- Setup before each test ---
  beforeEach(() => {
    // Reset mocks before each test
    mockEditBookmarkGroupHeading = jest.fn();
    mockSetBookmarkGroups = jest.fn();
    
    // Provide a default mock implementation for the hook
    useBookmarkManager.mockReturnValue({
      editBookmarkGroupHeading: mockEditBookmarkGroupHeading,
    });

    mockBookmarkGroups = [
      { groupName: 'Work', bookmarks: [] },
      { groupName: EMPTY_GROUP_IDENTIFIER, bookmarks: [] },
    ];
  });

  // --- Helper function to render the component with context ---
  const renderComponent = (props) => {
    return render(
      <AppContext.Provider value={{ bookmarkGroups: mockBookmarkGroups, setBookmarkGroups: mockSetBookmarkGroups, userId: 'test-user-123' }}>
        <EditableBookmarkGroupHeading {...props} />
      </AppContext.Provider>
    );
  };

  // --- Test Cases ---

  test('renders the group name when provided', () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    // Check if the heading with the group name is in the document
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  test('renders the placeholder text for a new or empty group', () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    // Check if the placeholder text is rendered
    expect(screen.getByText(NEW_GROUP_NAME_PLACEHOLDER)).toBeInTheDocument();
  });

  test('switches to edit mode on click', () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    const heading = screen.getByText('Work');
    
    // The element should not be editable initially
    expect(heading).not.toHaveAttribute('contentEditable', 'true');
    
    fireEvent.click(heading);
    
    // After click, the element should be editable
    expect(heading).toHaveAttribute('contentEditable', 'true');
  });

  test('saves the new group name on blur', async () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    const heading = screen.getByText('Work');
    
    // Enter edit mode
    fireEvent.click(heading);
    
    // Simulate user typing
    heading.textContent = 'Personal';
    
    // Simulate blur event to trigger save
    fireEvent.blur(heading);

    // Wait for the async edit function to be called
    await waitFor(() => {
      expect(mockEditBookmarkGroupHeading).toHaveBeenCalledWith(0, 'Personal');
    });

    // Check if it exits edit mode
    expect(heading).not.toHaveAttribute('contentEditable', 'true');
  });

  test('reverts to placeholder if heading is empty on blur', () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);
    
    fireEvent.click(heading);
    heading.textContent = '  '; // Empty text with whitespace
    fireEvent.blur(heading);
    
    // Should revert to the placeholder text
    expect(heading.textContent).toBe(NEW_GROUP_NAME_PLACEHOLDER);
    // The save function should not be called
    expect(mockEditBookmarkGroupHeading).not.toHaveBeenCalled();
  });

  test('saves changes when Enter key is pressed', async () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    const heading = screen.getByText('Work');
    
    fireEvent.click(heading);
    heading.textContent = 'Updated Work';
    
    // Simulate pressing the Enter key
    fireEvent.keyDown(heading, { key: 'Enter', code: 'Enter' });

    // The blur event is triggered by the component, so we wait for the save function
    await waitFor(() => {
      expect(mockEditBookmarkGroupHeading).toHaveBeenCalledWith(0, 'Updated Work');
    });
    
    // It should exit edit mode
    expect(heading).not.toHaveAttribute('contentEditable', 'true');
  });

  test('cancels edit and reverts text when Escape key is pressed', () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    const heading = screen.getByText('Work');
    
    fireEvent.click(heading);
    heading.textContent = 'A change that will be reverted';
    
    // Simulate pressing the Escape key
    fireEvent.keyDown(heading, { key: 'Escape', code: 'Escape' });
    
    // The text should revert to the original group name
    expect(heading.textContent).toBe('Work');
    // The save function should not have been called
    expect(mockEditBookmarkGroupHeading).not.toHaveBeenCalled();
    // It should exit edit mode
    expect(heading).not.toHaveAttribute('contentEditable', 'true');
  });
});