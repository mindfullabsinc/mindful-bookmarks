import React from "react";
import { waitFor, act } from "@testing-library/react";
import type { PurposeIdType } from "@shared/types/purposeId";
import { PurposeId } from "@shared/constants/purposeId";

import {
  mockedUseSmartImport,
  renderWithContext,
  useFakeTimersLifecycle,
} from "@/__tests__/testUtils/smartImportStepTestSetup";

/* Component under test */
import { SmartImportStep } from "@/components/onboarding/SmartImportStep";

useFakeTimersLifecycle();

describe("SmartImportStep.visual", () => {
  it("advances visual phase towards backend phase over time", async () => {
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

    const bar = container.querySelector(".s_import-progress-bar") as HTMLDivElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain("w-1/6");

    for (let i = 0; i < 3; i++) {
      act(() => {
        jest.advanceTimersByTime(800);
      });
    }

    await waitFor(() => {
      expect(bar!.className).toContain("w-4/6");
    });
  });
});