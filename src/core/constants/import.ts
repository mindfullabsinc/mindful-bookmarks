export const ImportSource = {
  Bookmarks: "bookmarks",
  Tabs: "tabs",
  Json: "json",
  History: "history",
} as const;

export const OpenTabsScope = {
  Current: "current",
  All: "all",
} as const;

export const ImportPostProcessMode = {
  PreserveStructure: "preserveStructure",
  SemanticGrouping: "semanticGrouping",
} as const;