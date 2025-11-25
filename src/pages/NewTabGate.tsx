import React, { Suspense, useState, useEffect } from "react";
import type { ReactElement } from "react";

/* Authentication and storage mode */
import { guessBootAuthMode } from "@/scripts/bootAuthMode";
import { StorageMode } from "@/core/constants/storageMode";
import { AuthMode, AuthModeType } from "@/core/constants/authMode";

/* App context */
import { AppContextProvider } from "@/scripts/AppContextProvider";

/* Pages */
import { NewTabPage } from "@/pages/NewTabPage";

/* Components */ 
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";

/* CSS styling */
import "@/styles/Index.css";
import "@/styles/NewTab.css";

/* -------------------- Boot probe (sync, no Amplify) -------------------- */
const bootAuth = guessBootAuthMode();
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
/* ---------------------------------------------------------- */

/**
 * Dynamically import Amplify UI pieces and prepare the authenticated shell components.
 *
 * @returns Promise resolving to the inline and context-only auth renderers.
 */
async function loadAuthShell() {
  const [{ ensureAmplifyConfigured }] = await Promise.all([
    import("@/amplify/ensureAmplify"),
  ]);
  await ensureAmplifyConfigured();

  const ui = await import("@aws-amplify/ui-react");
  const { ThemeProvider, Authenticator, useAuthenticator } = ui;

  /**
   * Resolve a usable export from a dynamically imported module, favouring `default`.
   *
   * @param mod Module namespace loaded via dynamic import.
   * @param named Ordered list of property names to try when no default export exists.
   * @returns Selected export value.
   */
  function pickDefault<T extends Record<string, any>>(mod: T, ...named: string[]) {
    if ('default' in mod && mod.default) return mod.default;
    for (const k of named) if (mod[k]) return mod[k];
    return mod; // last resort: the module itself
  }

  const [themeMod, fieldsMod, signUpMod, logoMod] = await Promise.all([
    import("@/theme/amplifyTheme"),
    import("@/config/formFields"),
    import("@/components/auth/SignUpFormFields"),
    import("@/components/LogoComponent"),
  ]);

  const amplifyTheme      = pickDefault(themeMod,  "amplifyTheme", "theme");
  const formFields        = pickDefault(fieldsMod, "formFields");
  const SignUpFormFields  = pickDefault(signUpMod, "SignUpFormFields");
  const LogoComponent     = pickDefault(logoMod,   "LogoComponent");

  /**
   * Bridge the Amplify Authenticator user/session into the Mindful new-tab context.
   *
   * @returns React element that wraps the new-tab page with AppContext.
   */
  function AuthAdapter(): ReactElement {
    const { user, signOut, toSignIn } = useAuthenticator((ctx) => [ctx.user, ctx.authStatus]);
    return (
      <AppContextProvider user={user as any}>
        <NewTabPage user={user as any} signIn={toSignIn} signOut={signOut} />
      </AppContextProvider>
    );
  }

  /**
   * Render the full inline authentication shell when the route explicitly requests auth.
   *
   * @returns React element containing the Amplify Authenticator UI.
   */
  function AuthInline(): ReactElement {
    return (
      <ThemeProvider theme={amplifyTheme} colorMode="system">
        <div className="newtab-root mindful-auth">
          <Authenticator
            hideSignUp={false}
            components={{ Header: LogoComponent, SignUp: { FormFields: SignUpFormFields as any } }}
            formFields={formFields as any}
          >
            {() => <AuthAdapter />}
          </Authenticator>
        </div>
      </ThemeProvider>
    );
  }

  /**
   * Render the authenticated new-tab view without inline Amplify UI (context only).
   *
   * @returns React element containing the AppContext-wrapped new-tab page.
   */
  function AuthContext(): ReactElement {
    return (
      <ThemeProvider theme={amplifyTheme} colorMode="system">
        <Authenticator.Provider>
          <div className="newtab-root mindful-auth">
            <AppContextProvider user={undefined}>
              <NewTabPage />
            </AppContextProvider>
          </div>
        </Authenticator.Provider>
      </ThemeProvider>
    );
  }

  return { AuthInline, AuthContext };
}

// 2) Make each export its own lazy component
const AuthInline = React.lazy(async () => {
  const m = await loadAuthShell();
  return { default: m.AuthInline };
});

const AuthContext = React.lazy(async () => {
  const m = await loadAuthShell();
  return { default: m.AuthContext };
});

/**
 * Entry point for the new-tab surface, choosing between anonymous and authenticated flows based
 * on stored preference and current URL hash.
 *
 * @returns {ReactElement | null}
 */
export default function NewTabGate(): ReactElement | null {
  // We freeze boot decision for the very first paint; AppContext can refine later.
  const [authMode, setAuthMode] = useState<AuthModeType | null>(null); // 'anon' | 'auth'
  const [ready, setReady] = useState<boolean>(false);

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // chrome.* may be unavailable in some environments (tests, SSR)
        let mindful_auth_mode: AuthModeType | undefined;

        try {
          if (typeof chrome !== "undefined" && chrome?.storage?.local?.get) {
            const result = (await chrome.storage.local.get("mindful_auth_mode")) as {
              mindful_auth_mode?: AuthModeType;
            };
            mindful_auth_mode = result?.mindful_auth_mode;
          }
        } catch {
          /* ignore */
        }

        const initial: AuthModeType =
          mindful_auth_mode === AuthMode.AUTH
            ? AuthMode.AUTH
            : (bootAuth as AuthModeType) || AuthMode.ANON;

        if (!cancelled) setAuthMode(initial);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component logic -------------------- */
  if (!ready) return null;

  const hasAuthHash = (window.location.hash || "").includes("auth=");

  // —— ANON MODE: never import or mount Amplify/UI ——
  if (authMode === AuthMode.ANON) {
    stripAuthHash();
    return (
      <div className="newtab-root mindful-auth">
        <AppContextProvider user={null} preferredStorageMode={StorageMode.LOCAL}>
          <NewTabPage />

          {/* Onboarding overlay sits on top of everything */}
          <OnboardingOverlay />
        </AppContextProvider>
      </div>
    );
  }

  // —— AUTH MODE: lazy-load the auth shell only now ——
  return (
    <Suspense fallback={<div>Loading…</div>}>
      {/* hasAuthHash → inline auth UI; else → context only */}
      {hasAuthHash ? <AuthInline /> : <AuthContext />}
    </Suspense>
  );
  /* ---------------------------------------------------------- */
}
