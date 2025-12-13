import { renderHook, act } from "@testing-library/react";
import { useSmartImport } from "@/hooks/useSmartImport";
import { runSmartImport } from "@/scripts/import/smartImport";
import { PurposeId } from "@shared/constants/purposeId";
import type { SmartImportPhase } from "@/core/types/smartImportPhase";
import type { PurposeIdType } from "@shared/types/purposeId";

jest.mock("@/scripts/import/smartImport", () => ({
  runSmartImport: jest.fn(),
}));

const mockedRunSmartImport =
  runSmartImport as jest.MockedFunction<typeof runSmartImport>;

describe("useSmartImport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initializes state, calls runSmartImport, updates progress, and returns primaryWorkspaceId", async () => {
    // Arrange: mock runSmartImport to call onProgress and return a workspace id
    mockedRunSmartImport.mockImplementation(async (options: any) => {
      // Simulate progress callback being invoked by the pipeline
      options.onProgress({
        phase: "initializing" as SmartImportPhase,
        message: "Importing your stuff…",
        totalItems: 42,
        processedItems: 10,
      });

      return {
        primaryWorkspaceId: "ws-123",
      };
    });

    const baseOptions = {} as any; // we don't care about the shape for this test
    const { result } = renderHook(() => useSmartImport(baseOptions));

    // Initial state
    expect(result.current.phase).toBe("initializing");
    expect(result.current.message).toBe("Starting Smart Import…");
    expect(result.current.totalItems).toBeUndefined();
    expect(result.current.processedItems).toBeUndefined();

    // Act: run the import
    let returnedWorkspaceId: string | null = null;
    await act(async () => {
      returnedWorkspaceId = await result.current.start([
        PurposeId.Personal as PurposeIdType,
      ]);
    });

    // Assert: runSmartImport called with merged options
    expect(mockedRunSmartImport).toHaveBeenCalledTimes(1);
    const callArg = mockedRunSmartImport.mock.calls[0][0];

    expect(callArg).toMatchObject({
      purposes: [PurposeId.Personal],
    });
    expect(typeof callArg.onProgress).toBe("function");

    // State updated from onProgress
    expect(result.current.phase).toBe("initializing"); // from our mock
    expect(result.current.message).toBe("Importing your stuff…");
    expect(result.current.totalItems).toBe(42);
    expect(result.current.processedItems).toBe(10);

    // Return value from hook is the primaryWorkspaceId
    expect(returnedWorkspaceId).toBe("ws-123");
  });

  it("returns null when runSmartImport result has no primaryWorkspaceId", async () => {
    mockedRunSmartImport.mockResolvedValueOnce(null as any);

    const { result } = renderHook(() => useSmartImport({} as any));

    let returnedWorkspaceId: string | null = "dummy";
    await act(async () => {
      returnedWorkspaceId = await result.current.start([
        PurposeId.Work as PurposeIdType,
      ]);
    });

    expect(mockedRunSmartImport).toHaveBeenCalledTimes(1);
    expect(returnedWorkspaceId).toBeNull();
  });
});
