export const AuthMode = {
  ANON: 'anonymous',
  AUTH: 'authenticated',
} as const;
export type AuthModeType = typeof AuthMode[keyof typeof AuthMode];

/** Stable sentinel used for anonymous/local mode keys & caches */
export const LOCAL_USER_ID = 'local' as const;

export const AMPLIFY_HUB_AUTH_CHANNEL = 'auth' as const;