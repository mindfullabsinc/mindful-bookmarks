import React from "react";
import { render, screen } from "@testing-library/react";
import SignedOutGuard from "@/components/auth/SignedOutGuard";
import { AppContext } from "@/scripts/AppContextProvider";
import { AuthMode } from "@/core/constants/authMode";
import { makeAppContext } from "@/__tests__/mocks/mockAppContext";


const baseCtx = makeAppContext();

describe("<SignedOutGuard/> stub", () => {
  test("renders nothing when not enabled", () => {
    render(<SignedOutGuard>Signed out content</SignedOutGuard>);
    expect(screen.queryByText("Signed out content")).toBeNull();
  });

  test("when enabled + signed out -> shows children", () => {
    render(
      <AppContext.Provider
        value={{ ...baseCtx, authMode: AuthMode.ANON, isSignedIn: false }}
      >
        <SignedOutGuard enabled>Signed out content</SignedOutGuard>
      </AppContext.Provider>
    );
    expect(screen.getByText("Signed out content")).toBeInTheDocument();
  });

  test("when enabled + signed in -> shows fallback", () => {
    render(
      <AppContext.Provider
        value={{ ...baseCtx, authMode: AuthMode.AUTH, isSignedIn: true }}
      >
        <SignedOutGuard enabled fallback={<div>Fallback</div>}>
          Signed out content
        </SignedOutGuard>
      </AppContext.Provider>
    );
    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.queryByText("Signed out content")).toBeNull();
  });

  test("safe without AppContext provider", () => {
    render(<SignedOutGuard enabled>Signed out content</SignedOutGuard>);
    expect(screen.getByText("Signed out content")).toBeInTheDocument();
  });
});
