import { renderHook, act } from "@testing-library/react";
import { useManualImportWizardState } from "@/hooks/useManualImportWizardState";

/* Constants */
import {
  ImportPostProcessMode,
  OpenTabsScope,
} from "@/core/constants/import";

describe("useManualImportWizardState", () => {
  it("initializes with default values when no initial state is provided", () => {
    const { result } = renderHook(() => useManualImportWizardState());

    const { state, selection } = result.current;

    // Step 1
    expect(state.jsonYes).toBe(false);
    expect(state.jsonFileName).toBeNull();
    expect(state.jsonData).toBeNull();

    // Step 2
    expect(state.bookmarksYes).toBe(false);

    // Step 3
    expect(state.tabsYes).toBe(false);
    expect(state.tabScope).toBe(OpenTabsScope.All);

    // Step 4
    expect(state.postProcessMode).toBe(
      ImportPostProcessMode.PreserveStructure
    );

    // Selection
    expect(selection).toEqual({
      jsonFileName: null,
      jsonData: null,
      importBookmarks: false,
      tabScope: undefined,
      importPostProcessMode: ImportPostProcessMode.PreserveStructure,
    });
  });

  it("initializes with provided partial initial state", () => {
    const { result } = renderHook(() =>
      useManualImportWizardState({
        jsonYes: true,
        jsonFileName: "bookmarks.json",
        jsonData: "{...}",
        bookmarksYes: true,
        tabsYes: true,
        tabScope: OpenTabsScope.Current,
        postProcessMode: ImportPostProcessMode.PreserveStructure,
      })
    );

    const { state, selection } = result.current;

    expect(state.jsonYes).toBe(true);
    expect(state.jsonFileName).toBe("bookmarks.json");
    expect(state.jsonData).toBe("{...}");
    expect(state.bookmarksYes).toBe(true);
    expect(state.tabsYes).toBe(true);
    expect(state.tabScope).toBe(OpenTabsScope.Current);
    expect(state.postProcessMode).toBe(
      ImportPostProcessMode.PreserveStructure
    );

    expect(selection).toEqual({
      jsonFileName: "bookmarks.json",
      jsonData: "{...}",
      importBookmarks: true,
      tabScope: OpenTabsScope.Current,
      importPostProcessMode: ImportPostProcessMode.PreserveStructure,
    });
  });

  it("updates selection reactively when state changes", () => {
    const { result } = renderHook(() => useManualImportWizardState());

    act(() => {
      result.current.state.setJsonYes(true);
      result.current.state.setJsonFileName("import.json");
      result.current.state.setJsonData("data");
      result.current.state.setBookmarksYes(true);
      result.current.state.setTabsYes(true);
      result.current.state.setTabScope(OpenTabsScope.Current);
    });

    expect(result.current.selection).toEqual({
      jsonFileName: "import.json",
      jsonData: "data",
      importBookmarks: true,
      tabScope: OpenTabsScope.Current,
      importPostProcessMode:
        ImportPostProcessMode.PreserveStructure,
    });
  });

  it("omits json fields from selection when jsonYes is false", () => {
    const { result } = renderHook(() =>
      useManualImportWizardState({
        jsonYes: true,
        jsonFileName: "file.json",
        jsonData: "data",
      })
    );

    act(() => {
      result.current.state.setJsonYes(false);
    });

    expect(result.current.selection.jsonFileName).toBeNull();
    expect(result.current.selection.jsonData).toBeNull();
  });

  it("omits tabScope from selection when tabsYes is false", () => {
    const { result } = renderHook(() =>
      useManualImportWizardState({
        tabsYes: true,
        tabScope: OpenTabsScope.Current,
      })
    );

    act(() => {
      result.current.state.setTabsYes(false);
    });

    expect(result.current.selection.tabScope).toBeUndefined();
  });

  it("resets state back to defaults when reset is called", () => {
    const { result } = renderHook(() =>
      useManualImportWizardState({
        jsonYes: true,
        jsonFileName: "file.json",
        jsonData: "data",
        bookmarksYes: true,
        tabsYes: true,
        tabScope: OpenTabsScope.Current,
        postProcessMode: ImportPostProcessMode.PreserveStructure,
      })
    );

    act(() => {
      result.current.reset();
    });

    const { state, selection } = result.current;

    expect(state.jsonYes).toBe(false);
    expect(state.jsonFileName).toBeNull();
    expect(state.jsonData).toBeNull();
    expect(state.bookmarksYes).toBe(false);
    expect(state.tabsYes).toBe(false);
    expect(state.tabScope).toBe(OpenTabsScope.All);
    expect(state.postProcessMode).toBe(
      ImportPostProcessMode.PreserveStructure
    );

    expect(selection).toEqual({
      jsonFileName: null,
      jsonData: null,
      importBookmarks: false,
      tabScope: undefined,
      importPostProcessMode:
        ImportPostProcessMode.PreserveStructure,
    });
  });
});