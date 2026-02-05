const TRACKING_PARAM_PREFIXES = [
  "utm_",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "vero_",
  "igshid",
  "msclkid",
];

export function sanitizeUrlForAI(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);

    // Drop fragments (can contain sensitive client-side state)
    u.hash = "";

    // Strip known tracking params
    for (const key of Array.from(u.searchParams.keys())) {
      const lower = key.toLowerCase();
      const shouldDrop =
        TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p)) ||
        TRACKING_PARAM_PREFIXES.includes(lower);

      if (shouldDrop) u.searchParams.delete(key);
    }

    return u.toString();
  } catch {
    // If URL parsing fails, just return the original string
    return rawUrl;
  }
}

export function truncateForAI(input: string, maxLen: number): string {
  if (!input) return input;
  return input.length > maxLen ? input.slice(0, maxLen) : input;
}
