// src/types/bookmarks.ts
export type BookmarkType = {
  id: string;                   // required
  name?: string;
  url?: string;
  [k: string]: any;
};

export type BookmarkGroupType = {
  id: string;                   // required
  groupName: string;
  bookmarks: BookmarkType[];        // always an array (never undefined)
  [k: string]: any;
};