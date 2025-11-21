// src/components/marketingWebsite/MarketingNavbar.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MarketingNavbar } from "@/components/marketingWebsite/MarketingNavBar";

// Mock LogoComponent so we can assert it rendered without caring about its internals
jest.mock("@/components/LogoComponent", () => () => (
  <div data-testid="logo-component">Mock Logo</div>
));

// Mock CTAButton similarly
jest.mock("@/components/marketingWebsite/CTAButton", () => ({
  __esModule: true,
  default: () => <button data-testid="cta-button">Mock CTA</button>,
}));

describe("MarketingNavbar", () => {
  it("renders the logo, navigation links, and CTA button", () => {
    render(<MarketingNavbar />);

    // Logo is rendered
    expect(screen.getByTestId("logo-component")).toBeInTheDocument();

    // Navigation links
    const featuresLink = screen.getByRole("link", { name: /features/i });
    const pricingLink = screen.getByRole("link", { name: /pricing/i });
    const faqsLink = screen.getByRole("link", { name: /faqs/i });

    expect(featuresLink).toBeInTheDocument();
    expect(featuresLink).toHaveAttribute("href", "index.html#features");

    expect(pricingLink).toBeInTheDocument();
    expect(pricingLink).toHaveAttribute("href", "pricing.html");

    expect(faqsLink).toBeInTheDocument();
    expect(faqsLink).toHaveAttribute("href", "faqs.html");

    // CTA button
    expect(screen.getByTestId("cta-button")).toBeInTheDocument();
  });
});
