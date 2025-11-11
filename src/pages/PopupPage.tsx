import React, { useEffect } from 'react';
import type { ReactElement } from 'react';

// Scripts
import { AppContextProvider } from '@/scripts/AppContextProvider';
import { AuthMode, AuthModeType, AMPLIFY_HUB_AUTH_CHANNEL } from '@/core/constants/authMode';

// Components
import PopUpComponent from '@/components/PopUpComponent';
import PopupAutosize from "@/components/PopupAutosize";

// CSS styling
import '@/styles/amplify-auth-tailwind.css';

/* ----------------------- Utilities ----------------------- */
/**
 * Open the full new-tab authentication experience and close the popup window.
 */
async function openAuthTab(
  route: 'signUp' | 'signIn' | 'confirmSignUp' = 'signUp',
  extras: Record<string, unknown> = {}
) {
  const url = chrome.runtime.getURL(`newtab.html#auth=${route}`);
  chrome.tabs.create({ url }, () => {
    const err = chrome.runtime.lastError;
    if (err) console.warn('[openAuthTab] tabs.create error:', err);
    window.close();
  });
}

/**
 * Open the full Mindful app in a new tab.
 */
function openMindfulTab() {
  const url = chrome.runtime.getURL('newtab.html');
  chrome.tabs.create({ url }, () => {
    const err = chrome.runtime.lastError;
    if (err) console.warn('[openMindfulTab] tabs.create error:', err);
    window.close();
  });
}

/**
 * Reload the currently active tab if it is showing the Mindful new-tab experience.
 */
function reloadActiveTabIfNewTab() {
  try {
    const extNtp = chrome.runtime.getURL('newtab.html');
    if (chrome.tabs?.query && chrome.tabs?.reload) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: chrome.tabs.Tab[] = []) => {
        const tab = tabs?.[0];
        if (!tab?.id) return;

        const url = (tab.url || '');
        const pending = (tab as any).pendingUrl || '';

        const isOurNtp =
          url === 'chrome://newtab/' ||
          pending === 'chrome://newtab/' ||
          url.startsWith(extNtp);

        if (isOurNtp) chrome.tabs.reload(tab.id);
      });
    }
  } catch {}
}

/**
 * Attempt to refresh all open instances of the Mindful new-tab view to pick up auth changes.
 */
function refreshNewTabPagesBestEffort() {
  reloadActiveTabIfNewTab();
  try {
    const newTabUrl = chrome.runtime.getURL('newtab.html');
    const views = (chrome.extension?.getViews?.({ type: 'tab' }) || []);
    for (const v of views) {
      try { if (v?.location?.href?.startsWith?.(newTabUrl)) v.location.reload(); } catch {}
    }
  } catch {}
}

/**
 * Broadcast an authentication edge event to other extension contexts via storage and runtime messaging.
 */
function broadcastAuthEdge(type: 'USER_SIGNED_IN' | 'USER_SIGNED_OUT') {
  const at = Date.now();
  try { chrome.storage?.local?.set({ authSignalAt: at, authSignal: type === 'USER_SIGNED_IN' ? 'signedIn' : 'signedOut' }); } catch {}
  try { chrome.runtime.sendMessage({ type, at }, () => { chrome.runtime.lastError; }); } catch {}
}

/**
 * Broadcast that the popup switched into anonymous/local mode without performing a sign-out.
 */
function broadcastLocalModeEdge() {
  const at = Date.now();
  try { chrome.storage?.local?.set({ mindful_auth_mode: AuthMode.ANON, modeSignalAt: at }); } catch {}
  try { chrome.runtime.sendMessage({ type: 'MODE_SWITCHED_TO_ANON', at }, () => { chrome.runtime.lastError; }); } catch {}
}
/* ---------------------------------------------------------- */

/* ----------------------- Mode state ----------------------- */
function usePopupMode(): { mode: AuthModeType; setMode: (next: AuthModeType) => Promise<void> | void; ready: boolean } {
  const [mode, setMode] = React.useState<AuthModeType>(AuthMode.ANON);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { mindful_auth_mode } =
          await (chrome.storage?.local?.get?.('mindful_auth_mode') ?? Promise.resolve({})) as { mindful_auth_mode?: AuthModeType };
        if (!cancelled && (mindful_auth_mode === AuthMode.ANON || mindful_auth_mode === AuthMode.AUTH)) {
          setMode(mindful_auth_mode);
        }
      } catch {}
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; }
  }, []);

  const save = React.useCallback(async (next: AuthModeType) => {
    setMode(next);
    try { await chrome.storage?.local?.set?.({ mindful_auth_mode: next }); } catch {}
  }, []);

  return { mode, setMode: save, ready };
}
/* ---------------------------------------------------------- */

