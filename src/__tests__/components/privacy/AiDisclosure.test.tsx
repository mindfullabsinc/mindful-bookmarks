import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiDisclosure } from "@/components/privacy/AiDisclosure";

describe("AiDisclosure", () => {
  it("renders inline variant by default, with serviceName in subtitle, and toggles body via Learn more/Hide", async () => {
    const user = userEvent.setup();

    render(<AiDisclosure />);

    // Inline header + subtitle present
    expect(
      screen.getByText(/how automatic organization works/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Mindful can organize bookmarks using an AI service \(OpenAI\)\./i)
    ).toBeInTheDocument();

    // Body is hidden initially
    expect(
      screen.queryByText(/No page content is sent\./i)
    ).not.toBeInTheDocument();

    // Toggle open
    const learnMoreBtn = screen.getByRole("button", { name: /learn more/i });
    await user.click(learnMoreBtn);

    expect(
      screen.getByRole("button", { name: /hide/i })
    ).toBeInTheDocument();

    // Body appears
    expect(
      screen.getByText(/No page content is sent\./i)
    ).toBeInTheDocument();

    // And serviceName appears in body line
    expect(
      screen.getByText((content) =>
        content.includes("to OpenAI to") && content.includes("generate groups")
      )
    ).toBeInTheDocument();

    // Toggle closed
    await user.click(screen.getByRole("button", { name: /hide/i }));
    expect(
      screen.queryByText(/No page content is sent\./i)
    ).not.toBeInTheDocument();

    // Back to Learn more
    expect(
      screen.getByRole("button", { name: /learn more/i })
    ).toBeInTheDocument();
  });

  it("uses provided serviceName in inline subtitle and body", async () => {
    const user = userEvent.setup();

    render(<AiDisclosure serviceName="Anthropic" />);

    expect(
      screen.getByText(/Mindful can organize bookmarks using an AI service \(Anthropic\)\./i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /learn more/i }));

    expect(
      screen.getByText((content) =>
        content.includes("to Anthropic to") && content.includes("generate groups")
      )
    ).toBeInTheDocument();
  });

  it("renders compact variant with a single button and toggles compact body inside the button", async () => {
    const user = userEvent.setup();

    render(<AiDisclosure variant="compact" />);

    // The CTA is the entire label in compact mode
    const compactBtn = screen.getByRole("button", {
      name: /how automatic organization works/i,
    });

    // Body hidden initially
    expect(
      screen.queryByText(/No page content is sent\./i)
    ).not.toBeInTheDocument();

    // Open
    await user.click(compactBtn);
    expect(
      screen.getByText(/No page content is sent\./i)
    ).toBeInTheDocument();

    // Close
    await user.click(compactBtn);
    expect(
      screen.queryByText(/No page content is sent\./i)
    ).not.toBeInTheDocument();
  });
});
