import React, { useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import config from '/amplify_outputs.json';
Amplify.configure({ ...config, ssr: false });

// Import Hub from the correct package for Amplify v6+
import { Hub } from 'aws-amplify/utils';
import { Authenticator, ThemeProvider, useAuthenticator } from '@aws-amplify/ui-react';

/* Scripts */
import { AppContextProvider } from '@/scripts/AppContextProvider';
import { AuthMode, AMPLIFY_HUB_AUTH_CHANNEL } from '@/scripts/Constants';

/* Components */
import PopUpComponent from '@/components/PopUpComponent';
import LogoComponent from '@/components/LogoComponent';
import PopupAutosize from "@/components/PopupAutosize";

/* CSS styling */
import '@aws-amplify/ui-react/styles.css';
import '@/styles/amplify-auth-tailwind.css';
import { amplifyTheme } from '@/theme/amplifyTheme';
import formFields from "@/config/formFields"

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";

async function openAuthTab(route = 'signUp', extras = {}) {
  const url = chrome.runtime.getURL(`newtab.html#auth=${route}`);
  chrome.tabs.create({ url }, () => {
    const err = chrome.runtime.lastError;
    if (err) console.warn('[openAuthTab] tabs.create error:', err);
    window.close();
  });
}

// Helper that nudges the Authenticator to the Sign In view
function KickToSignIn() {
  const { route, toSignIn } = useAuthenticator((ctx) => [ctx.route]);
  React.useEffect(() => {
    // If it isn't already on signIn, push it there on mount
    if (route !== 'signIn') toSignIn();
  }, [route, toSignIn]);
  return null;
}

function reloadActiveTabIfNewTab() {
  try {
    const extNtp = chrome.runtime.getURL('newtab.html');
    if (chrome.tabs?.query && chrome.tabs?.reload) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs = []) => {
        const tab = tabs?.[0];
        if (!tab?.id) return;

        const url = tab.url || '';
        const pending = tab.pendingUrl || '';

        // Chrome overrides show up as chrome://newtab/ (omnibox blank)
        // Also allow direct loads of the extension page
        const isOurNtp =
          url === 'chrome://newtab/' ||
          pending === 'chrome://newtab/' ||
          url.startsWith(extNtp);

        if (isOurNtp) chrome.tabs.reload(tab.id);
      });
    }
  } catch {}
}

function refreshNewTabPagesBestEffort() {
  // 1) Active tab (guarded to only reload if it's the New Tab)
  reloadActiveTabIfNewTab();

  // 2) Any open extension "tab" views that are the new tab page 
  try {
    const newTabUrl = chrome.runtime.getURL('newtab.html');
    const views = (chrome.extension?.getViews?.({ type: 'tab' }) || []);
    for (const v of views) {
      try { if (v?.location?.href?.startsWith?.(newTabUrl)) v.location.reload(); } catch {}
    }
  } catch {}
}

// --- Broadcast utility (used only on real sign-in/out edges) ---
function broadcastAuthEdge(type /* 'USER_SIGNED_IN' | 'USER_SIGNED_OUT' */) {
  const at = Date.now();
  try { chrome.storage?.local?.set({ authSignalAt: at, authSignal: type === 'USER_SIGNED_IN' ? 'signedIn' : 'signedOut' }); } catch {}
  try { chrome.runtime.sendMessage({ type, at }, () => { chrome.runtime.lastError; }); } catch {}
}

/* ---------- Persist the popup auth mode ---------- */
function usePopupMode() {
  const [mode, setMode] = React.useState(AuthMode.ANON);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { mindful_auth_mode } = await chrome.storage?.local?.get?.('mindful_auth_mode') ?? {};
        if (!cancelled && (mindful_auth_mode === AuthMode.ANON || mindful_auth_mode === AuthMode.AUTH)) {
          setMode(mindful_auth_mode);
        }
      } catch {}
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; }
  }, []);

  const save = React.useCallback(async (next) => {
    setMode(next);
    try { await chrome.storage?.local?.set?.({ mindful_auth_mode: next }); } catch {}
  }, []);

  return { mode, setMode: save, ready };
}

