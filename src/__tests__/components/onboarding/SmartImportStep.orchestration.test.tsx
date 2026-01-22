import React from "react";
import { waitFor } from "@testing-library/react";
import type { PurposeIdType } from "@shared/types/purposeId";
import { PurposeId } from "@shared/constants/purposeId";

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

/* Component under test (import AFTER mocks are declared) */
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";

useFakeTimersLifecycle();

describe("SmartImportStep.orchestration", () => {
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

    expect(mockedCreateWorkspaceServiceLocal).toHaveBeenCalledWith("user-123");
    expect(startMock).toHaveBeenCalledWith([PurposeId.Work]);

    await waitFor(() => {
      expect(bumpWorkspacesVersion).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledWith("ws-123");
    });
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

    expect(startMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("handles errors from start, still bumps workspace version, and does not notify parent", async () => {
    type StartFn = (purposes: PurposeIdType[]) => Promise<string | null>;
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