import React, { useEffect, useMemo, useState } from "react";

 function detectBrowser(): "chrome" | "edge" | "brave" | "other" {
   const ua = navigator.userAgent.toLowerCase();
   if (ua.includes("edg/")) return "edge";
   // Brave often includes "brave" in navigator.userAgentData brands, but that API isn't universal.
   // We'll treat Brave as Chrome-like UI if we can't detect it.
   if (ua.includes("brave")) return "brave";
   if (ua.includes("chrome/")) return "chrome";
   return "other";
 }

// Best-effort “is pinned” check (gracefully degrades if unsupported)
async function tryGetIsOnToolbar(): Promise<boolean | null> {
  try {
    // MV3: chrome.action.getUserSettings exists in some Chromium builds.
    const actionAny = (chrome as any)?.action;
    if (!actionAny?.getUserSettings) return null;

    const settings = await actionAny.getUserSettings();
    // Some implementations expose: { isOnToolbar: boolean }
    if (typeof settings?.isOnToolbar === "boolean") return settings.isOnToolbar;

    return null;
  } catch {
    return null;
  }
}

export const PinExtensionStep: React.FC = () => {
  const browser = useMemo(() => detectBrowser(), []);
  const [isPinned, setIsPinned] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Poll a couple times (user might pin while reading)
    const run = async () => {
      const v = await tryGetIsOnToolbar();
      if (!cancelled) setIsPinned(v);
    };

    void run();
    const t = window.setInterval(() => void run(), 1500);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const extensionsLabel = browser === "edge" ? "Extensions" : "Extensions";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
        <ol className="list-decimal pl-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
          <li>
            Click the{" "}
            <span className="inline-flex items-center gap-1 font-medium">
              {extensionsLabel}
              {/* Light / dark PNG variants (CSS-only toggle) */}
              <img
                src="/assets/extension-icons/chrome-light-mode.png"
                alt=""
                aria-hidden="true"
                width={16}
                height={16}
                className="inline-block h-4 w-4 dark:hidden"
              />
              <img
                src="/assets/extension-icons/chrome-dark-mode.png"
                alt=""
                aria-hidden="true"
                width={16}
                height={16}
                className="hidden h-4 w-4 dark:inline-block"
              />
            </span>{" "}
            icon near your address bar.
          </li>
          <li>
            Find <span className="font-medium">Mindful</span> in the list.
          </li>
          <li>
            Click the <span className="font-medium">Pin</span> icon so it stays on your toolbar.
          </li>
        </ol>

        {isPinned === true && (
          <div className="mt-3 rounded-lg bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 p-3 text-sm text-neutral-800 dark:text-neutral-200">
            ✅ Looks like Mindful is pinned!
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-500">
        Tip: If you don't see the Extensions icon, it may be hidden in the overflow menu (or your toolbar is too full).
      </div>
    </div>
  );
};
