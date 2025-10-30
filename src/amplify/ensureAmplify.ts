let configured = false;

/**
 * Lazily import and configure Amplify *only* for remote mode.
 * Safe to call multiple times; config runs once.
 */
export async function ensureAmplifyConfigured() {
  if (configured) return;

  // Dynamic import ensures these bytes are not on the "Local-only" path.
  const [{ Amplify }, configModule] = await Promise.all([
    import("aws-amplify"),
    import("../../amplify_outputs.json") as any,
  ]);

  // v6+ doesn't need ssr:false; keep it simple and typed-safe.
  // If your types complain, cast config as any to avoid the 'ssr' property error from prior code.
  Amplify.configure((configModule as any).default ?? (configModule as any));

  configured = true;
}
