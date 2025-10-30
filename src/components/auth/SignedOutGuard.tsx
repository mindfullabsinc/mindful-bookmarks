import React, { useContext, type ReactNode } from "react";
import { AppContext } from "@/scripts/AppContextProvider";
import { AuthMode } from "@/core/constants/authMode";

/**
 * SignedOutGuard
 *
 * STUB: By default this renders nothing so landing it won’t change UI.
 * Flip `enabled` to true when we actually want it to show.
 *
 * Behavior (when enabled):
 * - If the user is signed *out*, renders `children`.
 * - If the user is signed *in*, renders `fallback` (or null).
 *
 * This prefers AppContext for auth state but won’t crash if the context
 * isn’t present.
 */
export type SignedOutGuardProps = {
  /** Content to show only when the user is signed out */
  children?: ReactNode;
  /** Optional content to show when user is signed in (defaults to null) */
  fallback?: ReactNode;
  /** Keep false in PR 1 so this guard is a no-op until we wire it in */
  enabled?: boolean;
};

export default function SignedOutGuard({
  children,
  fallback = null,
  enabled = false,
}: SignedOutGuardProps) {
  // If the stub isn’t enabled, it renders nothing so PR 1 has zero visual impact.
  if (!enabled) return null;

  // Try AppContext first; if it’s missing, assume “anonymous” to be safe.
  let isSignedIn = false;
  try {
    const ctx = useContext(AppContext) as any;
    const mode: string | undefined = ctx?.authMode;
    isSignedIn = mode === AuthMode.AUTH;
  } catch {
    // If context access fails for any reason, default to "signed out"
    isSignedIn = false;
  }

  return isSignedIn ? <>{fallback}</> : <>{children}</>;
}
