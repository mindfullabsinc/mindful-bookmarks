import { secret } from '@aws-amplify/backend';
import { defineFunction } from '@aws-amplify/backend-function';
import { RUNTIME, MEMORY_MB, TIMEOUT_SECONDS, BOOKMARKS_FILE_NAME, KEY_FILE_NAME } from "../_shared/constants";

/**
 * Lambda definition responsible for reading encrypted bookmarks from S3.
 */
export const loadBookmarks = defineFunction({
  name: 'loadBookmarksFunc',
  entry: './handler.ts',
  resourceGroupName: 'storage',
  environment: {
    ALLOWED_EXTENSION_IDS: secret('ALLOWED_EXTENSION_IDS'),
    ALLOWED_ORIGIN: secret('ALLOWED_ORIGIN'),
    BOOKMARKS_FILE_NAME: BOOKMARKS_FILE_NAME,
    KEY_FILE_NAME: KEY_FILE_NAME,
  },
  runtime: RUNTIME,
  memoryMB: MEMORY_MB,
  timeoutSeconds: TIMEOUT_SECONDS,
});
