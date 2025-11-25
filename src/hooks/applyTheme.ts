import { ThemeChoice, THEME_STORAGE_KEY } from "@/core/constants/theme"; 


/**
 * Apply the chosen theme to document root, honoring system preference when requested.
 *
 * @param choice Theme selection (light/dark/system).
 */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const shouldUseDark =
    choice === ThemeChoice.DARK ||
    (choice === ThemeChoice.SYSTEM && prefersDark);

  root.classList.toggle("dark", !!shouldUseDark);
}

/**
 * Read the stored theme preference from chrome.storage/localStorage.
 * Falls back to ThemeChoice.SYSTEM.
 */
export async function loadInitialTheme(): Promise<ThemeChoice> {
  try {
    const payload =
      (await chrome?.storage?.local?.get?.(THEME_STORAGE_KEY)) ?? {};
    const raw = (payload as Record<string, unknown>)[THEME_STORAGE_KEY];

    if (raw === ThemeChoice.LIGHT || raw === ThemeChoice.DARK || raw === ThemeChoice.SYSTEM) {
      return raw as ThemeChoice;
    }
  } catch {
    // ignore
  }
  return ThemeChoice.SYSTEM;
}

/**
 * Persist the user preference to chrome.storage and immediately apply it.
 *
 * @param choice Theme selection to store/apply.
 */
export async function persistAndApplyTheme(choice: ThemeChoice) {
  applyTheme(choice);
  try {
    await chrome?.storage?.local?.set?.({
      [THEME_STORAGE_KEY]: choice,
    });
  } catch {
    // best-effort
  }
}
