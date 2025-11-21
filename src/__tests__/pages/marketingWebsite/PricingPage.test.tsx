// src/pages/PricingPage.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import PricingPage from "@/pages/marketingWebsite/PricingPage";

// Mock Amplify Authenticator so we don't need real Amplify setup in tests
jest.mock("@aws-amplify/ui-react", () => ({
  Authenticator: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

// Mock AnalyticsProvider to just render children
jest.mock("@/analytics/AnalyticsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Optionally mock navbar/footer to keep the DOM simple
jest.mock("@/components/marketingWebsite/MarketingNavBar", () => ({
  MarketingNavbar: () => <div data-testid="marketing-navbar" />,
}));

jest.mock("@/components/marketingWebsite/MarketingFooter", () => ({
  MarketingFooter: () => <div data-testid="marketing-footer" />,
}));

describe("PricingPage", () => {
  it("renders hero copy and both pricing tiers", () => {
    render(<PricingPage />);

    // Hero headline
    expect(
      screen.getByText(/Free without limits\./i)
    ).toBeInTheDocument();

    // Hero supporting text
    expect(
      screen.getByText(/No sign-up required\. No strings attached\./i)
    ).toBeInTheDocument();

    // Pricing tier labels
    expect(screen.getByText(/Mindful Core/i)).toBeInTheDocument();
    expect(screen.getByText(/Mindful Pro/i)).toBeInTheDocument();

    // Basic sanity check that layout chrome renders
    expect(screen.getByTestId("marketing-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
  });
});
