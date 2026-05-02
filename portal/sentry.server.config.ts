// =============================================================================
// sentry.server.config.ts — Server-side Sentry init stub
//
// Imported lazily by instrumentation.ts when SENTRY_DSN is set. Until you
// install @sentry/nextjs, this file is intentionally a no-op so the boot
// hook doesn't crash when an operator only configures the DSN halfway.
//
// To activate real Sentry:
//   1) cd portal && npm i @sentry/nextjs
//   2) Replace the body below with:
//        import * as Sentry from "@sentry/nextjs";
//        Sentry.init({
//          dsn: process.env.SENTRY_DSN,
//          tracesSampleRate: 0.1,
//          environment: process.env.NODE_ENV,
//        });
//   3) Optionally add `sentry.client.config.ts` and a Next.js plugin
//      wrapper around next.config.ts (see @sentry/nextjs docs).
//
// Until then, lib/error-report.ts already posts to Sentry's HTTP /store/
// endpoint directly when SENTRY_DSN is set — that's the minimal pipeline
// and works without any SDK at all.
// =============================================================================

if (process.env.SENTRY_DSN) {
  // eslint-disable-next-line no-console
  console.info(
    "[sentry] DSN detected. Using lib/error-report.ts direct-store pipeline. " +
      "Install @sentry/nextjs for breadcrumbs + tracing.",
  );
}

export {};
