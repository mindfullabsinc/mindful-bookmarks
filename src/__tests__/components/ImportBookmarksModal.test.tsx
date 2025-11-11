// src/__tests__/components/ImportBookmarksModal.test.tsx
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportBookmarksModal from '@/components/ImportBookmarksModal';

// Safely mock createPortal so the modal renders inline in JSDOM
jest.mock('react-dom', () => {
  const actual = jest.requireActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Minimal-but-complete chrome.permissions mock for TS
const mockPermissions = {
  contains: jest.fn().mockResolvedValue(false),
  request: jest.fn().mockResolvedValue(true),
  getAll: jest.fn().mockResolvedValue({ origins: [], permissions: [] }),
  remove: jest.fn().mockResolvedValue(true),

  // MV3 host access helpers (exist in @types/chrome)
  addHostAccessRequest: jest.fn(),
  removeHostAccessRequest: jest.fn(),

  // Events: shape must include addListener/removeListener/hasListener
  onAdded: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },
  onRemoved: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },
};

// Make it globally available for the test runtime
beforeAll(() => {
  // Cast to any so we don't have to perfectly match the full Chrome type
  (global as any).chrome = {
    permissions: mockPermissions,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions.contains.mockResolvedValue(false);
  mockPermissions.request.mockResolvedValue(false);
});

function renderModal(overrides: Partial<React.ComponentProps<typeof ImportBookmarksModal>> = {}) {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    onUploadJson: jest.fn(),
    onImportChrome: jest.fn(),
    onImportOpenTabs: jest.fn(),
    ...overrides,
  };
  render(<ImportBookmarksModal {...props} />);
  return props;
}

describe('ImportBookmarksModal', () => {
  test('renders with Chrome tab default (bookmarks + flat) and correct button label', () => {
    renderModal();

    // Tabs: "From Chrome" is active by default; action button shows flat import label
    expect(screen.getByRole('button', { name: 'From Chrome' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Import \(Flat from Bookmarks\)/i })
    ).toBeInTheDocument();

    // Source switch defaults to Bookmarks (button visually present)
    expect(screen.getByRole('button', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Tabs' })).toBeInTheDocument();
  });

  test('JSON upload flow: enables button after file pick, calls onUploadJson and closes', async () => {
    const user = userEvent.setup();
    const { onUploadJson, onClose } = renderModal();

    // Switch to JSON tab
    await user.click(screen.getByRole('button', { name: /Upload JSON/i }));

    const file = new File([JSON.stringify({ hello: 'world' })], 'test.json', {
      type: 'application/json',
    });

    const fileInput = screen.getByLabelText(/Choose JSON file/i) as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Import JSON is disabled until a file is selected
    const importBtn = screen.getByRole('button', { name: /Import JSON/i });
    expect(importBtn).toBeDisabled();

    // Pick a file
    await user.upload(fileInput, file);
    expect(importBtn).toBeEnabled();

    // Click import
    await user.click(importBtn);

    expect(onUploadJson).toHaveBeenCalledTimes(1);
    // First arg is the file
    expect(onUploadJson).toHaveBeenCalledWith(expect.objectContaining({ name: 'test.json' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Chrome bookmarks flat import: permission already granted triggers onImportChrome({mode:"flat"})', async () => {
    const user = userEvent.setup();
    mockPermissions.contains.mockResolvedValue(true);

    const { onImportChrome, onClose } = renderModal();

    // Ensure we are in Chrome tab + default "Flat"
    const actionBtn = screen.getByRole('button', { name: /Import \(Flat from Bookmarks\)/i });
    await user.click(actionBtn);

    expect(mockPermissions.contains).toHaveBeenCalledWith({ permissions: ['bookmarks'] });
    expect(onImportChrome).toHaveBeenCalledTimes(1);
    expect(onImportChrome).toHaveBeenCalledWith({ mode: 'flat' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // test('Chrome bookmarks Import bookmarks: requests permission if missing, passes smartStrategy', async () => {
  //   const user = userEvent.setup();
  //   mockPermissions.contains.mockResolvedValue(false);
  //   mockPermissions.request.mockResolvedValue(true);

  //   const { onImportChrome, onClose } = renderModal();

  //   // Switch to Smart mode
  //   const smartCard = screen.getByRole('button', { name: /Import bookmarks/i });
  //   await user.click(smartCard);

  //   // Choose "Domain" strategy
  //   const strategyBar = screen.getByText('Strategy').closest('div')!;
  //   const domainBtn = within(strategyBar).getByRole('button', { name: 'Domain' });
  //   await user.click(domainBtn);

  //   // Action button should show: Import (Smart: domain)
  //   const actionBtn = screen.getByRole('button', { name: /Import \(Smart: domain\)/i });
  //   await user.click(actionBtn);

  //   expect(mockPermissions.contains).toHaveBeenCalledWith({ permissions: ['bookmarks'] });
  //   expect(mockPermissions.request).toHaveBeenCalledWith({ permissions: ['bookmarks'] });
  //   expect(onImportChrome).toHaveBeenCalledTimes(1);
  //   expect(onImportChrome).toHaveBeenCalledWith({ mode: 'smart', smartStrategy: 'domain' });
  //   expect(onClose).toHaveBeenCalledTimes(1);
  // });

  test('Bookmarks permission denial shows error and does not call onImportChrome/onClose', async () => {
    const user = userEvent.setup();
    mockPermissions.contains.mockResolvedValue(false);
    mockPermissions.request.mockResolvedValue(false);

    const { onImportChrome, onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: /Import \(Flat from Bookmarks\)/i }));

    expect(onImportChrome).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Error banner
    expect(
      await screen.findByText(/Permission to read Chrome bookmarks was not granted\./i)
    ).toBeInTheDocument();
  });

  test('Open Tabs flow: calls onImportOpenTabs with selected options and closes', async () => {
    const user = userEvent.setup();

    // tabs permission granted
    mockPermissions.contains.mockImplementation(async (arg) => {
      if (arg?.permissions?.includes('tabs')) return true;
      return false;
    });

    const { onImportOpenTabs, onClose } = renderModal();

    // Switch source to "Open Tabs"
    await user.click(screen.getByRole('button', { name: 'Open Tabs' }));

    // Select Scope: All windows
    const allRadio = screen.getByRole('radio', { name: /All windows/i });
    await user.click(allRadio);

    // Uncheck "Include pinned" (leave discarded checked)
    const includePinned = screen.getByRole('checkbox', { name: /Include pinned/i });
    await user.click(includePinned); // toggles to false

    // Action button label should include "Import from Open Tabs (All)"
    const actionBtn = screen.getByRole('button', { name: /Import from Open Tabs \(All\)/i });
    await user.click(actionBtn);

    expect(mockPermissions.contains).toHaveBeenCalledWith({
      permissions: ['tabs'],
      origins: ['<all_urls>'],
    });

    expect(onImportOpenTabs).toHaveBeenCalledTimes(1);
    expect(onImportOpenTabs).toHaveBeenCalledWith({
      scope: 'all',
      includePinned: false,
      includeDiscarded: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes when not busy', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
