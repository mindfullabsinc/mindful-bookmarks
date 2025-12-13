import { ImportSource, OpenTabsScope, BookmarkGroupingMode } from "../constants/import";


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

export type BookmarkGroupingModeType =
  (typeof BookmarkGroupingMode)[keyof typeof BookmarkGroupingMode];

export type ManualImportSelectionType = {
  jsonFile?: File | null;
  importBookmarks?: boolean;
  bookmarkGroupingMode?: BookmarkGroupingModeType;
  tabScope?: OpenTabsScopeType; 
};