jest.mock("@/scripts/AppContextProvider", () => ({
  AppContext: require("react").createContext({ bumpWorkspacesVersion: jest.fn() }),
}));

jest.mock("@/scripts/workspaces/registry", () => ({
  listLocalWorkspaces: jest.fn(),
  createLocalWorkspace: jest.fn(),
}));

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CopyToModal from "@/components/modals/CopyToModal";
import { listLocalWorkspaces, createLocalWorkspace } from "@/scripts/workspaces/registry";

const listLocalWorkspacesMock = listLocalWorkspaces as jest.MockedFunction<
  typeof listLocalWorkspaces
>;
const createLocalWorkspaceMock = createLocalWorkspace as jest.MockedFunction<
  typeof createLocalWorkspace
>;

type Ws = { id: any; name: string };

type SetupOptions = {
  open?: boolean;
  currentWorkspaceId?: string;
  title?: string;
  workspaces?: Ws[];
};

function setup({
  open = true,
  currentWorkspaceId = "w1",
  title,
  workspaces = [
    { id: "w1", name: "One" },
    { id: "w2", name: "Two" },
    { id: "w3", name: "Three" },
  ],
}: SetupOptions = {}) {
  listLocalWorkspacesMock.mockResolvedValueOnce(workspaces as any);

  const onClose = jest.fn();
  const onConfirm = jest.fn();

  const view = render(
    <CopyToModal
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      currentWorkspaceId={currentWorkspaceId as any}
      title={title}
    />
  );

  return { ...view, onClose, onConfirm };
}

describe("CopyToModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders null when open is false", () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    render(
      <CopyToModal
        open={false}
        onClose={onClose}
        onConfirm={onConfirm}
        currentWorkspaceId={"w1" as any}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(listLocalWorkspacesMock).not.toHaveBeenCalled();
  });

  it("loads workspaces on open, filters out currentWorkspaceId, defaults dest, and resets move", async () => {
    setup({ open: true, currentWorkspaceId: "w1" });

    // Wait for the dialog (portal) to appear
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Ensure fetch happened
    expect(listLocalWorkspacesMock).toHaveBeenCalledTimes(1);

    const select = screen.getByLabelText(/destination workspace/i) as HTMLSelectElement;

    // Filtered out w1, leaving w2/w3 + "New workspace" option
    await waitFor(() => {
      expect(select.options).toHaveLength(3);
      expect(select.options[0].value).toBe("w2");
      expect(select.options[1].value).toBe("w3");
    });

    // Defaults to first filtered option
    expect(select.value).toBe("w2");

    // Move checkbox resets false on open
    const moveCheckbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(moveCheckbox.checked).toBe(false);
  });

  it("focuses the destination select when opened (queueMicrotask)", async () => {
    const originalQM = global.queueMicrotask;

    // Make queueMicrotask run immediately for deterministic focus
    (global as any).queueMicrotask = (cb: () => void) => cb();

    setup({ open: true, currentWorkspaceId: "w1" });

    await screen.findByRole("dialog");

    const select = screen.getByLabelText(/destination workspace/i);
    expect(select).toHaveFocus();

    global.queueMicrotask = originalQM;
  });

  it("calls onClose when clicking backdrop, Cancel, Close button, or pressing Escape", async () => {
    const { onClose } = setup({ open: true, currentWorkspaceId: "w1" });
    await screen.findByRole("dialog");

    // Backdrop is the first div with the backdrop classes; easiest is to click by class selector.
    const backdrop = document.querySelector(".bg-black\\/40") as HTMLElement;
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("enables Confirm when only the current workspace exists, pre-selecting + New workspace", async () => {
    setup({
      open: true,
      currentWorkspaceId: "w1",
      workspaces: [{ id: "w1", name: "Only one" }],
    });

    await screen.findByRole("dialog");

    const select = screen.getByLabelText(/destination workspace/i) as HTMLSelectElement;
    expect(select.value).toBe("__new__");

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeEnabled();
  });

  it("calls onConfirm with default destination and move=false when Confirm is clicked", async () => {
    const { onConfirm } = setup({ open: true, currentWorkspaceId: "w1" });
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("w2", false);
  });

  it("lets user change destination and toggle move, then confirms", async () => {
    const { onConfirm } = setup({ open: true, currentWorkspaceId: "w1" });
    await screen.findByRole("dialog");

    const select = screen.getByLabelText(/destination workspace/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "w3" } });
    expect(select.value).toBe("w3");

    const moveCheckbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(moveCheckbox);
    expect(moveCheckbox.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("w3", true);
  });

  it("confirms on Enter key press when dest is set, and prevents default", async () => {
    const { onConfirm } = setup({ open: true, currentWorkspaceId: "w1" });
    await screen.findByRole("dialog");

    // Toggle move to verify it’s respected in Enter confirm
    fireEvent.click(screen.getByRole("checkbox"));

    const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(e, "preventDefault");

    document.dispatchEvent(e);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith("w2", true);
  }); 

  it("creates a new workspace and confirms on Enter when + New workspace is pre-selected", async () => {
    createLocalWorkspaceMock.mockResolvedValueOnce({
      id: "ws-new",
      name: "New Workspace",
      storageMode: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    const { onConfirm } = setup({
      open: true,
      currentWorkspaceId: "w1",
      workspaces: [{ id: "w1", name: "Only one" }],
    });

    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Enter" });

    await waitFor(() => {
      expect(createLocalWorkspaceMock).toHaveBeenCalledWith("New Workspace", { setActive: false });
      expect(onConfirm).toHaveBeenCalledWith("ws-new", false);
    });
  });

  it("uses the default title when not provided, and custom title when provided", async () => {
    setup({ open: true, currentWorkspaceId: "w1" });
    await screen.findByRole("dialog");
    expect(screen.getByRole("heading", { name: /copy to/i })).toBeInTheDocument();

    // re-render with custom title (new render to keep it simple)
    listLocalWorkspacesMock.mockResolvedValueOnce([
      { id: "w1", name: "One" },
      { id: "w2", name: "Two" },
    ] as any);

    render(
      <CopyToModal
        open={true}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        currentWorkspaceId={"w1" as any}
        title="Move to workspace"
      />
    );

    expect(await screen.findByRole("heading", { name: /move to workspace/i })).toBeInTheDocument();
  });
});