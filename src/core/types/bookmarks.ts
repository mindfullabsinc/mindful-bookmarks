// src/types/bookmarks.ts
export type BookmarkType = {
  id: string;                   
  name?: string;
  url: string;
  faviconUrl?: string;
  dateAdded?: number;
  [k: string]: any;
};

export type BookmarkGroupType = {
  id: string;                   // required
  groupName: string;
  bookmarks: BookmarkType[];        // always an array (never undefined)
  description?: string;
  [k: string]: any;
};