/* ----------------------- Small UI helpers ----------------------- */
function ModeSwitcher({ mode, onSwitch }: { mode: AuthModeType; onSwitch: (next: AuthModeType) => void | Promise<void> }) {
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
/* ---------------------------------------------------------- */

/* ----------------------- LAZY AUTH CHUNK ----------------------- */
/**
 * We pack *all* Amplify/UI/Theme stuff behind a lazy boundary so ANON path is totally auth-free.
 */
type WithChildren = { children?: React.ReactNode };

const AuthInlinePopup = React.lazy(async () => {
  const [{ ensureAmplifyConfigured }] = await Promise.all([import("@/amplify/ensureAmplify")]);
  await ensureAmplifyConfigured();

  // Load Amplify UI + styles + theme + fields + components
  await import("@aws-amplify/ui-react/styles.css");
  const ui = await import("@aws-amplify/ui-react");
  const { ThemeProvider, Authenticator, useAuthenticator } = ui;

  const [
    themeMod,
    fieldsMod,
    logoMod,
  ] = await Promise.all([
    import("@/theme/amplifyTheme"),
    import("@/config/formFields"),
    import("@/components/LogoComponent"),
  ]);

  const amplifyTheme = (themeMod as any).default ?? (themeMod as any).amplifyTheme;
  const formFields    = (fieldsMod as any).default ?? (fieldsMod as any).formFields;
  const LogoComponent = (logoMod as any).default ?? (logoMod as any).LogoComponent;

  // Kick to sign-in route on mount
  function KickToSignIn(): null {
    const { route, toSignIn } = useAuthenticator((ctx) => [ctx.route]);
    React.useEffect(() => { if (route !== 'signIn') toSignIn(); }, [route, toSignIn]);
    return null;
  }

  // Watch routes to push full confirm-signup flow to a tab
  function PopupRouteWatcher(): null {
    const { route } = useAuthenticator((ctx) => [ctx.route]);
    React.useEffect(() => {
      const isVerify = route === 'confirmSignUp' || route === 'verifyUser' || route === 'confirmVerifyUser';
      if (isVerify) openAuthTab('confirmSignUp');
    }, [route]);
    return null;
  }

  const Inline: React.FC = () => (
    <ThemeProvider theme={amplifyTheme} colorMode="system">
      <div className="popup-root mindful-auth p-4">
        <Authenticator
          className="!p-0"
          hideSignUp={true}
          formFields={formFields as any}
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
              <KickToSignIn />
              <React.Suspense fallback={<div />}>
                <AnalyticsProviderLazy>
                  <AppContextProvider user={user as any}>
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
                </AnalyticsProviderLazy>
              </React.Suspense>
            </>
          )}
        </Authenticator>
      </div>
    </ThemeProvider>
  );
  
  return { default: Inline };
});

// Lazy Analytics (only used in AUTH path)
const AnalyticsProviderLazy = React.lazy<React.ComponentType<WithChildren>>(async () => {
  const mod = await import("@/analytics/AnalyticsProvider");
  const Provider = (mod as any).default ?? (({ children }: WithChildren) => <>{children}</>);
  return { default: Provider as React.ComponentType<WithChildren> };
});
/* ---------------------------------------------------------- */

/* ----------------------- MAIN ----------------------- */
export default function PopupPage(): ReactElement | null {
  const { mode, setMode, ready } = usePopupMode();
  const suppressNextSignedOut = React.useRef(false);

  // Hub listener is now loaded *only in AUTH mode* and lazily
  useEffect(() => {
    if (!ready || mode !== AuthMode.AUTH) return;

    let unsub: (() => void) | undefined;

    (async () => {
      const { Hub } = await import('aws-amplify/utils');
      unsub = Hub.listen(AMPLIFY_HUB_AUTH_CHANNEL, ({ payload }: { payload?: { event?: string } }) => {
        if (payload?.event === 'signedIn') {
          broadcastAuthEdge('USER_SIGNED_IN');
          refreshNewTabPagesBestEffort();
        } else if (payload?.event === 'signedOut') {
          if (suppressNextSignedOut.current) {
            suppressNextSignedOut.current = false;
            return;
          }
          broadcastAuthEdge('USER_SIGNED_OUT');
          refreshNewTabPagesBestEffort();
          setMode(AuthMode.ANON);
        }
      });
    })();

    return () => { try { unsub?.(); } catch {} };
  }, [ready, mode, setMode]);

  if (!ready) return null;

  return (
    <div className="popup-root mindful-auth p-4">
      <PopupAutosize selector=".popup-root" maxH={600} />

      {/* Open Mindful button */}
      <div className="flex justify-end mb-1">
        <button
          onClick={openMindfulTab}
          type="button"
          className="flex items-center gap-2 rounded-lg border cursor-pointer px-3 py-2
                   bg-white dark:bg-neutral-900
                    text-neutral-700 dark:text-neutral-300
                   border-neutral-300 dark:border-neutral-700
                   hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <img
            src="/assets/icon-128.png"
            alt="Mindful logo"
            className="h-[16px] w-[16px] object-contain"
          />
          <span className="text-sm font-medium">Open Mindful</span>
        </button>
      </div>

      {/* Mode switcher stays in both modes; handlers lazy-load auth only when needed */}
      {/* TODO: Re-enable mode switcher after remote mode is supported again */}
      {/* <ModeSwitcher
        mode={mode}
        onSwitch={async (next) => {
          if (next === AuthMode.AUTH) {
            setMode(AuthMode.AUTH);
            // Force signOut if a session exists so <Authenticator> shows sign-in immediately.
            suppressNextSignedOut.current = true;
            try {
              const { fetchAuthSession, signOut } = await import('aws-amplify/auth');
              const s = await fetchAuthSession().catch(() => null as any);
              if (s && ((s as any).tokens || (s as any).userSub || (s as any).identityId)) {
                await signOut({ global: true }).catch(() => {});
              }
            } catch {}
          } else {
            setMode(AuthMode.ANON);
            broadcastLocalModeEdge();
            refreshNewTabPagesBestEffort();
          }
        }}
      /> */}

      {mode === AuthMode.ANON ? (
        // —— ANON: no Amplify/UI; pure local AppContext ——
        <AppContextProvider user={null} preferredStorageMode="local">
          <PopUpComponent />
        </AppContextProvider>
      ) : (
        // —— AUTH: lazily load Analytics + Authenticator chunk ——
        <React.Suspense fallback={<div />}>
          <AuthInlinePopup />
        </React.Suspense>
      )}
    </div>
  );
}
