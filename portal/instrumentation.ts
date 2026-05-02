// =============================================================================
// instrumentation.ts — Next.js boot hook
//
// Next runs register() exactly once on the server, before the first request
// is served. Perfect spot for env validation, log-startup banners, and
// (later) Sentry/OpenTelemetry init.
//
// Documented at: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
// =============================================================================

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    // The edge runtime can't see all envs anyway — only validate in node.
    return;
  }

  const { validateEnvOrExit } = await import("./src/lib/env");
  validateEnvOrExit();

  // Sentry init lives here too once SENTRY_DSN is set; see sentry.server.config.ts.
  if (process.env.SENTRY_DSN) {
    try {
      await import("./sentry.server.config");
    } catch (err) {
      console.warn("[instrumentation] sentry.server.config failed to load:", err);
    }
  }
}
