import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBanner from '@/components/TopBanner';
import { AppContext } from '@/scripts/AppContextProvider';

// Mock CSS imports for Jest (adjust path if your CSS file differs)
jest.mock('@/styles/components/top-banner.css', () => ({}));

describe('TopBanner Component', () => {
  const mockOnLoadBookmarks = jest.fn();
  const mockOnExportBookmarks = jest.fn();
  const mockOnSignIn = jest.fn();
  const mockOnSignOut = jest.fn();
  const mockChangeStorageMode = jest.fn();

  const mockUserAttributes = {
    given_name: 'Jane',
    family_name: 'Doe',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Signed-Out ---
  describe('when user is signed out', () => {
    beforeEach(() => {
      const mockContext = { storageMode: 'local' };

      render(
        <AppContext.Provider value={mockContext}>
          <TopBanner
            onExportBookmarks={mockOnExportBookmarks}
            userAttributes={mockUserAttributes}
            onSignIn={mockOnSignIn}
            onSignOut={mockOnSignOut}
            isSignedIn={false}
            onStorageModeChange={mockChangeStorageMode}
          />
        </AppContext.Provider>
      );
    });

    it('renders logo and main action buttons', () => {
      expect(screen.getByText('Mindful')).toBeInTheDocument();
      // Buttons are labeled via aria-label (no title attribute anymore)
      expect(screen.getByRole('button', { name: /load bookmarks/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export bookmarks/i })).toBeInTheDocument();
    });

    it('shows a Sign in button and not the user avatar', () => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      // Avatar button has aria-label "Manage account" when signed in; ensure it's not present
      expect(screen.queryByRole('button', { name: /manage account/i })).not.toBeInTheDocument();
    });

    it('calls the correct handlers when buttons are clicked', async () => {
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /export bookmarks/i }));
      expect(mockOnExportBookmarks).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      expect(mockOnSignIn).toHaveBeenCalledTimes(1);
    });

    it('opens the import modal from Load bookmarks', async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /load bookmarks/i }));
    
      // Modal should appear (rendered via portal with aria-labelledby="import-title")
      expect(screen.getByRole('dialog', { name: /import bookmarks/i })).toBeInTheDocument();
    
      // Old callback should not fire anymore
      expect(mockOnLoadBookmarks).not.toHaveBeenCalled();
    
      // Export still works
      await user.click(screen.getByRole('button', { name: /export bookmarks/i }));
      expect(mockOnExportBookmarks).toHaveBeenCalledTimes(1);
    });

  });

  // --- Signed-In ---
  describe('when user is signed in', () => {
    beforeEach(() => {
      const mockContext = { storageMode: 'remote' };

      render(
        <AppContext.Provider value={mockContext}>
          <TopBanner
            onExportBookmarks={mockOnExportBookmarks}
            userAttributes={mockUserAttributes}
            onSignIn={mockOnSignIn}
            onSignOut={mockOnSignOut}
            isSignedIn={true}
            onStorageModeChange={mockChangeStorageMode}
          />
        </AppContext.Provider>
      );
    });

    const getAvatarButton = () =>
      screen.getAllByRole('button', { name: /manage account/i })
            .find(el => el.getAttribute('aria-haspopup') === 'menu');

    it('renders the user avatar initials and not the Sign in button', () => {
      expect(screen.getByText('JD')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    });

    it('toggles the user dropdown when the avatar is clicked', async () => {
      const user = userEvent.setup();

      // Initially closed
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();

      // Open
      await user.click(getAvatarButton());
      expect(await screen.findByText('Logout')).toBeInTheDocument();

      // Close
      await user.click(getAvatarButton());
      await waitFor(() =>
        expect(screen.queryByText('Logout')).not.toBeInTheDocument()
      );
    });

    it('calls onSignOut and closes the dropdown on Logout click', async () => {
      const user = userEvent.setup();

      // Open
      await user.click(getAvatarButton());
      // Logout
      await user.click(screen.getByText('Logout'));

      expect(mockOnSignOut).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });

    it('closes the dropdown when clicking outside', async () => {
      const user = userEvent.setup();

      // Open
      await user.click(getAvatarButton());
      expect(screen.getByText('Logout')).toBeInTheDocument();

      // Click outside
      await user.click(document.body);

      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });

    it('displays storage toggle checked when storageMode is remote', async () => {
      const user = userEvent.setup();
      await user.click(getAvatarButton());

      const storageToggle = screen.getByRole('checkbox');
      expect(storageToggle).toBeChecked();
    });

    it('calls onStorageModeChange when the toggle is clicked', async () => {
      const user = userEvent.setup();
      await user.click(getAvatarButton());

      const storageToggle = await screen.findByRole('checkbox');
      await user.click(storageToggle);

      expect(mockChangeStorageMode).toHaveBeenCalledTimes(1);
    });
  });
});
