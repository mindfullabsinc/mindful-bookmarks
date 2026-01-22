import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ImportBookmarksStepBody,
  getImportBookmarksStepCopy,
  LAST_STEP,
  type WizardStep,
  type ImportBookmarksStepBodyState,
} from "@/components/shared/ImportBookmarksStepBody";

import { ImportPostProcessMode, OpenTabsScope } from "@/core/constants/import";

/**
 * If the Jest config already mocks CSS imports, we can remove this line.
 * (Keeping it here makes the test file more self-contained.)
 */
jest.mock("@/styles/components/shared/ImportBookmarksContent.css", () => ({}));

jest.mock("@/components/privacy/AiDisclosure", () => ({
  AiDisclosure: ({ variant, serviceName }: { variant: string; serviceName: string }) => (
    <div data-testid="ai-disclosure">
      AiDisclosure mock — {variant} — {serviceName}
    </div>
  ),
}));

function WizardHarness({
  step,
  showInternalHeader = true,
  busy = false,
  initial = {},
}: {
  step: WizardStep;
  showInternalHeader?: boolean;
  busy?: boolean;
  initial?: Partial<Pick<
    ImportBookmarksStepBodyState,
    "jsonYes" | "jsonFileName" | "jsonData" | "bookmarksYes" | "tabsYes" | "tabScope" | "postProcessMode"
  >>;
}) {
  const [jsonYes, setJsonYes] = React.useState<boolean>(initial.jsonYes ?? false);
  const [jsonFileName, setJsonFileName] = React.useState<string | null>(initial.jsonFileName ?? null);
  const [jsonData, setJsonData] = React.useState<string | null>(initial.jsonData ?? null);

  const [bookmarksYes, setBookmarksYes] = React.useState<boolean>(initial.bookmarksYes ?? false);

  const [tabsYes, setTabsYes] = React.useState<boolean>(initial.tabsYes ?? false);
  const [tabScope, setTabScope] = React.useState<any>(initial.tabScope ?? OpenTabsScope.All);

  const [postProcessMode, setPostProcessMode] = React.useState<any>(
    initial.postProcessMode ?? ImportPostProcessMode.PreserveStructure
  );

  const state: ImportBookmarksStepBodyState = {
    // step 1
    jsonYes,
    setJsonYes,
    jsonFileName,
    setJsonFileName,
    jsonData,
    setJsonData,

    // step 2
    bookmarksYes,
    setBookmarksYes,

    // step 3
    tabsYes,
    setTabsYes,
    tabScope,
    setTabScope,

    // step 4
    postProcessMode,
    setPostProcessMode,
  };

  return (
    <ImportBookmarksStepBody
      step={step}
      state={state}
      showInternalHeader={showInternalHeader}
      busy={busy}
    />
  );
}

