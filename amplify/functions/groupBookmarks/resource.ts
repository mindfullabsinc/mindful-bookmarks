// amplify/functions/group-bookmarks/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const groupBookmarksFn = defineFunction({
  name: "groupBookmarksFunc",
  entry: "./handler.ts",
  environment: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
