import React from "react";
import { render } from "@testing-library/react";

/* Hooks / context / services */
import { AppContext } from "@/scripts/AppContextProvider";
import { useSmartImport } from "@/hooks/useSmartImport";
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* -------------------- Shared Mocks -------------------- */

jest.mock("@/hooks/useSmartImport");

jest.mock("@/core/constants/importPhase", () => ({
  PHASE_MESSAGES: {
    initializing: "Initializing…",
    collecting: "Collecting…",
    filtering: "Filtering…",
    categorizing: "Categorizing…",
    persisting: "Persisting…",
    done: "Done!",
  },
}));

jest.mock("@/scripts/import/workspaceServiceLocal", () => ({
  createWorkspaceServiceLocal: jest.fn((userId: string) => ({
    type: "mockWorkspaceService",
    userId,
  })),
}));

jest.mock("@/scripts/import/browserSourceServiceChrome", () => ({
  chromeBrowserSourceService: { type: "mockBrowserSourceService" },
}));

jest.mock("@/scripts/import/nsfwFilter", () => ({
  basicNsfwFilter: { type: "mockNsfwFilter" },
}));

jest.mock("@/scripts/import/groupingLLMRemote", () => ({
  remoteGroupingLLM: { type: "mockGroupingLLM" },
}));

jest.mock("lucide-react", () => ({
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="loader-icon" {...props} />
  ),
  Wand2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="wand-icon" {...props} />
  ),
}));

/* -------------------- Shared typed handles -------------------- */

export const mockedUseSmartImport = useSmartImport as jest.MockedFunction<
  typeof useSmartImport
>;

export const mockedCreateWorkspaceServiceLocal =
  createWorkspaceServiceLocal as jest.MockedFunction<
    typeof createWorkspaceServiceLocal
  >;

/* -------------------- Shared render helper -------------------- */

export function renderWithContext(
  ui: React.ReactElement,
  {
    userId = "user-123",
    bumpWorkspacesVersion = jest.fn(),
  }: { userId?: string; bumpWorkspacesVersion?: jest.Mock } = {}
) {
  const ctxValue = { userId, bumpWorkspacesVersion } as any;

  return {
    bumpWorkspacesVersion,
    ...render(<AppContext.Provider value={ctxValue}>{ui}</AppContext.Provider>),
  };
}

/* -------------------- Shared timer lifecycle -------------------- */

export function useFakeTimersLifecycle() {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
}
