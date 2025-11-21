import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PricingCard } from "@/components/marketingWebsite/PricingCard";

// Mock Button component to simplify testing
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe("PricingCard", () => {
  const baseProps = {
    badgeLabel: "Mindful Core",
    price: "$0",
    description: "Always free.",
    features: [
      { icon: <span data-testid="icon-1" />, text: "Feature A" },
      { icon: <span data-testid="icon-2" />, text: "Feature B" },
    ],
    buttonLabel: "Add to Chrome",
    buttonHref: "https://example.com",
  };

  it("renders main content correctly", () => {
    render(<PricingCard {...baseProps} />);

    // Badge
    expect(screen.getByText("Mindful Core")).toBeInTheDocument();

    // Price
    expect(screen.getByText("$0")).toBeInTheDocument();

    // Description
    expect(screen.getByText("Always free.")).toBeInTheDocument();

    // Features
    expect(screen.getByText("Feature A")).toBeInTheDocument();
    expect(screen.getByText("Feature B")).toBeInTheDocument();

    // Button
    expect(screen.getByText("Add to Chrome")).toBeInTheDocument();
  });

  it("calls onButtonClick when the button is clicked", () => {
    const handleClick = jest.fn();
    render(<PricingCard {...baseProps} onButtonClick={handleClick} />);

    fireEvent.click(screen.getByText("Add to Chrome"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("uses renderButton when provided", () => {
    render(
      <PricingCard
        {...baseProps}
        renderButton={() => <button>Custom CTA</button>}
      />
    );

    // Custom button appears
    expect(screen.getByText("Custom CTA")).toBeInTheDocument();

    // Default button should NOT appear
    expect(screen.queryByText("Add to Chrome")).not.toBeInTheDocument();
  });
});
