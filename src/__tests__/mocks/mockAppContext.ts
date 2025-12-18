import { AuthMode, LOCAL_USER_ID } from "@/core/constants/authMode";
import { StorageMode } from "@/core/constants/storageMode";
import { DEFAULT_LOCAL_WORKSPACE_ID } from "@/core/constants/workspaces";
import { ThemeChoice } from "@/core/constants/theme";
import { OnboardingStatus } from "@/scripts/AppContextProvider";
import type { AppContextValue } from "@/scripts/AppContextProvider";

export function makeAppContext(
  overrides: Partial<AppContextValue> = {}
): AppContextValue {
  const base: AppContextValue = {
    /* Workspaces */
    workspaces: {},
    activeWorkspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    setActiveWorkspaceId: async () => {},
    workspacesVersion: 0,
    bumpWorkspacesVersion: () => {},

    /* Bookmarks */
    groupsIndex: [],
    bookmarkGroups: [],
    setBookmarkGroups: () => {},

    /* Auth / storage */
    userId: LOCAL_USER_ID,
    storageMode: StorageMode.LOCAL,
    setStorageMode: async () => {},
    isSignedIn: false,
    authMode: AuthMode.ANON,

    /* Loading + migration */
    isLoading: false,
    isMigrating: false,
    setIsMigrating: () => {},

    /* User attributes */
    userAttributes: null,
    setUserAttributes: () => {},

    /* Hydration flags */
    hasHydrated: true,
    isHydratingRemote: false,

    /* Onboarding */
    onboardingReopen: false,
    openOnboarding: () => {},
    closeOnboarding: () => {},
    onboardingStatus: OnboardingStatus.NOT_STARTED,
    shouldShowOnboarding: false,
    completeOnboarding: async () => {},
    skipOnboarding: async () => {},
    restartOnboarding: async () => {},
    onboardingPurposes: [],
    setOnboardingPurposes: () => {},

    /* Theme */
    theme: ThemeChoice.SYSTEM,
    setThemePreference: async () => {},
  };

  return { ...base, ...overrides };
}