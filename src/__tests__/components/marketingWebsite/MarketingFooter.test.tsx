import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketingFooter } from "@/components/marketingWebsite/MarketingFooter";

// Mock LogoComponent so we don't depend on its internals
jest.mock("@/components/LogoComponent", () => ({
  __esModule: true,
  default: () => <div data-testid="logo-component" />,
}));

describe("MarketingFooter", () => {
  it("renders the footer with navigation links and branding", () => {
    render(<MarketingFooter />);

    // Brand tagline
    expect(
      screen.getByText("A calm, visual space for your digital mind.")
    ).toBeInTheDocument();

    // Links (spot check a few)
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();

    // Logo is present
    expect(screen.getByTestId("logo-component")).toBeInTheDocument();

    // Correct year
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} Mindful. All rights reserved.`)
    ).toBeInTheDocument();
  });
});