describe("ImportBookmarksStepBody", () => {
  test("getImportBookmarksStepCopy returns step copy", () => {
    const copy = getImportBookmarksStepCopy(1);
    expect(copy.title).toMatch(/json file/i);

    const copy4 = getImportBookmarksStepCopy(4);
    expect(copy4.title).toMatch(/automatically organize/i);
  });

  test("renders internal header by default, and can hide it", () => {
    const { rerender } = render(<WizardHarness step={1} />);

    expect(screen.getByText(`Step 1 of ${LAST_STEP}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /do you have a json file to import/i })).toBeInTheDocument();

    rerender(<WizardHarness step={1} showInternalHeader={false} />);
    expect(screen.queryByText(`Step 1 of ${LAST_STEP}`)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /do you have a json file to import/i })).not.toBeInTheDocument();
  });

  describe("step 1 (JSON file)", () => {
    test("toggles Yes; shows file input; uploads JSON; shows selected; Remove clears back to input", async () => {
      const user = userEvent.setup();
      render(<WizardHarness step={1} />);

      const yesRow = screen.getByRole("button", { name: /^yes$/i });
      await user.click(yesRow);

      const fileInput = document.querySelector("#json-file-input") as HTMLInputElement | null;
      expect(fileInput).toBeTruthy();

      const jsonString = JSON.stringify({ hello: "world" });

      // Create a File, then polyfill text() on *this instance* (no Response needed)
      const file = new File([jsonString], "bookmarks.json", { type: "application/json" });
      Object.defineProperty(file, "text", {
        configurable: true,
        value: async () => jsonString,
      });

      await user.upload(fileInput as HTMLInputElement, file);

      // Don't assert "Selected:" (can be split across nodes); assert filename + Remove button
      await waitFor(() => {
        expect(screen.getByText("bookmarks.json")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /remove/i }));

      await waitFor(() => {
        expect(screen.queryByText("bookmarks.json")).not.toBeInTheDocument();
        expect(document.querySelector("#json-file-input")).toBeTruthy();
      });
    });

    test("busy disables file input (when shown) and disables Remove button (when selected)", async () => {
      const user = userEvent.setup();

      // Case A: busy disables file input
      const { unmount } = render(<WizardHarness step={1} initial={{ jsonYes: true }} busy />);
      const fileInput = document.querySelector("#json-file-input") as HTMLInputElement | null;
      expect(fileInput).toBeTruthy();
      expect(fileInput).toBeDisabled();
      unmount();

      // Case B: busy disables Remove button when a file is already selected
      render(
        <WizardHarness
          step={1}
          busy
          initial={{
            jsonYes: true,
            jsonFileName: "x.json",
            jsonData: "{}",
          }}
        />
      );

      const removeBtn = screen.getByRole("button", { name: /remove/i });
      expect(removeBtn).toBeDisabled();

      // Clicking shouldn't change anything / throw
      await user.click(removeBtn);
      expect(screen.getByText("x.json")).toBeInTheDocument();
    });
    
    test("turning Yes off clears selected JSON state (clears selection and hides container)", async () => {
      const user = userEvent.setup();

      render(
        <WizardHarness
          step={1}
          initial={{
            jsonYes: true,
            jsonFileName: "x.json",
            jsonData: "{}",
          }}
        />
      );

      expect(screen.getByText(/selected:/i)).toBeInTheDocument();
      expect(screen.getByText("x.json")).toBeInTheDocument();

      const yesRow = screen.getByRole("button", { name: /^yes$/i });
      await user.click(yesRow); // toggles off -> should clear selection and hide json input container

      expect(screen.queryByText(/selected:/i)).not.toBeInTheDocument();
      expect(document.querySelector("#json-file-input")).not.toBeInTheDocument();
    });
  });

  describe("step 2 (Chrome bookmarks)", () => {
    test("toggles bookmarksYes when clicking Yes row", async () => {
      const user = userEvent.setup();
      render(<WizardHarness step={2} />);

      const yesRow = screen.getByRole("button", { name: /^yes$/i });
      // We can't directly see state, but we can assert class changes:
      expect(yesRow.className).toMatch(/checkbox-row--unchecked/);

      await user.click(yesRow);
      expect(yesRow.className).toMatch(/checkbox-row--checked/);

      await user.click(yesRow);
      expect(yesRow.className).toMatch(/checkbox-row--unchecked/);
    });
  });

  describe("step 3 (Open tabs)", () => {
    test("shows tab scope choices when enabled; allows selecting Current window; turning off resets scope to All", async () => {
      const user = userEvent.setup();
      render(<WizardHarness step={3} />);

      // Initially tabsYes false -> no scope UI
      expect(screen.queryByText(/which tabs\?/i)).not.toBeInTheDocument();

      const yesRow = screen.getByRole("button", { name: /^yes$/i });
      await user.click(yesRow);

      expect(screen.getByText(/which tabs\?/i)).toBeInTheDocument();

      const allWindowsBtn = screen.getByRole("button", { name: /all windows/i });
      const currentWindowBtn = screen.getByRole("button", { name: /current window/i });

      // Default should be All selected
      expect(allWindowsBtn.className).toMatch(/--selected/);
      expect(currentWindowBtn.className).toMatch(/--unselected/);

      await user.click(currentWindowBtn);
      expect(currentWindowBtn.className).toMatch(/--selected/);
      expect(allWindowsBtn.className).toMatch(/--unselected/);

      // Toggle off -> should reset scope to All (even though UI hides)
      await user.click(yesRow);
      expect(screen.queryByText(/which tabs\?/i)).not.toBeInTheDocument();

      // Toggle on again -> should be All windows selected again
      await user.click(yesRow);
      const allWindowsBtn2 = screen.getByRole("button", { name: /all windows/i });
      const currentWindowBtn2 = screen.getByRole("button", { name: /current window/i });
      expect(allWindowsBtn2.className).toMatch(/--selected/);
      expect(currentWindowBtn2.className).toMatch(/--unselected/);
    });

    test("busy disables the tab scope buttons", async () => {
      const user = userEvent.setup();
      render(<WizardHarness step={3} busy initial={{ tabsYes: true }} />);

      const allWindowsBtn = screen.getByRole("button", { name: /all windows/i });
      const currentWindowBtn = screen.getByRole("button", { name: /current window/i });

      expect(allWindowsBtn).toBeDisabled();
      expect(currentWindowBtn).toBeDisabled();

      // Clicking shouldn't change anything / throw
      await user.click(currentWindowBtn);
      expect(allWindowsBtn.className).toMatch(/--selected/);
    });
  });

  describe("step 4 (Post-processing / AI)", () => {
    test("renders AiDisclosure and toggles postProcessMode when clicking Yes row", async () => {
      const user = userEvent.setup();

      render(
        <WizardHarness
          step={4}
          initial={{ postProcessMode: ImportPostProcessMode.PreserveStructure }}
        />
      );

      expect(screen.getByTestId("ai-disclosure")).toBeInTheDocument();

      const yesRow = screen.getByRole("button", { name: /^yes$/i });
      expect(yesRow.className).toMatch(/checkbox-row--unchecked/);

      await user.click(yesRow);
      expect(yesRow.className).toMatch(/checkbox-row--checked/);

      await user.click(yesRow);
      expect(yesRow.className).toMatch(/checkbox-row--unchecked/);
    });
  });
});
