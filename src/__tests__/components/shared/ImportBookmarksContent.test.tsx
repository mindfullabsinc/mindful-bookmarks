import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ImportBookmarksContent } from "@/components/shared/ImportBookmarksContent";

/**
 * Mocks
 */
const mockReset = jest.fn();
let mockState: any;
let mockSelection: any;

jest.mock("@/hooks/useManualImportWizardState", () => ({
  useManualImportWizardState: () => ({
    state: mockState,
    selection: mockSelection,
    reset: mockReset,
  }),
}));

jest.mock("@/components/shared/ImportBookmarksStepBody", () => {
  const React = require("react");
  return {
    // Keep step count predictable in tests.
    LAST_STEP: 4,
    ImportBookmarksStepBody: ({ step, busy }: { step: number; busy: boolean }) => (
      <div data-testid="step-body">
        step:{step} busy:{String(busy)}
      </div>
    ),
  };
});

// If the Jest setup doesn’t already handle CSS imports, this keeps the test isolated.
jest.mock("@/styles/components/shared/ImportBookmarksContent.css", () => ({}), {
  virtual: true,
});

function renderComp(
  props: Partial<React.ComponentProps<typeof ImportBookmarksContent>> = {},
) {
  const defaultProps: React.ComponentProps<typeof ImportBookmarksContent> = {
    variant: "modal",
    onClose: jest.fn(),
    onComplete: jest.fn(),
    onSelectionChange: jest.fn(),
    busy: false,
    busyMessage: "Custom busy ...",
    errorMessage: undefined,
  };

  const merged = { ...defaultProps, ...props };
  const utils = render(<ImportBookmarksContent {...merged} />);
  return { ...utils, props: merged };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: "Continue" for steps 1–3, and enabled.
  mockState = {
    jsonYes: true,
    jsonData: { ok: true },
    bookmarksYes: true,
    tabsYes: true,
  };
  mockSelection = { any: "selection" };
});

describe("ImportBookmarksContent", () => {
  test("renders error message when provided", () => {
    renderComp({ errorMessage: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  test("emits selection upward on mount and when selection changes", () => {
    const onSelectionChange = jest.fn();
    const { rerender } = renderComp({ onSelectionChange });

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenLastCalledWith(mockSelection);

    // Change selection returned by the hook and rerender
    const nextSelection = { another: "value" };
    mockSelection = nextSelection;

    rerender(
      <ImportBookmarksContent
        variant="modal"
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    expect(onSelectionChange).toHaveBeenLastCalledWith(nextSelection);
  });

  test("Escape closes when not busy (modal or embedded with onClose)", () => {
    const onClose = jest.fn();
    renderComp({ onClose, busy: false });

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape does not close when busy", () => {
    const onClose = jest.fn();
    renderComp({ onClose, busy: true });

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  test("step 1 primary label is Continue when jsonYes true; disabled if jsonData missing", () => {
    // Start enabled
    mockState = { ...mockState, jsonYes: true, jsonData: { ok: true } };

    const onClose = jest.fn();
    const onComplete = jest.fn();
    const onSelectionChange = jest.fn();

    const { rerender } = render(
      <ImportBookmarksContent
        variant="modal"
        onClose={onClose}
        onComplete={onComplete}
        onSelectionChange={onSelectionChange}
        busy={false}
      />,
    );

    // Enabled case
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();

    // Now disable: jsonYes true but jsonData missing
    mockState = { ...mockState, jsonYes: true, jsonData: undefined };

    rerender(
      <ImportBookmarksContent
        variant="modal"
        onClose={onClose}
        onComplete={onComplete}
        onSelectionChange={onSelectionChange}
        busy={false}
      />,
    );

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("step 1 primary label is Skip when jsonYes false", () => {
    mockState = { ...mockState, jsonYes: false, jsonData: undefined };
    renderComp();

    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
  });

  test("clicking primary advances steps until last; Back appears after step 1 and works", () => {
    renderComp();

    // Step 1
    expect(screen.getByTestId("step-body")).toHaveTextContent("step:1");
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();

    // Step 2
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    expect(screen.getByTestId("step-body")).toHaveTextContent("step:2");
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();

    // Back to step 1
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("step-body")).toHaveTextContent("step:1");

    // Step forward to step 3
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    expect(screen.getByTestId("step-body")).toHaveTextContent("step:3");
  });

  test("busy state: shows busy message, disables Back (when shown), and primary text becomes 'Thinking ...'", () => {
    // Start at step 2 so Back is visible
    const { rerender } = renderComp({ busy: false });
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    expect(screen.getByRole("button", { name: /back/i })).toBeEnabled();

    rerender(
      <ImportBookmarksContent
        variant="modal"
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onSelectionChange={jest.fn()}
        busy={true}
        busyMessage="Custom busy ..."
      />,
    );

    // Busy message area
    expect(screen.getByText("Custom busy ...")).toBeInTheDocument();

    // Back disabled
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();

    // Primary label becomes BUSY_MESSAGE ("Thinking ...") per component constant
    expect(screen.getByRole("button", { name: /thinking \.\.\./i })).toBeDisabled();
  });

  test("on last step: calls onComplete; closes modal after completion", async () => {
    const onClose = jest.fn();
    const onComplete = jest.fn().mockResolvedValue(undefined);

    renderComp({ variant: "modal", onClose, onComplete });

    // Advance to LAST_STEP (4)
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i })); // step 2
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i })); // step 3
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i })); // step 4

    expect(screen.getByTestId("step-body")).toHaveTextContent("step:4");
    expect(screen.getByRole("button", { name: /finish/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("on last step: embedded variant does not auto-close after completion", async () => {
    const onClose = jest.fn();
    const onComplete = jest.fn().mockResolvedValue(undefined);

    renderComp({ variant: "embedded", onClose, onComplete });

    // Advance to LAST_STEP (4)
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("onComplete rejection does not close (parent controls errorMessage)", async () => {
    const onClose = jest.fn();
    const onComplete = jest.fn().mockRejectedValue(new Error("nope"));

    renderComp({ variant: "modal", onClose, onComplete });

    // Advance to LAST_STEP (4)
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue|skip|finish/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("unmount resets wizard state", () => {
    const { unmount } = renderComp();
    unmount();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});