// Lightweight, synchronous probe of whether the user is signed in or anon.
import { 
  AuthMode, 
  type AuthModeType 
} from "@/core/constants/authMode";

/**
 * Guess the current boot-time auth mode before any async calls.
 * Defaults to ANON to stay safe for local-first launch.
 *
 * @returns Current cached boot auth mode, falling back to anonymous.
 */
export function guessBootAuthMode(): AuthModeType {
  try {
    const raw =
      (globalThis as any)?.sessionStorage?.getItem?.("mindful_boot_auth_mode") ??
      (globalThis as any)?.localStorage?.getItem?.("mindful_boot_auth_mode");
    if (raw === AuthMode.AUTH) return AuthMode.AUTH;
  } catch {}
  return AuthMode.ANON;
}

/**
 * Cache the current auth mode so new tabs know what to do.
 * Call this whenever the user signs in/out.
 *
 * @param mode Boot auth mode to cache for future bootstraps.
 * @returns void
 */
export function cacheBootAuthMode(mode: AuthModeType) {
  try {
    (globalThis as any)?.sessionStorage?.setItem?.("mindful_boot_auth_mode", mode);
  } catch {}
}
