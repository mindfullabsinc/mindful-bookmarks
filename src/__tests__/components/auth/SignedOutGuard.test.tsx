// src/__tests__/components/auth/SignedOutGuard.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import SignedOutGuard from "@/components/auth/SignedOutGuard";
import { AppContext } from "@/scripts/AppContextProvider";
import type { AppContextValue } from "@/scripts/AppContextProvider";
import { AuthMode } from "@/core/constants/authMode";
import { StorageMode } from "@/core/constants/storageMode";
import { DEFAULT_LOCAL_WORKSPACE_ID } from "@/core/constants/workspaces";
import { LOCAL_USER_ID } from "@/core/constants/authMode";
import { OnboardingStatus } from "@/scripts/AppContextProvider";
import { ThemeChoice } from "@/core/constants/theme";

// ---- Minimal base context for tests ----
const baseCtx: AppContextValue = {
  /* Workspaces */
  workspaces: {},
  activeWorkspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
  setActiveWorkspaceId: () => {},

  /* Bookmarks */
  groupsIndex: [],
  bookmarkGroups: [],
  setBookmarkGroups: () => {},

  /* Auth / storage */
  userId: LOCAL_USER_ID,
  storageMode: StorageMode.LOCAL,
  setStorageMode: async () => {},

  // keep while deprecated in codebase
  isSignedIn: false,
  authMode: AuthMode.ANON,

  /* Loading + migration */
  isLoading: false,
  isMigrating: false,
  setIsMigrating: () => {},

  /* User attributes */
  userAttributes: null,
  setUserAttributes: () => {},

  /* Hydration flags */
  hasHydrated: true,
  isHydratingRemote: false,

  /* Onboarding */
  onboardingStatus: OnboardingStatus.NOT_STARTED,
  setOnboardingStatus: async () => {},
  shouldShowOnboarding: false,
  completeOnboarding: async () => {},
  skipOnboarding: async () => {},
  restartOnboarding: async () => {},

  /* Theme */
  theme: ThemeChoice.SYSTEM,
  setThemePreference: async () => {},
};

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
