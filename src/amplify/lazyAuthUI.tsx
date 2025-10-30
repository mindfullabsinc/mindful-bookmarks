import React from "react";

// Only loaded when REMOTE. Keeps Local-only bundles slim.
export async function loadAuthUI() {
  const ui = await import("@aws-amplify/ui-react");
  return {
    Authenticator: ui.Authenticator,
    ThemeProvider: ui.ThemeProvider,
    useAuthenticator: ui.useAuthenticator,
  };
}