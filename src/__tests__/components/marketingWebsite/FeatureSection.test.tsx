import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FeatureSection } from "@/components/marketingWebsite/FeatureSection";

// Mock framer-motion so whileInView / viewport don't use IntersectionObserver in tests
jest.mock("framer-motion", () => ({
  motion: {
    // simple pass-through <div> wrapper
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  },
}));

describe("FeatureSection", () => {
  it("renders title, body and visual (body as array)", () => {
    render(
      <FeatureSection
        id="feature-1"
        title="Stay organized without the chaos"
        body={["First line of copy.", "Second line of copy."]}
        visual={<div data-testid="visual">Visual content</div>}
      />
    );

    // Title
    expect(
      screen.getByRole("heading", {
        name: "Stay organized without the chaos",
        level: 2,
      })
    ).toBeInTheDocument();

    // Two body paragraphs from the body array
    expect(screen.getByText("First line of copy.")).toBeInTheDocument();
    expect(screen.getByText("Second line of copy.")).toBeInTheDocument();

    // Visual
    expect(screen.getByTestId("visual")).toBeInTheDocument();
  });

  it("places text before visual when textSide is left (default)", () => {
    const { container } = render(
      <FeatureSection
        title="Left text"
        body="Body copy"
        visual={<div>Visual content</div>}
        // textSide defaults to "left"
      />
    );

    const grid = container.querySelector(".grid");
    expect(grid).toBeTruthy();

    const [firstChild, secondChild] = Array.from(
      (grid as HTMLElement).children
    );

    expect(firstChild).toHaveTextContent("Left text");
    expect(secondChild).toHaveTextContent("Visual content");
  });

  it("places visual before text when textSide is right", () => {
    const { container } = render(
      <FeatureSection
        textSide="right"
        title="Right text"
        body="Body copy"
        visual={<div>Visual content</div>}
      />
    );

    const grid = container.querySelector(".grid");
    expect(grid).toBeTruthy();

    const [firstChild, secondChild] = Array.from(
      (grid as HTMLElement).children
    );

    // For textSide="right", visual comes first
    expect(firstChild).toHaveTextContent("Visual content");
    expect(secondChild).toHaveTextContent("Right text");
  });

  it('applies "justify-start" when visualJustify="start"', () => {
    render(
      <FeatureSection
        title="Justify start"
        body="Body copy"
        visual={<div>Visual content</div>}
        visualJustify="start"
      />
    );

    const visual = screen.getByText("Visual content");
    const visualWrapper = visual.parentElement; // parent is the flex wrapper
    expect(visualWrapper).toHaveClass("justify-start");
  });
});
