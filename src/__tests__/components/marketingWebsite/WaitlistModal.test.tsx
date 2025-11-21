// WaitlistModal.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WaitlistModal from "@/components/marketingWebsite/WaitlistModal";

describe("WaitlistModal", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns null when open is false", () => {
    const onOpenChange = jest.fn();

    const { container } = render(
      <WaitlistModal open={false} onOpenChange={onOpenChange} />
    );

    // Nothing should be rendered
    expect(container.firstChild).toBeNull();
  });

  it("submits the email and shows success state", async () => {
    const onOpenChange = jest.fn();

    render(<WaitlistModal open={true} onOpenChange={onOpenChange} />);

    // Heading should be visible
    expect(
      screen.getByRole("heading", { name: /join the waitlist/i })
    ).toBeInTheDocument();

    // Fill in the email
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /join the waitlist/i });
    fireEvent.click(submitButton);

    // Should call fetch with correct URL and payload
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://eidotpc2fc.execute-api.us-west-1.amazonaws.com/waitlist",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", tier: "Mindful Pro" }),
      })
    );

    // Success state should be shown
    expect(await screen.findByText(/you're on the waitlist/i)).toBeInTheDocument();
    expect(
      screen.getByText(/we'll email you when Mindful Pro is ready\./i)
    ).toBeInTheDocument();
  });

  it("closes the modal and resets state when clicking Close", async () => {
    const onOpenChange = jest.fn();

    render(<WaitlistModal open={true} onOpenChange={onOpenChange} />);

    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "close-test@example.com" } });

    const submitButton = screen.getByRole("button", { name: /join the waitlist/i });
    fireEvent.click(submitButton);

    // Wait for success state
    const successHeading = await screen.findByText(/you're on the waitlist/i);
    expect(successHeading).toBeInTheDocument();

    // Click Close button in success view
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    // onOpenChange should be called with false
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error message when the request fails", async () => {
    const onOpenChange = jest.fn();

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    render(<WaitlistModal open={true} onOpenChange={onOpenChange} />);

    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "oops@example.com" } });

    const submitButton = screen.getByRole("button", { name: /join the waitlist/i });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
