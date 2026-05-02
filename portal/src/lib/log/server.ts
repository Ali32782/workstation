/**
 * Tiny structured JSON logger for server-only code paths (API routes,
 * server actions, cron). Intentionally dependency-free so we don't pull
 * pino/winston into the Next runtime.
 *
 * Output is a single JSON line per call — Docker/Loki/Vector-friendly:
 *   {"ts":"…","level":"info","scope":"office.save","ws":"corehub", …}
 *
 * Design notes:
 *   - We don't expose `error` directly; pass `err: error.message` so
 *     callers stay in control of what leaks to logs.
 *   - `scope` is mandatory and free-form (e.g. "office.save",
 *     "search.api", "scraper.webhook") — makes greppable log lines.
 *   - Falls back to `console.{info|warn|error}` so Next dev-server
 *     pretty-prints, while in production we still get JSON in stdout.
 */
type Level = "info" | "warn" | "error";

export interface LogFields {
  scope: string;
  msg?: string;
  [k: string]: unknown;
}

function emit(level: Level, fields: LogFields) {
  const line = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };
  // We use console.* so Next's dev overlay still picks errors up.
  if (level === "error") console.error(JSON.stringify(line));
  else if (level === "warn") console.warn(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}

export const log = {
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
