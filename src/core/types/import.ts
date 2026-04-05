import { ImportSource, OpenTabsScope, ImportPostProcessMode, JsonImportMode } from "../constants/import";


export type ChromeBmNode = chrome.bookmarks.BookmarkTreeNode;
export type ImportSourceType = 
  (typeof ImportSource)[keyof typeof ImportSource];   

export type ImportResultType = {
  source: ImportSourceType; 
  totalImported: number;
  groupsCreated?: number;
};

export type OpenTabsScopeType = 
  (typeof OpenTabsScope)[keyof typeof OpenTabsScope];

export type OpenTabsOptionsType = {
  scope?: OpenTabsScopeType;
};

export type ImportPostProcessModeType =
  (typeof ImportPostProcessMode)[keyof typeof ImportPostProcessMode]

export type JsonImportModeType =
  (typeof JsonImportMode)[keyof typeof JsonImportMode];

export type ManualImportSelectionType = {
  jsonFileName?: string | null;
  jsonData?: string | null;
  jsonImportMode?: JsonImportModeType;
  importBookmarks?: boolean;
  chromeImportMode?: JsonImportModeType;
  tabScope?: OpenTabsScopeType;
  tabsImportMode?: JsonImportModeType;
  importPostProcessMode?: ImportPostProcessModeType;
};