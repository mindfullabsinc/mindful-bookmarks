// src/pages/NewTabGate.tsx
import React from "react";
import type { ReactElement } from 'react';

import { Amplify, type ResourcesConfig } from 'aws-amplify';
import config from "../../amplify_outputs.json";
Amplify.configure(config as ResourcesConfig);

import { ThemeProvider, Authenticator, useAuthenticator } from "@aws-amplify/ui-react";

import { AppContextProvider } from "@/scripts/AppContextProvider";
import { AuthMode, StorageMode } from "@/scripts/Constants";
import { NewTabPage } from "@/pages/NewTabPage";

import "@/styles/Index.css";
import "@/styles/NewTab.css";
import "@/styles/amplify-auth-tailwind.css";

import { amplifyTheme } from "@/theme/amplifyTheme";
import formFields from "@/config/formFields";
import SignUpFormFields from "@/components/auth/SignUpFormFields";
import LogoComponent from "@/components/LogoComponent";

/* -------------------- Local types and interfaces -------------------- */
type AuthModeType = (typeof AuthMode)[keyof typeof AuthMode];
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Remove any `auth=` hash fragment from the current URL without triggering navigation.
 *
 * @returns {void}
 */
function stripAuthHash(): void {
  try {
    if ((window.location.hash || "").includes("auth=")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
    /* no-op */
  }
}

/**
 * Bridge Amplify Authenticator state into the Mindful new-tab experience.
 *
 * @returns {ReactElement}
 */
function AuthAdapter() {
  const { user, signOut, toSignIn } = useAuthenticator((ctx) => [
    ctx.user,
    ctx.authStatus,
  ]);

  return (
    <AppContextProvider user={user as any}>
      <NewTabPage user={user as any} signIn={toSignIn} signOut={signOut} />
    </AppContextProvider>
  );
}
/* ---------------------------------------------------------- */


/**
 * Entry point for the new-tab surface, choosing between anonymous and authenticated flows based
 * on stored preference and current URL hash.
 *
 * @returns {ReactElement | null}
 */
export default function NewTabGate(): ReactElement | null {
  const [authMode, setAuthMode] = React.useState<AuthModeType | null>(null); // 'anonymous' | 'authenticated'
  const [ready, setReady] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // chrome.* may be unavailable in some environments (tests, SSR)
        let mindful_auth_mode: AuthModeType | undefined;

        if (typeof chrome !== "undefined" && chrome?.storage?.local?.get) {
          const result = (await chrome.storage.local.get("mindful_auth_mode")) as {
            mindful_auth_mode?: AuthModeType;
          };
          mindful_auth_mode = result?.mindful_auth_mode;
        }

        const resolved: AuthModeType =
          mindful_auth_mode === AuthMode.AUTH ? AuthMode.AUTH : AuthMode.ANON;

        if (!cancelled) setAuthMode(resolved);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  const hasAuthHash = (window.location.hash || "").includes("auth=");

  return (
    <Authenticator.Provider>
      <ThemeProvider theme={amplifyTheme} colorMode="system">
        <div className="newtab-root mindful-auth">
          {authMode === AuthMode.ANON ? (
            // —— ANON MODE: never mount <Authenticator>, force local ——
            (stripAuthHash(),
            (
              <AppContextProvider user={null} preferredStorageMode={StorageMode.LOCAL}>
                <NewTabPage />
              </AppContextProvider>
            ))
          ) : hasAuthHash ? (
            // —— AUTH MODE with #auth=... → show inline auth ——
            <Authenticator
              hideSignUp={false}
              components={{ Header: LogoComponent, SignUp: { FormFields: SignUpFormFields } }}
              // If your project has stricter types for 'formFields', adjust the import or cast.
              formFields={formFields as any}
            >
              {() => <AuthAdapter />}
            </Authenticator>
          ) : (
            // —— AUTH MODE without hash → render grid; AppContext resolves remote/local based on auth ——
            <AppContextProvider user={undefined}>
              <NewTabPage />
            </AppContextProvider>
          )}
        </div>
      </ThemeProvider>
    </Authenticator.Provider>
  );
}
