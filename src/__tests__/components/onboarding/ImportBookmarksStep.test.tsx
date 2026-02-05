import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportBookmarksStep } from "@/components/onboarding/ImportBookmarksStep";

describe("ImportBookmarksStep", () => {
  it("renders both import options and disables primary by default", () => {
    const setPrimaryDisabled = jest.fn();

    render(<ImportBookmarksStep setPrimaryDisabled={setPrimaryDisabled} />);

    // Buttons are rendered
    const smartButton = screen.getByRole("button", { name: /smart import/i });
    const manualButton = screen.getByRole("button", { name: /manual import/i });

    expect(smartButton).toBeInTheDocument();
    expect(manualButton).toBeInTheDocument();

    // No option is selected initially
    expect(smartButton).not.toHaveClass("chip--active");
    expect(manualButton).not.toHaveClass("chip--active");

    // Primary should be disabled when no choice is selected
    expect(setPrimaryDisabled).toHaveBeenCalledWith(true);
  });

  it("selects Smart import and enables the primary button", () => {
    const setPrimaryDisabled = jest.fn();

    render(<ImportBookmarksStep setPrimaryDisabled={setPrimaryDisabled} />);

    const smartButton = screen.getByRole("button", { name: /smart import/i });
    const manualButton = screen.getByRole("button", { name: /manual import/i });

    fireEvent.click(smartButton);

    // Smart becomes active, manual not
    expect(smartButton).toHaveClass("chip--active");
    expect(manualButton).not.toHaveClass("chip--active");

    // Primary should be enabled after selecting an option
    expect(setPrimaryDisabled).toHaveBeenLastCalledWith(false);
  });

  it("selects Manual import and enables the primary button", () => {
    const setPrimaryDisabled = jest.fn();

    render(<ImportBookmarksStep setPrimaryDisabled={setPrimaryDisabled} />);

    const smartButton = screen.getByRole("button", { name: /smart import/i });
    const manualButton = screen.getByRole("button", { name: /manual import/i });

    fireEvent.click(manualButton);

    // Manual becomes active, smart not
    expect(manualButton).toHaveClass("chip--active");
    expect(smartButton).not.toHaveClass("chip--active");

    // Primary should be enabled after selecting an option
    expect(setPrimaryDisabled).toHaveBeenLastCalledWith(false);
  });
});