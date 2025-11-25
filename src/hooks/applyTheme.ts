// src/hooks/applyTheme.ts
import { ThemeChoice, THEME_STORAGE_KEY } from "@/core/constants/theme";

/**
 * Apply the chosen theme to document root, honoring system preference when requested.
 */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const shouldUseDark =
    choice === ThemeChoice.DARK ||
    (choice === ThemeChoice.SYSTEM && prefersDark);

  if (shouldUseDark) {
    root.classList.add("dark");
    body?.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    body?.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

/** Load stored theme, defaulting to SYSTEM */
export async function loadInitialTheme(): Promise<ThemeChoice> {
  try {
    const payload =
      (await chrome?.storage?.local?.get?.(THEME_STORAGE_KEY)) ?? {};
    const raw = (payload as Record<string, unknown>)[THEME_STORAGE_KEY];

    if (
      raw === ThemeChoice.LIGHT ||
      raw === ThemeChoice.DARK ||
      raw === ThemeChoice.SYSTEM
    ) {
      return raw as ThemeChoice;
    }
  } catch {
    // ignore
  }
  return ThemeChoice.SYSTEM;
}

/** Persist and immediately apply */
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
