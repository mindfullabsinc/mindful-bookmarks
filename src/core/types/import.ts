import { ImportSource, OpenTabsScope, ImportPostProcessMode } from "../constants/import";


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

export type ManualImportSelectionType = {
  jsonFileName?: string | null;
  jsonData?: string | null;
  importBookmarks?: boolean;
  tabScope?: OpenTabsScopeType; 
  importPostProcessMode?: ImportPostProcessModeType;
};