// src/pages/NewTabGate.jsx
import React from "react";
import { Amplify } from "aws-amplify";
import config from "/amplify_outputs.json";
Amplify.configure({ ...config, ssr: false });

import { ThemeProvider, Authenticator } from "@aws-amplify/ui-react";

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

function stripAuthHash() {
  try {
    if ((window.location.hash || "").includes("auth=")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {}
}

export default function NewTabGate() {
  const [mode, setMode] = React.useState(null); // 'anon' | 'auth'
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { mindful_auth_mode } =
          (await chrome?.storage?.local?.get?.("mindful_auth_mode")) ?? {};
        const resolved =
          mindful_auth_mode === AuthMode.AUTH ? AuthMode.AUTH : AuthMode.ANON;
        if (!cancelled) setMode(resolved);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <Authenticator.Provider>
      <ThemeProvider theme={amplifyTheme} colorMode="system">
        <div className="newtab-root mindful-auth">
          {mode === AuthMode.ANON ? (
            // —— ANON MODE: never mount <Authenticator>, force local ——
            (stripAuthHash(), // nuke stale #auth=...
            (
              <AppContextProvider user={null} preferredStorageMode={StorageMode.LOCAL}>
                <NewTabPage />
              </AppContextProvider>
            ))
          ) : (
            // —— AUTH MODE ——
            (window.location.hash || "").includes("auth=") ? (
              // show inline auth only when hash requests it
              <Authenticator
                hideSignUp={false}
                components={{ Header: LogoComponent, SignUp: { FormFields: SignUpFormFields } }}
                formFields={formFields}
              >
                {({ signIn, signOut, user }) => (
                  <AppContextProvider user={user}>
                    <NewTabPage user={user} signIn={signIn} signOut={signOut} />
                  </AppContextProvider>
                )}
              </Authenticator>
            ) : (
              // no auth hash → render grid; AppContext will resolve remote/local based on auth
              <AppContextProvider user={undefined}>
                <NewTabPage />
              </AppContextProvider>
            )
          )}
        </div>
      </ThemeProvider>
    </Authenticator.Provider>
  );
}
