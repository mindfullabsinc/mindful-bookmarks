import React from "react";
import { waitFor } from "@testing-library/react";

import {
  mockedUseSmartImport,
  mockedCreateWorkspaceServiceLocal,
  renderWithContext,
  useFakeTimersLifecycle,
} from "@/__tests__/testUtils/smartImportStepTestSetup";

jest.mock("@/components/shared/ImportProgress", () => {
  const React = require("react");
  return {
    ImportProgress: ({ backendPhase, onVisualDoneChange }: any) => {
      React.useEffect(() => {
        if (backendPhase === "done") onVisualDoneChange(true);
      }, [backendPhase, onVisualDoneChange]);

      return <div data-testid="import-progress-mock" />;
    },
  };
});

jest.mock("@/scripts/workspaces/registry", () => {
  const actual = jest.requireActual("@/scripts/workspaces/registry");
  return {
    ...actual,
    pruneNewWorkspacePlaceholders: jest.fn().mockResolvedValue(undefined),
  };
});

/* Component under test (import AFTER mocks are declared) */
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";

useFakeTimersLifecycle();

describe("SmartImportStep.orchestration", () => {
  it("starts smart import on mount and notifies parent when done", async () => {
    type StartFn = () => Promise<string | null>;
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
      <SmartImportStep onDone={onDone} />
    );

    expect(mockedCreateWorkspaceServiceLocal).toHaveBeenCalledWith("user-123");
    expect(startMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(bumpWorkspacesVersion).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledWith("ws-123");
    });
  });

  it("handles errors from start, still bumps workspace version, and does not notify parent", async () => {
    type StartFn = () => Promise<string | null>;
    const startMock = jest
      .fn<ReturnType<StartFn>, Parameters<StartFn>>()
      .mockRejectedValue(new Error("boom"));

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    mockedUseSmartImport.mockReturnValue({
      phase: "initializing",
      message: "Init",
      totalItems: undefined,
      processedItems: undefined,
      start: startMock as unknown as StartFn,
    });

    const onDone = jest.fn();
    const { bumpWorkspacesVersion } = renderWithContext(
      <SmartImportStep onDone={onDone} />
    );

    await waitFor(() => {
      expect(startMock).toHaveBeenCalled();
      expect(bumpWorkspacesVersion).toHaveBeenCalled();
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
