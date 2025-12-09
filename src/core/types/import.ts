export type ImportResult = {
  source: "json" | "bookmarks" | "tabs";
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