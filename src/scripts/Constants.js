/* Constants */
export const CHROME_NEW_TAB = "chrome://newtab/";
export const URL_PATTERN = "^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$";
export const EMPTY_GROUP_IDENTIFIER = "EMPTY_GROUP_IDENTIFIER";
export const STORAGE_TYPE_CUSTOM_ATTRIBUTE = "custom:storage_type";
export const ONBOARDING_NEW_GROUP_PREFILL = "My first bookmarks group";
export const ONBOARDING_BOOKMARK_NAME_PREFILL = "Google";
export const ONBOARDING_BOOKMARK_URL_PREFILL = "https://www.google.com";

/* Enum for storage types */
export const StorageType = {
  LOCAL: 'local',
  REMOTE: 'remote',
};
export const DEFAULT_STORAGE_TYPE = StorageType.LOCAL;
export const StorageLabel = {
  [StorageType.LOCAL]: 'Local-Only',
  [StorageType.REMOTE]: 'Encrypted Sync',
};

/* Enum for authentication mode */
export const AuthMode = {
  ANON: 'anonymous',
  AUTH: 'authenticated',
}
/** Stable sentinel used for anonymous/local mode keys & caches */
export const LOCAL_USER_ID = 'local';
export const AMPLIFY_HUB_AUTH_CHANNEL = 'auth';