/* --------------------Constants -------------------- */
export const CHROME_NEW_TAB = "chrome://newtab/" as const;
export const URL_PATTERN = "^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$" as const;
export const EMPTY_GROUP_IDENTIFIER = "EMPTY_GROUP_IDENTIFIER" as const;
export const STORAGE_TYPE_CUSTOM_ATTRIBUTE = "custom:storage_type" as const;
export const ONBOARDING_NEW_GROUP_PREFILL = "My first bookmarks group" as const;
export const ONBOARDING_BOOKMARK_NAME_PREFILL = "Google" as const;
export const ONBOARDING_BOOKMARK_URL_PREFILL = "https://www.google.com" as const;
/* ---------------------------------------------------------- */

/* -------------------- Storage Type -------------------- */
export const StorageMode = {
  LOCAL: 'local',
  REMOTE: 'remote',
} as const;
export type StorageModeType = typeof StorageMode[keyof typeof StorageMode];

export const DEFAULT_STORAGE_MODE = StorageMode.LOCAL;

/** Mapping from storage type → human label, type-checked to cover all cases */
export const StorageLabel: Record<StorageModeType, string> = {
  [StorageMode.LOCAL]: 'Local-Only',
  [StorageMode.REMOTE]: 'Encrypted Sync',
};
/* ---------------------------------------------------------- */

/* -------------------- Auth Mode -------------------- */
export const AuthMode = {
  ANON: 'anonymous',
  AUTH: 'authenticated',
} as const;
export type AuthMode = typeof AuthMode[keyof typeof AuthMode];

/** Stable sentinel used for anonymous/local mode keys & caches */
export const LOCAL_USER_ID = 'local' as const;

export const AMPLIFY_HUB_AUTH_CHANNEL = 'auth' as const;
/* ---------------------------------------------------------- */