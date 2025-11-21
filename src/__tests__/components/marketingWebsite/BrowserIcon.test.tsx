import React from "react";
import { render, screen } from "@testing-library/react";
import BrowserIcon from "@/components/marketingWebsite/BrowserIcon";

describe("BrowserIcon", () => {
  it("renders a linked browser icon with correct attributes", () => {
    const href = "https://example.com";
    const src = "/icons/chrome.png";
    const alt = "Chrome";

    render(<BrowserIcon href={href} src={src} alt={alt} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const img = screen.getByRole("img", { name: alt });
    expect(img).toHaveAttribute("src", src);
    expect(img).toHaveAttribute("alt", alt);
    expect(img).toHaveClass(
      "h-5",
      "w-5",
      "opacity-80",
      "hover:opacity-100",
      "transition",
      "cursor-pointer"
    );
  });
});
