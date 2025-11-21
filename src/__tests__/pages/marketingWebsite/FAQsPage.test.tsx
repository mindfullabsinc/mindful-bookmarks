import React from "react";
import { render, screen } from "@testing-library/react";
import FAQsPage from "@/pages/marketingWebsite/FAQsPage";

beforeAll(() => {
  // Simple mock so Framer Motion doesn't crash
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
});


// Mock Amplify Authenticator provider to just render children
jest.mock("@aws-amplify/ui-react", () => ({
  Authenticator: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

// Mock AnalyticsProvider to a simple passthrough
jest.mock("@/analytics/AnalyticsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock navbar/footer so we don't pull in extra layout complexity
jest.mock("@/components/marketingWebsite/MarketingNavBar", () => ({
  MarketingNavbar: () => <div data-testid="marketing-navbar" />,
}));

jest.mock("@/components/marketingWebsite/MarketingFooter", () => ({
  MarketingFooter: () => <div data-testid="marketing-footer" />,
}));

describe("FAQsPage", () => {
  it("renders the FAQ heading and a common question", () => {
    render(<FAQsPage />);

    // Heading
    expect(
      screen.getByRole("heading", { name: /Frequently Asked Questions/i })
    ).toBeInTheDocument();

    // One of the FAQ questions
    expect(
      screen.getByText(/Do I need an account to use Mindful\?/i)
    ).toBeInTheDocument();

    // Sanity check: layout pieces render
    expect(screen.getByTestId("marketing-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
  });
});