/* ---------- UI: small toggle header ---------- */
function ModeSwitcher({ mode, onSwitch }) {
  console.log("In ModeSwitcher. mode: ", mode, " onSwitch: ", onSwitch);
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-sm opacity-80">
        {mode === AuthMode.ANON ? 'Local mode (no account)' : 'Sync enabled (signed in)'}
      </div>
      <div className="flex gap-2">
        {mode === AuthMode.ANON ? (
          <button
            type="button"
            className="amplify-button--link"
            onClick={() => onSwitch(AuthMode.AUTH)}
            aria-label="Enable sync by signing in"
          >
            Sign in to sync
          </button>
        ) : (
          <button
            type="button"
            className="amplify-button--link"
            onClick={() => onSwitch(AuthMode.ANON)}
            aria-label="Use without account"
          >
            Use without account
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Watch Amplify route to auto-handoff verify in new tab ---------- */
function PopupRouteWatcher() {
  const { route } = useAuthenticator((ctx) => [ctx.route]);
  React.useEffect(() => {
    const isVerify =
      route === 'confirmSignUp' || route === 'verifyUser' || route === 'confirmVerifyUser';
    if (isVerify) openAuthTab('confirmSignUp');
  }, [route]);
  return null;
}

/* ---------- Gate: anon vs auth ---------- */
function AuthGate({ mode, onWantAuth }) {
  // ANON: No Authenticator at all. App runs local-only with user=null.
  if (mode === AuthMode.ANON) {
    console.log("Authentication mode is ANON, setting preferredStorageType to local");
    return (
      <>
        <AppContextProvider user={null} preferredStorageType="local">
          <PopUpComponent />
        </AppContextProvider>
      </>
    );
  } 

  // AUTH: Render Authenticator and pass user into AppContextProvider.
  // AUTH branch
  return (
    <Authenticator
      className="!p-0"
      hideSignUp={true}
      formFields={formFields}
      components={{
        SignIn: {
          Footer: () => (
            <div className="mt-3 text-center">
              <button type="button" className="amplify-button--link" onClick={() => openAuthTab('signUp')}>
                Create account
              </button>
            </div>
          )
        }
      }}
    >
      {({ user }) => (
        <>
          {/* Ensure we’re on the sign-in panel the moment this mounts */}
          <KickToSignIn />

          <AppContextProvider user={user}>
            {!user && (
              <div className="mt-3">
                <button
                  className="amplify-button--link"
                  onClick={() => openAuthTab('signUp')}
                  type="button"
                >
                  Create account (opens full page)
                </button>
              </div>
            )}
            <PopUpComponent />
            <PopupRouteWatcher />
          </AppContextProvider>
        </>
      )}
    </Authenticator>
  ); 
}

export default function PopupPage() {
  const { mode, setMode, ready } = usePopupMode();

  // Listen for real sign-in/out edges to refresh new-tab & broadcast
  useEffect(() => {
    // Amplify v6 Hub uses the literal 'auth' channel, so need to use the string literal
    const unsub = Hub.listen(AMPLIFY_HUB_AUTH_CHANNEL, ({ payload }) => {
      // Common events: 'signedIn', 'signedOut', 'tokenRefresh', etc.
      if (payload?.event === 'signedIn') {
        broadcastAuthEdge('USER_SIGNED_IN');
        refreshNewTabPagesBestEffort();
        // stay in AuthMode.AUTH mode
      } else if (payload?.event === 'signedOut') {
        broadcastAuthEdge('USER_SIGNED_OUT');
        refreshNewTabPagesBestEffort();
        // optionally fall back to anon on sign out:
        setMode(AuthMode.ANON);
      }
    });
    return () => unsub();
  }, [setMode]);

  if (!ready) return null; // tiny guard to avoid flicker

  return (
    <Authenticator.Provider>
      <AnalyticsProvider>
        <ThemeProvider theme={amplifyTheme} colorMode="system">
          <div className="popup-root mindful-auth p-4">
            <PopupAutosize selector=".popup-root" maxH={600} />
            <LogoComponent />
            <ModeSwitcher mode={mode} onSwitch={(next) => {
              console.log("next: ", next);
              if (next === AuthMode.AUTH) {
                // switching to auth: show sign-in inside popup first
                setMode(AuthMode.AUTH);
              } else {
                // switching to anon: clear to local-only
                setMode(AuthMode.ANON);
              }
            }} />
            <AuthGate mode={mode} onWantAuth={() => setMode(AuthMode.AUTH)} /> 
          </div>
        </ThemeProvider>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
}
