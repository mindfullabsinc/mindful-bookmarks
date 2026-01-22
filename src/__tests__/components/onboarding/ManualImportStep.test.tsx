import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { ManualImportStep } from "@/components/onboarding/ManualImportStep";
import { ImportPostProcessMode } from "@/core/constants/import";

/* -------------------- Mocks -------------------- */
declare global {
  // eslint-disable-next-line no-var
  var __manualImportStepMocks__:
    | {
        bumpWorkspacesVersionMock: jest.Mock;
        createWorkspaceForPurposeMock: jest.Mock;
        commitManualImportIntoWorkspaceMock: jest.Mock;
      }
    | undefined;
}

function getMocks() {
  const g = globalThis as any;

  if (!g.__manualImportStepMocks__) {
    g.__manualImportStepMocks__ = {
      bumpWorkspacesVersionMock: jest.fn(),
      createWorkspaceForPurposeMock: jest.fn(),
      commitManualImportIntoWorkspaceMock: jest.fn(),
    };
  }

  return g.__manualImportStepMocks__ as NonNullable<typeof globalThis.__manualImportStepMocks__>;
}

jest.mock("@/scripts/AppContextProvider", () => {
  const React = require("react");
  const mocks = getMocks();

  return {
    AppContext: React.createContext({
      userId: "test-user",
      bumpWorkspacesVersion: mocks.bumpWorkspacesVersionMock,
    }),
  };
});

jest.mock("@/scripts/import/workspaceServiceLocal", () => {
  const mocks = getMocks();

  return {
    createWorkspaceServiceLocal: jest.fn(() => ({
      createWorkspaceForPurpose: mocks.createWorkspaceForPurposeMock,
    })),
  };
});

jest.mock("@/scripts/import/commitManualImportIntoWorkspace", () => {
  const mocks = getMocks();

  return {
    commitManualImportIntoWorkspace: (...args: any[]) =>
      mocks.commitManualImportIntoWorkspaceMock(...args),
  };
});

jest.mock("@/components/privacy/AiDisclosure", () => ({
  AiDisclosure: () => null,
}));

jest.mock("@/components/shared/ImportProgress", () => {
  const React = require("react");
  return {
    ImportProgress: ({
      backendPhase,
      backendMessage,
      onVisualDoneChange,
    }: {
      backendPhase: string;
      backendMessage?: string;
      onVisualDoneChange?: (done: boolean) => void;
    }) => {
      React.useEffect(() => {
        if (backendPhase === "done") onVisualDoneChange?.(true);
      }, [backendPhase, onVisualDoneChange]);

      return (
        <div data-testid="import-progress">
          <div>phase:{backendPhase}</div>
          {backendMessage ? <div>msg:{backendMessage}</div> : null}
        </div>
      );
    },
  };
});

/* Expose mock fns for assertions */
const {
  bumpWorkspacesVersionMock,
  createWorkspaceForPurposeMock,
  commitManualImportIntoWorkspaceMock,
} = getMocks();

/* -------------------- Helpers -------------------- */
function makeSelection(overrides?: Partial<any>) {
  return {
    importPostProcessMode: undefined,
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  bumpWorkspacesVersionMock.mockClear();
  createWorkspaceForPurposeMock.mockReset();
  commitManualImportIntoWorkspaceMock.mockReset();
});

/* -------------------- Tests -------------------- */
describe("ManualImportStep", () => {
  test("AI-enabled path: creates workspaces, commits, and calls onDone only after visual done", async () => {
    createWorkspaceForPurposeMock
      .mockResolvedValueOnce({ id: "w1", purpose: "p1" })
      .mockResolvedValueOnce({ id: "w2", purpose: "p2" });

    commitManualImportIntoWorkspaceMock.mockImplementation(async ({ onProgress }: any) => {
      onProgress?.("Importing bookmarks...");
      onProgress?.("Organizing into groups...");
      onProgress?.("Final touches...");
      return;
    });

    const onDone = jest.fn();
    const onBusyChange = jest.fn();
    const onProgress = jest.fn();
    const onError = jest.fn();

    render(
      <ManualImportStep
        purposes={["p1", "p2"] as any}
        selection={makeSelection({
          importPostProcessMode: ImportPostProcessMode.SemanticGrouping,
        })}
        onDone={onDone}
        onBusyChange={onBusyChange}
        onProgress={onProgress}
        onError={onError}
      />
    );

    expect(await screen.findByTestId("import-progress")).toBeInTheDocument();

    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
    expect(onProgress).toHaveBeenCalledWith("Preparing workspaces...");
    expect(onError).toHaveBeenCalledWith(null);

    await waitFor(() => expect(commitManualImportIntoWorkspaceMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("w1"));

    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));

    expect(bumpWorkspacesVersionMock).toHaveBeenCalledTimes(2);
    expect(createWorkspaceForPurposeMock).toHaveBeenCalledTimes(2);
  });

  test("non-AI path: shows committing text and calls onDone when commit completes", async () => {
    createWorkspaceForPurposeMock.mockResolvedValueOnce({ id: "w1", purpose: "p1" });

    commitManualImportIntoWorkspaceMock.mockImplementation(async ({ onProgress }: any) => {
      onProgress?.("Importing bookmarks...");
      return;
    });

    const onDone = jest.fn();
    const onBusyChange = jest.fn();
    const onProgress = jest.fn();
    const onError = jest.fn();

    render(
      <ManualImportStep
        purposes={["p1"] as any}
        selection={makeSelection({ importPostProcessMode: undefined })}
        onDone={onDone}
        onBusyChange={onBusyChange}
        onProgress={onProgress}
        onError={onError}
      />
    );

    expect(await screen.findByText(/importing/i)).toBeInTheDocument();

    await waitFor(() => expect(commitManualImportIntoWorkspaceMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("w1"));

    await waitFor(() =>
      expect(screen.getByText(/all set! you can open mindful/i)).toBeInTheDocument()
    );
  });

  test("non-AI path: shows error and calls onError if commit fails", async () => {
    createWorkspaceForPurposeMock.mockResolvedValueOnce({ id: "w1", purpose: "p1" });
    commitManualImportIntoWorkspaceMock.mockRejectedValueOnce(new Error("boom"));

    const onDone = jest.fn();
    const onBusyChange = jest.fn();
    const onProgress = jest.fn();
    const onError = jest.fn();

    render(
      <ManualImportStep
        purposes={["p1"] as any}
        selection={makeSelection({ importPostProcessMode: undefined })}
        onDone={onDone}
        onBusyChange={onBusyChange}
        onProgress={onProgress}
        onError={onError}
      />
    );

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("boom");
    expect(onDone).not.toHaveBeenCalled();
  });
});