// =============================================================================
// error-report.ts — vendor-neutral exception sink
//
// Goals (in order):
//   1. Never crash the caller. Every failure path is best-effort.
//   2. Zero hard dependency on a vendor SDK. We post a Sentry-shaped envelope
//      directly via fetch when SENTRY_DSN is configured. If you want the
//      full @sentry/nextjs SDK later, swap this file's reportError() with
//      a thin call to Sentry.captureException — the signature is stable.
//   3. Always emit a structured server-side log line so Loki/Vector pick it
//      up regardless of whether external Sentry is set up.
//
// Browser usage is via `reportClient`, which posts to /api/log/client-error
// (a future endpoint — when not present we degrade to console.error).
// Server usage is via `reportServer`, which writes to lib/log/server.
// =============================================================================

export type ReportContext = {
  /** Free-form identifier for the call site, e.g. "global-error", "workspace-error". */
  scope: string;
  /** Optional structured fields — request id, user id, ticket id, … */
  extra?: Record<string, unknown>;
};

// -----------------------------------------------------------------------------
// Browser (used by error.tsx components)
// -----------------------------------------------------------------------------
export function reportClient(error: unknown, ctx: ReportContext): void {
  // Always log locally — devtools is the dev's primary signal.
  // eslint-disable-next-line no-console
  console.error(`[portal] ${ctx.scope}`, error, ctx.extra ?? {});

  // Best-effort: forward to a server endpoint that will fan out to Sentry/Loki.
  // The endpoint is intentionally optional — when missing (404), we silently
  // drop. We never await this; navigation should not be blocked.
  try {
    const payload = {
      scope: ctx.scope,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      digest: (error as { digest?: string } | null)?.digest ?? null,
      extra: ctx.extra ?? {},
      url: typeof window !== "undefined" ? window.location.href : undefined,
      ts: new Date().toISOString(),
    };
    void fetch("/api/log/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* swallow — endpoint may not be wired yet */
    });
  } catch {
    /* never throw from a reporter */
  }
}

// -----------------------------------------------------------------------------
// Server (used by API routes & background work)
// -----------------------------------------------------------------------------

/**
 * Server-side report. Always writes a structured log line. Additionally
 * forwards to Sentry over its public Store API if SENTRY_DSN is set.
 *
 * The Sentry envelope here is intentionally minimal — exception type,
 * message, stack frames as a single string. If you want breadcrumbs,
 * tags, fingerprinting, swap to @sentry/nextjs.
 */
export async function reportServer(error: unknown, ctx: ReportContext): Promise<void> {
  // Lazy-load the logger so this module stays browser-safe (it's also
  // imported from reportClient via a shared bundle in some Next builds).
  try {
    const { log } = await import("./log/server");
    log.error({
      scope: ctx.scope,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...(ctx.extra ?? {}),
    });
  } catch {
    /* logger should never fail us */
  }

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  // Parse Sentry DSN: https://<key>@<host>/<project>
  let parsed: { key: string; host: string; projectId: string } | null = null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (u.username && u.host && projectId) {
      parsed = { key: u.username, host: u.host, projectId };
    }
  } catch {
    // bad DSN — log once and drop
    // eslint-disable-next-line no-console
    console.warn("[error-report] SENTRY_DSN unparseable, dropping report");
    return;
  }
  if (!parsed) return;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? "" : "";
  const env = process.env.NODE_ENV ?? "development";
  const release = process.env.PORTAL_VERSION ?? null;

  const body = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    environment: env,
    release,
    server_name: process.env.HOSTNAME ?? "portal",
    logger: "portal.error-report",
    transaction: ctx.scope,
    message,
    extra: { stack, ...(ctx.extra ?? {}) },
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: message,
          stacktrace: stack ? { frames: [{ filename: "stack", function: stack }] } : undefined,
        },
      ],
    },
  };

  // Sentry's old "store" endpoint accepts JSON directly. The newer "envelope"
  // endpoint is more correct but requires multipart; for crash-only reports
  // store is plenty. If we ever want breadcrumbs we move to envelope.
  const url = `https://${parsed.host}/api/${parsed.projectId}/store/`;
  const auth = `Sentry sentry_version=7,sentry_client=portal-mini/0.1,sentry_key=${parsed.key}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(body),
      // 1.5 s budget — never block the response on Sentry being slow.
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* dropping a Sentry POST must never crash the server */
  }
}
