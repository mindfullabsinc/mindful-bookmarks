// put mocks FIRST so they're applied before the component is imported
jest.mock('@/hooks/useBookmarkManager');
jest.mock('@/core/utils/utilities');

// Provide a fully stubbed Analytics module:
// - useAnalytics: stable stub (so calling it never throws)
// - AnalyticsContext: default value is the stub (so useContext(...) is truthy)
// - AnalyticsProvider: no-op wrapper (if something tries to render it)
jest.mock('@/analytics/AnalyticsContext', () => {
  const React = require('react');
  const stub = { capture: jest.fn(), identify: jest.fn(), optOut: false, setOptOut: jest.fn(), userId: 'test' };
  return {
    AnalyticsContext: React.createContext(stub),
    useAnalytics: () => stub,
    TestAnalyticsProvider: ({ children }: { children?: any }) => <>{children}</>,
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AddBookmarkInline } from '@/components/AddBookmarkInline';
import { AppContext } from '@/scripts/AppContextProvider';
import { useBookmarkManager } from '@/hooks/useBookmarkManager';
import { constructValidURL } from '@/core/utils/url';

// --- Test setup ---

// Explicitly include isSignedIn so logic that checks it is deterministic
const mockContext = {
  bookmarkGroups: [{ groupName: 'Test Group', bookmarks: [] }],
  setBookmarkGroups: jest.fn(),
  userId: 'test-user-123',
  isSignedIn: false, // anon mode in tests
};

// Will be set in beforeEach
const mockAddNamedBookmark = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  // @ts-ignore jest-extended type
  (useBookmarkManager as jest.Mock).mockReturnValue({
    addNamedBookmark: mockAddNamedBookmark,
  });

  // @ts-ignore
  (constructValidURL as jest.Mock).mockImplementation((url: string) => `https://www.${url}`);
});

describe('AddBookmarkInline Component', () => {
  const renderComponent = () =>
    render(
      <AppContext.Provider value={mockContext as any}>
        <AddBookmarkInline groupIndex={0} />
      </AppContext.Provider>
    );

  test('should initially render the "Add a link" button', () => {
    renderComponent();
    expect(screen.getByText('+ Add a link')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
  });

  test('should show the new bookmark form when "Add a link" button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    expect(screen.getByPlaceholderText('Enter a link name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a link URL')).toBeInTheDocument();
    expect(screen.getByText('Add link')).toBeInTheDocument();
  });

  test('should update input fields as the user types', () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    const nameInput = screen.getByPlaceholderText('Enter a link name') as HTMLInputElement;
    const urlInput = screen.getByPlaceholderText('Enter a link URL') as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Google' } });
    fireEvent.change(urlInput, { target: { value: 'google.com' } });

    expect(nameInput.value).toBe('Google');
    expect(urlInput.value).toBe('google.com');
  });

  test('should call addNamedBookmark and hide the form on submit', async () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    fireEvent.change(screen.getByPlaceholderText('Enter a link name'), {
      target: { value: 'Google' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter a link URL'), {
      target: { value: 'google.com' },
    });

    fireEvent.click(screen.getByText('Add link'));

    // Wait for the form to close (component returns to the button state)
    await screen.findByText('+ Add a link');

    expect(constructValidURL).toHaveBeenCalledWith('google.com');
    expect(mockAddNamedBookmark).toHaveBeenCalledWith(
      'Google',
      'https://www.google.com',
      'Test Group'
    );
    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
  });

  test('should call handleSubmit when Enter key is pressed in the form', async () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));

    const nameInput = screen.getByPlaceholderText('Enter a link name');
    const urlInput = screen.getByPlaceholderText('Enter a link URL');

    fireEvent.change(nameInput, { target: { value: 'Facebook' } });
    fireEvent.change(urlInput, { target: { value: 'facebook.com' } });

    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });

    await screen.findByText('+ Add a link');

    expect(constructValidURL).toHaveBeenCalledWith('facebook.com');
    expect(mockAddNamedBookmark).toHaveBeenCalledWith(
      'Facebook',
      'https://www.facebook.com',
      'Test Group'
    );
  });

  test('should hide the form when the close button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('+ Add a link'));
    expect(screen.getByPlaceholderText('Enter a link name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close form/i }));

    expect(screen.queryByPlaceholderText('Enter a link name')).not.toBeInTheDocument();
    expect(screen.getByText('+ Add a link')).toBeInTheDocument();
  });
});
