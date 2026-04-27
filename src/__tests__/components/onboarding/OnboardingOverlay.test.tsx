// src/__tests__/components/onboarding/OnboardingOverlay.test.tsx

import React from "react";
import {
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";

/* Scripts */
import {
  AppContext,
  OnboardingStatus,
} from "@/scripts/AppContextProvider";

/* Components */
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";

// ---- Mocks ----

// capture props from step components so tests can call their callbacks
let lastPurposeStepProps: any;
let lastImportStepProps: any;
let lastSmartImportStepProps: any;

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: (props: any) => <div {...props} />,
  },
}));

jest.mock("@/components/onboarding/ThemeSelectorStep", () => ({
  ThemeSelectorStep: () => <div data-testid="theme-step" />,
}));

jest.mock("@/components/onboarding/PurposeStep", () => ({
  PurposeStep: (props: any) => {
    lastPurposeStepProps = props;
    return <div data-testid="purpose-step" />;
  },
}));

jest.mock("@/components/onboarding/ImportBookmarksStep", () => ({
  ImportBookmarksStep: (props: any) => {
    lastImportStepProps = props;
    return <div data-testid="import-step" />;
  },
}));

jest.mock("@/components/onboarding/SmartImportStep", () => ({
  SmartImportStep: (props: any) => {
    lastSmartImportStepProps = props;
    return <div data-testid="smart-import-step" />;
  },
}));

// ---- Helpers ----

type CtxOverrides = Partial<React.ContextType<typeof AppContext>>;

function createAppContextValue(overrides: CtxOverrides = {}) {
  return {
    onboardingStatus: OnboardingStatus.IN_PROGRESS,
    setOnboardingStatus: jest.fn(),
    shouldShowOnboarding: true,
    onboardingReopen: false,
    closeOnboarding: jest.fn().mockResolvedValue(undefined),
    completeOnboarding: jest.fn().mockResolvedValue(undefined),
    skipOnboarding: jest.fn().mockResolvedValue(undefined),
    restartOnboarding: jest.fn().mockResolvedValue(undefined),
    onboardingPurposes: [PurposeId.Work],
    setActiveWorkspaceId: jest.fn().mockResolvedValue(undefined),
    bookmarkGroups: [],
    workspaces: {},
    bumpPostImport: jest.fn(),
    ...overrides,
  } as any;
}

function renderWithContext(overrides: CtxOverrides = {}) {
  const value = createAppContextValue(overrides);
  const utils = render(
    <AppContext.Provider value={value}>
      <OnboardingOverlay />
    </AppContext.Provider>
  );
  return { value, ...utils };
}

beforeEach(() => {
  lastPurposeStepProps = undefined;
  lastImportStepProps = undefined;
  lastSmartImportStepProps = undefined;
  jest.clearAllMocks();
});

// ---- Tests ----

it("returns null when shouldShowOnboarding is false", () => {
  const { container } = renderWithContext({ shouldShowOnboarding: false });
  expect(container.firstChild).toBeNull();
});

it("renders onboarding when onboarding has not started yet", () => {
  renderWithContext({
    onboardingStatus: OnboardingStatus.NOT_STARTED,
  });

  expect(screen.getByText(/your new tab, finally useful/i)).toBeInTheDocument();
  expect(screen.getByTestId("theme-step")).toBeInTheDocument();
});

it("renders the first step with the welcome title", () => {
  renderWithContext();

  expect(
    screen.getByText(/your new tab, finally useful/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/step 1 of/i)).toBeInTheDocument();
  expect(
    screen.getByText(/all your important links, organised and one tab away/i)
  ).toBeInTheDocument();

  const nextButton = screen.getByRole("button", { name: /next/i });
  expect(nextButton).toBeEnabled();
});

it("does not show a skip button on the first onboarding step", () => {
  renderWithContext();
  expect(
    screen.queryByRole("button", { name: /skip onboarding/i })
  ).not.toBeInTheDocument();
});

it("steps through the flow and finishes Smart Import, setting active workspace and completing onboarding", async () => {
  const user = userEvent.setup();
  const { value } = renderWithContext();

  // Step 1: select theme
  expect(screen.getByTestId("theme-step")).toBeInTheDocument();
  let nextButton = screen.getByRole("button", { name: /next/i });
  await user.click(nextButton);

  // Step 2: purpose step
  expect(screen.getByTestId("purpose-step")).toBeInTheDocument();
  // primary should be disabled until child calls setPrimaryDisabled(false)
  nextButton = screen.getByRole("button", { name: /next/i });
  expect(nextButton).toBeDisabled();

  act(() => {
    lastPurposeStepProps.setPrimaryDisabled(false);
  });

  // Re-query after state update
  nextButton = screen.getByRole("button", { name: /next/i });
  expect(nextButton).toBeEnabled();
  await user.click(nextButton);

  // Step 3: select import sources
  expect(screen.getByText(/bring your links in/i)).toBeInTheDocument();
  nextButton = screen.getByRole("button", { name: /import & continue/i });
  await user.click(nextButton);

  // Step 4: import bookmarks
  expect(screen.getByTestId("import-step")).toBeInTheDocument();

  // Verify that ImportBookmarksStep can control the primary disabled state too
  act(() => {
    lastImportStepProps.setPrimaryDisabled(true);
  });
  expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

  act(() => {
    lastImportStepProps.setPrimaryDisabled(false);
  });

  // Choose Smart import, otherwise the smart step never gets added
  act(() => {
    lastImportStepProps.onSelectionChange("smart");
  });

  nextButton = screen.getByRole("button", { name: /next/i });
  expect(nextButton).toBeEnabled();
  await user.click(nextButton);

  // Step 4: smart import
  expect(screen.getByTestId("smart-import-step")).toBeInTheDocument();

  // Primary is gated; while not done it shows "Finishing up ..." and is disabled
  const finishingUpButton = screen.getByRole("button", {
    name: /finishing up/i,
  });
  expect(finishingUpButton).toBeDisabled();

  act(() => {
    lastSmartImportStepProps.onDone("ws-123");
  });

  // Once done, the label switches to the step's primaryLabel ("Next") and becomes enabled
  const nextAfterImport = screen.getByRole("button", { name: /next/i });
  expect(nextAfterImport).toBeEnabled();
  await user.click(nextAfterImport);
  
  // Step 5: pin extension (final)
  const openMindfulButton = screen.getByRole("button", {
    name: /open mindful/i,
  });
  expect(openMindfulButton).toBeEnabled();
  await user.click(openMindfulButton);

  await waitFor(() => {
    expect(value.setActiveWorkspaceId).toHaveBeenCalledWith("ws-123");
    expect(value.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(value.bumpPostImport).toHaveBeenCalledTimes(1);
  });
});
