import { secret } from '@aws-amplify/backend';
import { defineFunction } from '@aws-amplify/backend-function';
import { RUNTIME, MEMORY_MB, TIMEOUT_SECONDS, BOOKMARKS_FILE_NAME, KEY_FILE_NAME } from "../_shared/constants";

/**
 * Lambda definition that encrypts and writes bookmark payloads into S3.
 */
export const saveBookmarks = defineFunction({
  name: 'saveBookmarksFunc',
  entry: './handler.ts',
  resourceGroupName: 'storage',
  environment: {
    // Pulled securely at runtime
    ALLOWED_EXTENSION_IDS: secret('ALLOWED_EXTENSION_IDS'),
    ALLOWED_ORIGIN: secret('ALLOWED_ORIGIN'),  // Keep this legacy value of single allowed Chrome extension ID
    // These are non-secret, fine to keep as plain envs
    BOOKMARKS_FILE_NAME: BOOKMARKS_FILE_NAME,
    KEY_FILE_NAME: KEY_FILE_NAME,
  },
  runtime: RUNTIME,
  memoryMB: MEMORY_MB,
  timeoutSeconds: TIMEOUT_SECONDS,
});
