import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

/* Component under test */
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";

/* Hooks / context / services */
import { AppContext } from "@/scripts/AppContextProvider";
import { useSmartImport } from "@/hooks/useSmartImport";
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";

/* Types */
import type { PurposeIdType } from "@shared/types/purposeId";

/* -------------------- Mocks -------------------- */

jest.mock("@/hooks/useSmartImport");
jest.mock("@/core/constants/smartImportPhase", () => ({
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

// Make the icons easy to query and avoid SVG complexity
jest.mock("lucide-react", () => ({
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="loader-icon" {...props} />
  ),
  Wand2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="wand-icon" {...props} />
  ),
}));

const mockedUseSmartImport = useSmartImport as jest.MockedFunction<
  typeof useSmartImport
>;
const mockedCreateWorkspaceServiceLocal =
  createWorkspaceServiceLocal as jest.MockedFunction<
    typeof createWorkspaceServiceLocal
  >;

function renderWithContext(
  ui: React.ReactElement,
  {
    userId = "user-123",
    bumpWorkspacesVersion = jest.fn(),
  }: { userId?: string; bumpWorkspacesVersion?: jest.Mock } = {}
) {
  const ctxValue = {
    userId,
    bumpWorkspacesVersion,
  } as any; // other AppContext fields not needed for this test

  return {
    bumpWorkspacesVersion,
    ...render(<AppContext.Provider value={ctxValue}>{ui}</AppContext.Provider>),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/* -------------------- Tests -------------------- */

describe("SmartImportStep", () => {
  it("starts smart import on mount and notifies parent when done", async () => {
    type StartFn = (purposes: PurposeIdType[]) => Promise<string | null>;
    const startMock = jest.fn<ReturnType<StartFn>, Parameters<StartFn>>();
    startMock.mockResolvedValue("ws-123");

    mockedUseSmartImport.mockReturnValue({
      phase: "done",
      message: "Backend done message",
      totalItems: undefined,
      processedItems: undefined,
      start: startMock as unknown as StartFn,
    });

    const onDone = jest.fn();
    const { bumpWorkspacesVersion } = renderWithContext(
      <SmartImportStep purposes={[PurposeId.Work] as PurposeIdType[]} onDone={onDone} />
    );

    // Workspace service should be created for the current user
    expect(mockedCreateWorkspaceServiceLocal).toHaveBeenCalledWith("user-123");

    // Smart import should be started with selected purposes
    expect(startMock).toHaveBeenCalledWith([PurposeId.Work]);

    // When the promise resolves, we should bump the version and notify parent
    await waitFor(() => {
      expect(bumpWorkspacesVersion).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledWith("ws-123");
    });

    // We don't assert the "done" visual state here because the visual
    // phase advances over time via setTimeout; that's covered separately.
  });

  it("does not start smart import when purposes array is empty", () => {
    type StartFn = (purposes: PurposeIdType[]) => Promise<string | null>;
    const startMock = jest.fn<ReturnType<StartFn>, Parameters<StartFn>>();

    mockedUseSmartImport.mockReturnValue({
      phase: "initializing",
      message: "Init",
      totalItems: undefined,
      processedItems: undefined,
      start: startMock as unknown as StartFn,
    });

    const onDone = jest.fn();

    renderWithContext(<SmartImportStep purposes={[]} onDone={onDone} />);

    // No purposes → no import start
    expect(startMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("advances visual phase towards backend phase over time", () => {
    type StartFn = (purposes: PurposeIdType[]) => Promise<string | null>;
    const startMock = jest.fn<ReturnType<StartFn>, Parameters<StartFn>>();
    startMock.mockResolvedValue(null);

    mockedUseSmartImport.mockReturnValue({
      phase: "categorizing",
      message: "Backend categorizing",
      totalItems: 10,
      processedItems: 5,
      start: startMock as unknown as StartFn,
    });

    const { container } = renderWithContext(
      <SmartImportStep purposes={[PurposeId.Work] as PurposeIdType[]} onDone={jest.fn()} />
    );

    const bar = container.querySelector(
      ".bg-blue-500"
    ) as HTMLDivElement | null;
    expect(bar).not.toBeNull();

    const initialClassName = bar!.className;
    // Starts at initializing → w-1/6
    expect(initialClassName).toContain("w-1/6");

    // Let timers run so the visual phase can move towards backend phase
    act(() => {
      jest.runAllTimers();
    });

    // Visual phase should have advanced away from the initial width
    expect(bar!.className).not.toBe(initialClassName);
    expect(bar!.className).not.toContain("w-1/6");

    // We don't assert the exact final width ("w-4/6") because how many
    // steps we advance can differ with React/timer scheduling; it's enough
    // that it moved forward.
  });

  it("handles errors from start, still bumps workspace version, and does not notify parent", async () => {
    type StartFn = (purposes: PurposeIdType[]) => Promise<string | null>;
    const startMock = jest
      .fn<ReturnType<StartFn>, Parameters<StartFn>>()
      .mockRejectedValue(new Error("boom"));
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockedUseSmartImport.mockReturnValue({
      phase: "initializing",
      message: "Init",
      totalItems: undefined,
      processedItems: undefined,
      start: startMock as unknown as StartFn,
    });

    const onDone = jest.fn();
    const { bumpWorkspacesVersion } = renderWithContext(
      <SmartImportStep purposes={[PurposeId.Work] as PurposeIdType[]} onDone={onDone} />
    );

    await waitFor(() => {
      expect(startMock).toHaveBeenCalledWith([PurposeId.Work]);
      expect(bumpWorkspacesVersion).toHaveBeenCalled();
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});