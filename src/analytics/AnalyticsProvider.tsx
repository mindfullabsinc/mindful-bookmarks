// src/analytics/AnalyticsProvider.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { phCapture, phIdentify, phReset } from "@/analytics/phLite";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { AnalyticsContext, type AnalyticsType } from "@/analytics/AnalyticsContext";

const HEARTBEAT_MS = 60_000;
const OPT_OUT_KEY = "mindful_ph_opt_out";
const SURFACE = (globalThis as any).__surface || "popup";
const STORAGE_MODE = (globalThis as any).__storageMode || undefined;

// Optional passthroughs if the PostHog core SDK is present.
// Safe no-ops with your phLite.
function tryPosthogOptOut() {
  try { (globalThis as any).posthog?.opt_out_capturing?.(); } catch {}
}
function tryPosthogOptIn() {
  try { (globalThis as any).posthog?.opt_in_capturing?.(); } catch {}
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { route } = useAuthenticator((ctx) => [ctx.route]);
  const [userId, setUserId] = useState<string | null>(null);

  // Safer initializer for localStorage reads
  const [optOut, setOptOutState] = useState<boolean>(() => {
    try { return globalThis?.localStorage?.getItem(OPT_OUT_KEY) === "true"; }
    catch { return false; }
  });

  const setOptOut = useCallback((v: boolean) => {
    setOptOutState(v);
    try { globalThis?.localStorage?.setItem(OPT_OUT_KEY, String(v)); } catch {}
    if (v) tryPosthogOptOut(); else tryPosthogOptIn();
  }, []);

  // Keep core SDK (if present) aligned on first mount
  useEffect(() => {
    if (optOut) tryPosthogOptOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Identify / reset based on auth route
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (route !== "authenticated") {
        setUserId(null);
        phReset(); // safe with phLite
        return;
      }
      try {
        const session = await fetchAuthSession();
        const sub = (session as any)?.tokens?.idToken?.payload?.sub as string | undefined;
        if (!sub) return;

        if (!optOut) {
          phIdentify(sub, { surface: SURFACE, ...(STORAGE_MODE ? { storageMode: STORAGE_MODE } : {}) });
          phCapture("login", { surface: SURFACE });
        }
        if (mounted) setUserId(sub);
      } catch {
        // never break UX/tests
      }
    })();
    return () => { mounted = false; };
  }, [route, optOut]);

  // Heartbeat (focus-based)
  const hbRef = useRef<number | null>(null);
  const sendHeartbeat = useCallback(() => {
    if (optOut || !userId) return;
    phCapture("active_ping", { surface: SURFACE, ...(STORAGE_MODE ? { storageMode: STORAGE_MODE } : {}) });
  }, [optOut, userId]);

  useEffect(() => {
    const isTest = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
    if (isTest || typeof window === "undefined" || typeof document === "undefined") return;

    function onFocus() {
      sendHeartbeat();
      if (hbRef.current) window.clearInterval(hbRef.current);
      hbRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
    }
    function onBlur() {
      if (hbRef.current) { window.clearInterval(hbRef.current); hbRef.current = null; }
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    if (document.hasFocus()) onFocus();

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
  }, [sendHeartbeat]);

  const capture = useCallback((event: string, props: Record<string, any> = {}) => {
    if (optOut) return;
    phCapture(event, props);
  }, [optOut]);

  const identify = useCallback((id: string, traits?: Record<string, unknown>) => {
    if (optOut) return;
    phIdentify(id, traits as Record<string, any> | undefined);
  }, [optOut]);

  const value = useMemo<AnalyticsType>(() => ({
    capture,
    identify,
    optOut,
    setOptOut,
    userId: userId ?? undefined, // `Analytics` allows optional userId
  }), [capture, identify, optOut, setOptOut, userId]);

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}
