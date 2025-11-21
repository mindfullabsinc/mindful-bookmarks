export type BrowserName = "chrome" | "brave" | "edge" | "firefox" | "safari" | "unknown";

/**
 * Detect the current browser based on user-agent heuristics and feature detection.
 *
 * @returns One of the known browser identifiers.
 */
export function detectBrowser(): BrowserName {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  // Brave must be detected explicitly
  // because Brave masks itself as Chrome.
  // `navigator.brave` exists on Brave.
  if ((navigator as any).brave) {
    return "brave";
  }

  if (ua.includes("edg")) {
    return "edge";
  }

  if (ua.includes("firefox")) {
    return "firefox";
  }

  if (/safari/.test(ua) && !/chrome/.test(ua)) {
    return "safari";
  }

  if (ua.includes("chrome")) {
    return "chrome";
  }

  return "unknown";
}
