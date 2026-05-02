// =============================================================================
// metrics.ts — tiny in-memory Prometheus-format metrics
//
// Why hand-rolled?
//   - prom-client is fine, but ~80 KB and brings GC pressure (label-cardinality
//     hash). For our scale (a few hundred QPS, single replica) a flat Map is
//     plenty.
//   - We expose this on /api/metrics behind METRICS_TOKEN — never on the
//     public LB path.
//
// Counter usage (from API route handlers):
//   import { counters } from "@/lib/metrics";
//   counters.inc("portal_http_requests_total", { route: "helpdesk", code: "200" });
//
// On horizontal scale-out: swap to OpenTelemetry SDK + a remote-write target.
// =============================================================================

type LabelSet = Record<string, string>;

type Counter = {
  name: string;
  help: string;
  series: Map<string, { labels: LabelSet; value: number }>;
};

const COUNTERS = new Map<string, Counter>();

function ensureCounter(name: string, help: string): Counter {
  const existing = COUNTERS.get(name);
  if (existing) return existing;
  const c: Counter = { name, help, series: new Map() };
  COUNTERS.set(name, c);
  return c;
}

function labelKey(labels: LabelSet): string {
  // Stable string key — sort by name so { a, b } and { b, a } collapse.
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join(",");
}

export const counters = {
  /**
   * Register the human-readable HELP line for a counter. Calling this with
   * the same name twice is a no-op; later calls with different help text
   * will be ignored (first-write wins).
   */
  define(name: string, help: string): void {
    ensureCounter(name, help);
  },

  inc(name: string, labels: LabelSet = {}, by: number = 1): void {
    if (by < 0) return; // counters never decrease
    const c = ensureCounter(name, name);
    const key = labelKey(labels);
    const cur = c.series.get(key);
    if (cur) {
      cur.value += by;
    } else {
      c.series.set(key, { labels, value: by });
    }
  },

  /**
   * Render every registered counter in Prometheus exposition format.
   * https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format
   */
  render(): string {
    const lines: string[] = [];
    // Sort counters alphabetically for deterministic output (easier diffs in tests).
    const names = Array.from(COUNTERS.keys()).sort();
    for (const name of names) {
      const c = COUNTERS.get(name)!;
      lines.push(`# HELP ${name} ${c.help}`);
      lines.push(`# TYPE ${name} counter`);
      const series = Array.from(c.series.values()).sort((a, b) =>
        labelKey(a.labels).localeCompare(labelKey(b.labels)),
      );
      if (series.length === 0) {
        lines.push(`${name} 0`);
        continue;
      }
      for (const s of series) {
        const labelStr =
          Object.keys(s.labels).length === 0
            ? ""
            : "{" +
              Object.entries(s.labels)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
                .join(",") +
              "}";
        lines.push(`${name}${labelStr} ${s.value}`);
      }
    }
    return lines.join("\n") + "\n";
  },
};

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

// -----------------------------------------------------------------------------
// Pre-registered counters used by middleware / shared route helpers.
// -----------------------------------------------------------------------------
counters.define(
  "portal_http_requests_total",
  "Total HTTP requests handled by the portal route layer.",
);
counters.define(
  "portal_http_errors_total",
  "Total HTTP responses with status >= 500.",
);
counters.define(
  "portal_rate_limit_hits_total",
  "Total requests rejected by lib/rate-limit (status 429).",
);
counters.define(
  "portal_oidc_failures_total",
  "Total OIDC sign-in failures captured by NextAuth callbacks.",
);
counters.define(
  "portal_outbound_failures_total",
  "Total upstream-API failures (Twenty/Plane/Mautic/...) captured by lib calls.",
);
