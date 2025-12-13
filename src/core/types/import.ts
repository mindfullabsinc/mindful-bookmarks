export type ImportSource = "bookmarks" | "tabs" | "json";

export type ImportResult = {
  source: ImportSource; 
  totalImported: number;
  groupsCreated?: number;
};

export type ChromeImportMode = "flat" | "smart";
export type SmartStrategy = "folders" | "domain" | "topic";
export type ChromeImportOptions = {
  mode: ChromeImportMode;
  smartStrategy?: SmartStrategy;
};

export type OpenTabsScope = "current" | "all";
export type OpenTabsOptions = {
  scope?: OpenTabsScope;
};

export type ImportChromeOpts = { mode: 'flat' | 'smart'; smartStrategy?: SmartStrategy };

export type ManualImportSelection = {
  jsonFile?: File | null;
  importBookmarks?: boolean;
  tabScope?: "current" | "all";
};