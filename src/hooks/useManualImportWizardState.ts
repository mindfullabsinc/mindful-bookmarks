import * as React from "react";

/* Constants */
import { ImportPostProcessMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type {
  ManualImportSelectionType,
  ImportPostProcessModeType,
  OpenTabsScopeType,
} from "@/core/types/import";
import type { ImportBookmarksStepBodyState } from "@/components/shared/ImportBookmarksStepBody";

export type ManualImportWizardState = ImportBookmarksStepBodyState;

export function useManualImportWizardState(initial?: Partial<ManualImportWizardState>) {
  // Step 1
  const [jsonYes, setJsonYes] = React.useState<boolean>(initial?.jsonYes ?? false);
  const [jsonFileName, setJsonFileName] = React.useState<string | null>(
    initial?.jsonFileName ?? null
  );
  const [jsonData, setJsonData] = React.useState<string | null>(initial?.jsonData ?? null);

  // Step 2
  const [bookmarksYes, setBookmarksYes] = React.useState<boolean>(
    initial?.bookmarksYes ?? false
  );

  // Step 3
  const [tabsYes, setTabsYes] = React.useState<boolean>(initial?.tabsYes ?? false);
  const [tabScope, setTabScope] = React.useState<OpenTabsScopeType>(
    initial?.tabScope ?? OpenTabsScope.All
  );

  // Step 4
  const [postProcessMode, setPostProcessMode] = React.useState<ImportPostProcessModeType>(
    initial?.postProcessMode ?? ImportPostProcessMode.PreserveStructure
  );

  const state: ManualImportWizardState = React.useMemo(
    () => ({
      jsonYes,
      setJsonYes,
      jsonFileName,
      setJsonFileName,
      jsonData,
      setJsonData,

      bookmarksYes,
      setBookmarksYes,

      tabsYes,
      setTabsYes,
      tabScope,
      setTabScope,

      postProcessMode,
      setPostProcessMode,
    }),
    [
      jsonYes,
      jsonFileName,
      jsonData,
      bookmarksYes,
      tabsYes,
      tabScope,
      postProcessMode,
    ]
  );

  const selection: ManualImportSelectionType = React.useMemo(
    () => ({
      jsonFileName: jsonYes ? jsonFileName : null,
      jsonData: jsonYes ? jsonData : null,
      importBookmarks: bookmarksYes,
      tabScope: tabsYes ? tabScope : undefined,
      importPostProcessMode: postProcessMode,
    }),
    [jsonYes, jsonFileName, jsonData, bookmarksYes, tabsYes, tabScope, postProcessMode]
  );

  const reset = React.useCallback(() => {
    setJsonYes(false);
    setJsonFileName(null);
    setJsonData(null);

    setBookmarksYes(false);

    setTabsYes(false);
    setTabScope(OpenTabsScope.All);

    setPostProcessMode(ImportPostProcessMode.PreserveStructure);
  }, []);

  return {
    state,
    selection,
    reset,
  };
}
