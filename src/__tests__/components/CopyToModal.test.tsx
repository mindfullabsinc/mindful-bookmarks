// src/__tests__/components/modals/CopyToModal.test.tsx

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CopyToModal from "@/components/CopyToModal"; 
import { listLocalWorkspaces } from "@/scripts/workspaces/registry";

jest.mock("@/scripts/workspaces/registry", () => ({
  listLocalWorkspaces: jest.fn(),
}));

const mockListLocalWorkspaces = listLocalWorkspaces as jest.MockedFunction<
  typeof listLocalWorkspaces
>;

describe("CopyToModal", () => {
  const CURRENT_WS_ID = "ws-current";

  const setup = async (options?: { open?: boolean }) => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    mockListLocalWorkspaces.mockResolvedValue([
      {
        id: CURRENT_WS_ID,
        name: "Current Workspace",
        storageMode: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "ws-1",
        name: "Work",
        storageMode: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "ws-2",
        name: "Personal",
        storageMode: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const open = options?.open ?? true;

    const view = render(
      <CopyToModal
        open={open}
        onClose={onClose}
        onConfirm={onConfirm}
        currentWorkspaceId={CURRENT_WS_ID}
        title="Copy to test"
      />
    );

    if (open) {
      // Wait for workspaces to load and options to appear
      await waitFor(() =>
        expect(mockListLocalWorkspaces).toHaveBeenCalledTimes(1)
      );
      await waitFor(() =>
        expect(screen.getByRole("dialog", { name: /copy to test/i })).toBeInTheDocument()
      );
    }

    return { user, onClose, onConfirm, ...view };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("does not render when open is false and does not load workspaces", async () => {
    await setup({ open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockListLocalWorkspaces).not.toHaveBeenCalled();
  });

  test("loads workspaces when opened and excludes the current workspace", async () => {
    await setup();

    // The dialog is visible
    const dialog = screen.getByRole("dialog", { name: /copy to test/i });
    expect(dialog).toBeInTheDocument();

    // The current workspace should not be in the destination list
    expect(
      screen.queryByRole("option", { name: /current workspace/i })
    ).toBeNull();

    // Other workspaces should be present
    expect(screen.getByRole("option", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Personal" })).toBeInTheDocument();

    // Confirm should be enabled because a default dest is selected
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    expect(confirmButton).toBeEnabled();
  });

  test("allows choosing destination, toggling move, and calls onConfirm on button click", async () => {
    const { user, onConfirm } = await setup();

    const select = screen.getByLabelText(/destination workspace/i) as HTMLSelectElement;

    // default dest should be the first non-current workspace from the mock ("ws-1" / "Work")
    expect(select.value).toBe("ws-1");

    // Change destination to "Personal"
    await user.selectOptions(select, "ws-2");
    expect(select.value).toBe("ws-2");

    // Toggle "Move" checkbox
    const moveCheckbox = screen.getByRole("checkbox", { name: /move/i });
    await user.click(moveCheckbox);
    expect(moveCheckbox).toBeChecked();

    // Click Confirm
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("ws-2", true);
  });

  test("calls onClose when Cancel button, close button, or backdrop is clicked", async () => {
    const { user, onClose } = await setup();

    // Cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close (X) button
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backdrop (click outside panel)
    // Because the modal is portaled to document.body, query on document.body
    const backdrop = document.body.querySelector(
      '[class*="bg-black/40"]'
    ) as HTMLElement;

    expect(backdrop).toBeInTheDocument();

    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
  }); 

  test("handles Escape and Enter keyboard shortcuts", async () => {
    const { onClose, onConfirm } = await setup();

    // Escape should close
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Enter should confirm with current dest and move=false
    const select = screen.getByLabelText(/destination workspace/i) as HTMLSelectElement;
    expect(select.value).toBe("ws-1"); // default dest in our mock

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("ws-1", false);
  });
});