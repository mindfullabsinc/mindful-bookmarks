import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LogoComponent from "@/components/LogoComponent";

// Mock Badge so we can assert props easily
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, forceLight, ...rest }: any) => (
    <span
      data-testid="badge"
      data-force-light={String(forceLight)}
      {...rest}
    >
      {children}
    </span>
  ),
}));

describe("LogoComponent", () => {
  beforeEach(() => {
    // Reset chrome between tests
    (global as any).chrome = undefined;
  });

  it("renders logo text and badge", () => {
    render(<LogoComponent />);

    expect(screen.getByText("Mindful")).toBeInTheDocument();

    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Bookmarks");

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/assets/icon-128.png");
  });

  it("navigates to '/' when not running as an extension", () => {
    // chrome is undefined → website mode
    (global as any).chrome = undefined;

    render(<LogoComponent />);

    fireEvent.click(screen.getByText("Mindful"));

    // jsdom normalizes to http://localhost/, but pathname should be `/`
    expect(window.location.pathname).toBe("/");
  });

  it("navigates via extension new tab URL when running as an extension", () => {
    const getURLMock = jest.fn((path: string) => `chrome-extension://abc/${path}`);

    (global as any).chrome = {
      runtime: {
        id: "fake-extension-id",
        getURL: getURLMock,
      },
    };

    render(<LogoComponent />);

    fireEvent.click(screen.getByText("Mindful"));

    // We mainly care that the extension branch ran:
    expect(getURLMock).toHaveBeenCalledWith("newtab.html");

    // Depending on jsdom, navigation to chrome-extension:// may
    // be blocked or normalized, so we *don't* assert on href here.
  });

  it("passes forceLight to Badge", () => {
    render(<LogoComponent forceLight />);

    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-force-light", "true");
  });
});