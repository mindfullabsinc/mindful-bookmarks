/**
 * Default Lambda runtime version used across Amplify functions.
 */
export const RUNTIME = 20; 
/**
 * Memory size allocated to Lambda functions (in MB).
 */
export const MEMORY_MB: number = 1024;
/**
 * Execution timeout applied to Lambda functions (seconds).
 */
export const TIMEOUT_SECONDS: number = 10;
/**
 * Encrypted bookmark payload file stored alongside user data.
 */
export const BOOKMARKS_FILE_NAME = 'bookmarks.json.encrypted'
/**
 * Symmetric encryption key file stored per user in S3.
 */
export const KEY_FILE_NAME = 'bookmarks.key'
