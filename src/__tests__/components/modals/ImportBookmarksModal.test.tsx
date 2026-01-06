import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* Component under test */
import ImportBookmarksModal from "@/components/modals/ImportBookmarksModal";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Services / commit */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";

/**
 * Render portal inline in JSDOM.
 */
jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

/**
 * Mock the wizard content so we can deterministically:
 * - set selection via onSelectionChange
 * - trigger onComplete
 * - close only on success (mirrors “prevents auto-close on error” behavior)
 */
jest.mock("@/components/shared/ImportBookmarksContent", () => ({
  ImportBookmarksContent: (props: any) => {
    return (
      <div>
        <button type="button" onClick={() => props.onSelectionChange({ source: "mock" })}>
          Set Selection
        </button>

        <button
          type="button"
          onClick={async () => {
            try {
              await props.onComplete();
              // mimic content auto-close on success
              props.onClose();
            } catch {
              // swallow: modal’s onComplete rethrows to prevent auto-close
            }
          }}
        >
          Finish Import
        </button>

        {props.errorMessage ? <div>{props.errorMessage}</div> : null}
      </div>
    );
  },
}));

jest.mock("@/scripts/import/workspaceServiceLocal", () => ({
  createWorkspaceServiceLocal: jest.fn(),
}));

jest.mock("@/scripts/import/commitManualImportIntoWorkspace", () => ({
  commitManualImportIntoWorkspace: jest.fn(),
}));

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ImportBookmarksModal>> = {},
  ctxOverrides: Partial<React.ContextType<typeof AppContext>> = {}
) {
  const onClose = jest.fn();

  const ctxValue = {
    userId: "local",
    activeWorkspaceId: "ws-1",
    workspaces: { "ws-1": { id: "ws-1", name: "Workspace 1" } },
    bumpWorkspacesVersion: jest.fn(),
    ...ctxOverrides,
  } as any;

  const props = {
    isOpen: true,
    onClose,
    ...overrides,
  } as React.ComponentProps<typeof ImportBookmarksModal>;

  render(
    <AppContext.Provider value={ctxValue}>
      <ImportBookmarksModal {...props} />
    </AppContext.Provider>
  );

  return { props, ctxValue };
}

describe("ImportBookmarksModal", () => {
  const mockWorkspaceService = { __mock: true };

  beforeEach(() => {
    jest.clearAllMocks();
    (createWorkspaceServiceLocal as jest.Mock).mockReturnValue(mockWorkspaceService);
    (commitManualImportIntoWorkspace as jest.Mock).mockResolvedValue(undefined);
  });

  test("renders title and close button", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    expect(screen.getByRole("heading", { name: /Import bookmarks/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Close/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("successful completion commits import, bumps version, and closes", async () => {
    const user = userEvent.setup();
    const { props, ctxValue } = renderModal();

    await user.click(screen.getByRole("button", { name: /Set Selection/i }));
    await user.click(screen.getByRole("button", { name: /Finish Import/i }));

    expect(commitManualImportIntoWorkspace).toHaveBeenCalledTimes(1);
    expect(commitManualImportIntoWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { source: "mock" },
        purposes: [PurposeId.Personal],
        workspaceId: "ws-1",
        purpose: PurposeId.Personal,
        workspaceService: mockWorkspaceService,
        onProgress: expect.any(Function),
      })
    );

    expect(ctxValue.bumpWorkspacesVersion).toHaveBeenCalledTimes(1);
    // our mocked content calls onClose after onComplete resolves
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("failure during completion shows error and does not close", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    (commitManualImportIntoWorkspace as jest.Mock).mockRejectedValueOnce(new Error("Boom"));

    await user.click(screen.getByRole("button", { name: /Set Selection/i }));
    await user.click(screen.getByRole("button", { name: /Finish Import/i }));

    expect(props.onClose).not.toHaveBeenCalled();

    // modal sets errorMessage from thrown error
    expect(await screen.findByText(/Boom/i)).toBeInTheDocument();
  });

  test("throws if no active workspace (and does not close)", async () => {
    const user = userEvent.setup();
    const { props } = renderModal(
      {},
      {
        activeWorkspaceId: null,
        workspaces: {},
      }
    );

    await user.click(screen.getByRole("button", { name: /Finish Import/i }));

    expect(props.onClose).not.toHaveBeenCalled();
    expect(commitManualImportIntoWorkspace).not.toHaveBeenCalled();
  });
});
