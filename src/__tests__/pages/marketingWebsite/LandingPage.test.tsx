import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import LandingPage from "@/pages/marketingWebsite/LandingPage";


/**
 * Mock Amplify Authenticator provider to just render children.
 */
jest.mock("@aws-amplify/ui-react", () => ({
  Authenticator: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

/**
 * Mock AnalyticsProvider as a simple pass-through.
 */
jest.mock("@/analytics/AnalyticsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Mock layout/marketing components so the test focuses on page content.
 */
jest.mock("@/components/marketingWebsite/MarketingNavBar", () => ({
  MarketingNavbar: () => <nav data-testid="marketing-navbar" />,
}));

jest.mock("@/components/marketingWebsite/MarketingFooter", () => ({
  MarketingFooter: () => <footer data-testid="marketing-footer" />,
}));

jest.mock("@/components/marketingWebsite/CTAButton", () => ({
  __esModule: true,
  default: () => <button>Mock CTA</button>,
}));

jest.mock("@/components/marketingWebsite/BrowserIcon", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

jest.mock("@/components/marketingWebsite/FeatureSection", () => ({
  FeatureSection: ({ title }: { title: string }) => (
    <section>
      <h2>{title}</h2>
    </section>
  ),
}));

describe("LandingPage", () => {
  it("renders the hero heading and feature titles", () => {
    render(<LandingPage />);

    // Hero heading
    expect(
      screen.getByRole("heading", {
        name: "A calm, visual space for your digital mind",
        level: 1,
      }),
    ).toBeInTheDocument();

    // A couple of feature section titles
    expect(
      screen.getByRole("heading", {
        name: "Catch important links the moment they matter",
        level: 2,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Workspaces that match your mind, not your tabs",
        level: 2,
      }),
    ).toBeInTheDocument();

    // Sanity check that shell components render
    expect(screen.getByTestId("marketing-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
  });
});
