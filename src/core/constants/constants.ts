/* --------------------Constants -------------------- */
export const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/mindful/bjobloafhnodgomnplkfhebkihnafhfe";
export const CHROME_NEW_TAB = "chrome://newtab/" as const;
export const URL_PATTERN = "^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$" as const;
export const EMPTY_GROUP_IDENTIFIER = "EMPTY_GROUP_IDENTIFIER" as const;
export const STORAGE_TYPE_CUSTOM_ATTRIBUTE = "custom:storage_type" as const;
export const ONBOARDING_NEW_GROUP_PREFILL = "My first bookmarks group" as const;
export const ONBOARDING_BOOKMARK_NAME_PREFILL = "Google" as const;
export const ONBOARDING_BOOKMARK_URL_PREFILL = "https://www.google.com" as const;
/* ---------------------------------------------------------- */