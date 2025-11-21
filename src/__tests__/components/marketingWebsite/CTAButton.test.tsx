import React from "react";
import { render, screen } from "@testing-library/react";
import { CHROME_EXTENSION_URL } from "@/core/constants/constants";
import { detectBrowser } from "@/core/utils/detectBrowser";

import CTAButton from "@/components/marketingWebsite/CTAButton";

jest.mock("@/core/utils/detectBrowser", () => ({
  detectBrowser: jest.fn(),
}));

describe("CTAButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the default label and link for the detected browser", () => {
    (detectBrowser as jest.Mock).mockReturnValue("chrome");

    render(<CTAButton />);

    const link = screen.getByRole("link", { name: "Add to Chrome" });

    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", CHROME_EXTENSION_URL);
  });

  it("uses a custom labelTemplate with the detected browser name", () => {
    (detectBrowser as jest.Mock).mockReturnValue("brave");

    render(<CTAButton labelTemplate="Install on {browser}" />);

    const link = screen.getByRole("link", { name: "Install on Brave" });

    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", CHROME_EXTENSION_URL);
  });

  it("applies the passed className to the rendered element", () => {
    (detectBrowser as jest.Mock).mockReturnValue("chrome");

    render(<CTAButton className="w-full" />);

    const link = screen.getByRole("link", { name: "Add to Chrome" });

    // Because Button uses `asChild`, the className ends up on the <a>
    expect(link).toHaveClass("w-full");
  });
});
