import * as React from "react";
/* Constants */
import { ImportPostProcessMode, JsonImportMode, OpenTabsScope } from "@/core/constants/import";
export function useManualImportWizardState(initial) {
    // Step 1
    const [jsonYes, setJsonYes] = React.useState(initial?.jsonYes ?? false);
    const [jsonFileName, setJsonFileName] = React.useState(initial?.jsonFileName ?? null);
    const [jsonData, setJsonData] = React.useState(initial?.jsonData ?? null);
    const [jsonImportMode, setJsonImportMode] = React.useState(initial?.jsonImportMode ?? JsonImportMode.Add);
    // Step 2
    const [bookmarksYes, setBookmarksYes] = React.useState(initial?.bookmarksYes ?? false);
    // Step 3
    const [tabsYes, setTabsYes] = React.useState(initial?.tabsYes ?? false);
    const [tabScope, setTabScope] = React.useState(initial?.tabScope ?? OpenTabsScope.All);
    // Step 4
    const [postProcessMode, setPostProcessMode] = React.useState(initial?.postProcessMode ?? ImportPostProcessMode.PreserveStructure);
    const state = React.useMemo(() => ({
        jsonYes,
        setJsonYes,
        jsonFileName,
        setJsonFileName,
        jsonData,
        setJsonData,
        jsonImportMode,
        setJsonImportMode,
        bookmarksYes,
        setBookmarksYes,
        tabsYes,
        setTabsYes,
        tabScope,
        setTabScope,
        postProcessMode,
        setPostProcessMode,
    }), [
        jsonYes,
        jsonFileName,
        jsonData,
        jsonImportMode,
        bookmarksYes,
        tabsYes,
        tabScope,
        postProcessMode,
    ]);
    const selection = React.useMemo(() => ({
        jsonFileName: jsonYes ? jsonFileName : null,
        jsonData: jsonYes ? jsonData : null,
        jsonImportMode: jsonYes ? jsonImportMode : undefined,
        importBookmarks: bookmarksYes,
        tabScope: tabsYes ? tabScope : undefined,
        importPostProcessMode: postProcessMode,
    }), [jsonYes, jsonFileName, jsonData, jsonImportMode, bookmarksYes, tabsYes, tabScope, postProcessMode]);
    const reset = React.useCallback(() => {
        setJsonYes(false);
        setJsonFileName(null);
        setJsonData(null);
        setJsonImportMode(JsonImportMode.Add);
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
