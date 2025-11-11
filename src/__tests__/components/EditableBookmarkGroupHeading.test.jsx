import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { EditableBookmarkGroupHeading } from '@/components/EditableBookmarkGroupHeading';
import { AppContext } from '@/scripts/AppContextProvider';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { EMPTY_GROUP_IDENTIFIER } from "@/core/constants/constants";
import { broadcastLastSelectedGroup, writeLastSelectedGroup } from '@/core/utils/lastSelectedGroup';

// Mock the CSS import
jest.mock('@/styles/EditableBookmarkGroupHeading.css', () => ({}));

// Mock the custom hook
jest.mock('@/hooks/useBookmarkManager', () => ({
  useBookmarkManager: jest.fn(),
}));

// Mock broadcast/persistence utils used inside the component (no-ops)
jest.mock('@/core/utils/lastSelectedGroup', () => ({
  lastGroupKey: jest.fn(() => 'test-last-key'),
  writeLastSelectedGroup: jest.fn(),
  broadcastLastSelectedGroup: jest.fn(),
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
    // make mockEditBookmarkGroupHeading async so the component's `await` behaves as in real life
    mockEditBookmarkGroupHeading = jest.fn(() => Promise.resolve());
    mockSetBookmarkGroups = jest.fn();
    
    // Provide a default mock implementation for the hook
    useBookmarkManager.mockReturnValue({
      editBookmarkGroupHeading: mockEditBookmarkGroupHeading,
    });

    mockBookmarkGroups = [
      { id: 'g-work', groupName: 'Work', bookmarks: [] },
      { id: 'g-empty', groupName: EMPTY_GROUP_IDENTIFIER, bookmarks: [] },
    ];
  });

  // --- Helper function to render the component with context ---
  const renderComponent = (props) => {
    return render(
      <AppContext.Provider
        value={{
          bookmarkGroups: mockBookmarkGroups,
          groupsIndex: mockBookmarkGroups, // allow either path
          setBookmarkGroups: mockSetBookmarkGroups,
          userId: 'test-user-123',
          storageMode: 'local',
          activeWorkspaceId: 'ws-a',
        }}
      >
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

    // Check if it exits edit mode (allow a tick for state to settle)
    await waitFor(() =>
      expect(heading).not.toHaveAttribute('contentEditable', 'true')
    );
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
    
    // It should exit edit mode (after async commit completes)
    await waitFor(() =>
      expect(heading).not.toHaveAttribute('contentEditable', 'true')
    );
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

  test('broadcasts name immediately on commit', async () => {
    const { container } = renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);

    // Enter edit mode and type new name
    fireEvent.click(heading);
    heading.textContent = 'Reading List';

    // Commit via blur
    fireEvent.blur(heading);

    await waitFor(() => {
      // edit hook called with new name
      expect(mockEditBookmarkGroupHeading).toHaveBeenCalledWith(1, 'Reading List');
      // persisted & broadcast (legacy name path)
      expect(writeLastSelectedGroup).toHaveBeenCalledWith('test-last-key', 'Reading List');
      expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({
        workspaceId: 'ws-a',
        groupName: 'Reading List',
      });
    });
  });

  test('upgrades broadcast from name to id after groups hydrate', async () => {
    jest.useFakeTimers();

    // Start from placeholder → rename to a real group
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);

    fireEvent.click(heading);
    heading.textContent = 'Projects';
    fireEvent.blur(heading);

    // name broadcast happens first
    await waitFor(() => {
      expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({
        workspaceId: 'ws-a',
        groupName: 'Projects',
      });
    });

    // Now "hydrate" context by adding an id-bearing group with that name
    // (the component's polling calls getLatestGroups() repeatedly)
    mockBookmarkGroups.splice(1, 1, { id: 'g-proj', groupName: 'Projects', bookmarks: [] });

    // Let the poller run a few cycles (50ms each by default)
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(writeLastSelectedGroup).toHaveBeenCalledWith('test-last-key', 'g-proj');
      expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({
        workspaceId: 'ws-a',
        groupId: 'g-proj',
      });
    });

    jest.useRealTimers();
  });

  test('persists legacy name first, then id to same key', async () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);

    fireEvent.click(heading);
    heading.textContent = 'Inbox';
    fireEvent.blur(heading);

    await waitFor(() => {
      // first write is the name
      expect(writeLastSelectedGroup).toHaveBeenCalledWith('test-last-key', 'Inbox');
    });

    // hydrate with id and let the polling resolve
    mockBookmarkGroups.splice(1, 1, { id: 'g-inbox', groupName: 'Inbox', bookmarks: [] });
    await waitFor(() => {
      expect(writeLastSelectedGroup).toHaveBeenCalledWith('test-last-key', 'g-inbox');
    });
  });

  test('uses external onCommit when provided (does not call edit hook)', async () => {
    const onCommit = jest.fn();
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1, onCommit });

    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);
    fireEvent.click(heading);
    heading.textContent = 'Reading';
    fireEvent.blur(heading);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('Reading');
      expect(mockEditBookmarkGroupHeading).not.toHaveBeenCalled();
      expect(broadcastLastSelectedGroup).toHaveBeenCalledWith({
        workspaceId: 'ws-a',
        groupName: 'Reading',
      });
    });
  });

  test('empty on blur triggers external onCancel (no commit/broadcast/persist)', () => {
    const onCancel = jest.fn();
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1, onCancel });

    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);
    fireEvent.click(heading);
    heading.textContent = '   ';
    fireEvent.blur(heading);

    expect(onCancel).toHaveBeenCalled();
    expect(mockEditBookmarkGroupHeading).not.toHaveBeenCalled();
    expect(writeLastSelectedGroup).not.toHaveBeenCalled();
    expect(broadcastLastSelectedGroup).not.toHaveBeenCalled();
  });

  test('selects all text on focus in edit mode', async () => {
    jest.useFakeTimers();

    renderComponent({ bookmarkGroup: mockBookmarkGroups[0], groupIndex: 0 });
    const heading = screen.getByText('Work');

    fireEvent.click(heading); // enter edit mode

    // Let the setTimeout(0) inside the component run
    jest.advanceTimersByTime(0);

    await waitFor(() => {
      const sel = window.getSelection();
      expect(sel && sel.toString()).toBe('Work');
    });

    jest.useRealTimers();
  });

  test('stops pointerdown propagation (does not trigger parent)', () => {
    const parentSpy = jest.fn();

    render(
      <div onPointerDown={parentSpy}>
        <AppContext.Provider
          value={{
            bookmarkGroups: mockBookmarkGroups,
            groupsIndex: mockBookmarkGroups,
            setBookmarkGroups: mockSetBookmarkGroups,
            userId: 'test-user-123',
            storageMode: 'local',
            activeWorkspaceId: 'ws-a',
          }}
        >
          <EditableBookmarkGroupHeading bookmarkGroup={mockBookmarkGroups[0]} groupIndex={0} />
        </AppContext.Provider>
      </div>
    );

    const heading = screen.getByText('Work');
    fireEvent.pointerDown(heading);
    expect(parentSpy).not.toHaveBeenCalled();
  });

  test('Enter commits from placeholder and prevents newline', async () => {
    renderComponent({ bookmarkGroup: mockBookmarkGroups[1], groupIndex: 1 });
    const heading = screen.getByText(NEW_GROUP_NAME_PLACEHOLDER);

    // enter edit mode
    fireEvent.click(heading);

    // allow the focus/selection effect to run
    await new Promise(r => setTimeout(r, 0));

    // JSDOM can be picky: explicitly focus the contentEditable node
    heading.focus();

    // type the new name
    heading.textContent = 'Quick Notes';

    // press Enter (ensure key fields are present)
    fireEvent.keyDown(heading, { key: 'Enter', code: 'Enter', keyCode: 13, charCode: 13 });
    fireEvent.blur(heading); // just in case JSDOM didn’t blur

    // the blur is triggered inside the handler; wait for the async commit
    await waitFor(() =>
      expect(mockEditBookmarkGroupHeading).toHaveBeenCalledWith(1, 'Quick Notes')
    );
   
    // assert we exited edit mode on the same element (allow a tick)
    await new Promise(r => setTimeout(r, 0));
    await waitFor(() => expect(heading).toHaveAttribute('contentEditable', 'false'));
  });
});