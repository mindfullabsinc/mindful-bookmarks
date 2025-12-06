import { defineFunction, secret } from "@aws-amplify/backend";

export const groupBookmarks = defineFunction({
  name: "groupBookmarksFunc",
  entry: "./handler.ts",
  timeoutSeconds: 15,        
  memoryMB: 512,             
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    ALLOWED_EXTENSION: secret("ALLOWED_EXTENSION"),
    ALLOWED_ORIGIN: secret("ALLOWED_ORIGIN"),
  },
});
