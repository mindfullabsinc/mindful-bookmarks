// ManageAccountPage.tsx
import React, { useContext } from "react";

/* Authentication */
import { useAuthenticator } from "@aws-amplify/ui-react";

/* Components */
import TopBanner from "@/components/TopBanner";
import ManageAccountComponent from "@/components/ManageAccountComponent";

/* Scripts */
import { useBookmarkManager } from "@/hooks/useBookmarkManager";
import { AppContext } from "@/scripts/AppContextProvider";

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";

export default function ManageAccountPage() {
  const { userAttributes } = useContext(AppContext);
  const { user, signOut, toSignIn /* other: route, toSignUp, etc. */ } = useAuthenticator();
  const { exportBookmarksToJSON, changeStorageMode } = useBookmarkManager();

  return (
    <AnalyticsProvider>
      <>
        <TopBanner
          onExportBookmarks={exportBookmarksToJSON}
          userAttributes={userAttributes ?? {}}
          // Navigate to the sign-in screen inside the Authenticator
          onSignIn={toSignIn}
          // Actually sign the user out
          onSignOut={signOut}
          isSignedIn={!!user}
          onStorageModeChange={changeStorageMode}
        />
        <ManageAccountComponent
          key={user?.userId || user?.username || "anon"}
          user={user}
          // If the component expects signIn/signOut props, pass the correct ones:
          signIn={toSignIn}    // navigation to the sign-in view
          signOut={signOut}    // real sign-out action
        />
      </>
    </AnalyticsProvider>
  );
}
