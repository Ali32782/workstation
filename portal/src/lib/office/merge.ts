import "server-only";

export {
  CRM_MERGE_SCHEMA_VERSION,
  CRM_MERGE_TOKENS,
} from "./merge-tokens";

/**
 * Tiny mail-merge templating engine.
 *
 * Syntax:
 *   {{path.to.value}}                  → resolve dotted path on context
 *   {{path.to.value | upper}}          → optional pipe filters
 *   {{path.to.value | default:"—"}}    → fallback when missing/empty
 *
 * Supported filters: upper, lower, trim, default:"X", strip-html, br
 *
 * The engine is deliberately conservative — no Jinja-style conditionals,
 * no loops. Mail-merge templates that need control flow should pre-
 * compute the data into ready-to-render strings and inject them as
 * straightforward variables.  This keeps the template surface area
 * small and the substitution side-effect-free.
 *
 * HTML-safety: when `escape: true` is passed, every substitution is
 * HTML-escaped before insertion. Default is escaped — you opt-in to
 * raw HTML by piping through `| raw`.
 */

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export type MergeContext = Record<string, unknown>;

export type MergeOptions = {
  /** When true, leave unresolved tokens in place (debug / preview). Defaults to false → blank-out. */
  keepUnresolved?: boolean;
  /** When true, results are HTML-escaped (set false only for plain-text). */
  escape?: boolean;
};

const FILTERS: Record<string, (v: string, arg?: string) => string> = {
  upper: (v) => v.toUpperCase(),
  lower: (v) => v.toLowerCase(),
  trim: (v) => v.trim(),
  default: (v, arg) => (v && v.length > 0 ? v : (arg ?? "")),
  "strip-html": (v) => v.replace(/<[^>]+>/g, ""),
  br: (v) => v.replace(/\n/g, "<br/>"),
  raw: (v) => v, // marker — handled separately in render()
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPath(ctx: MergeContext, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // Avoid `[object Object]` accidents — call back to JSON for nested data.
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Parse a single token interior, e.g. `company.name | upper | default:"—"`.
 */
function parseToken(raw: string): {
  path: string;
  filters: Array<{ name: string; arg?: string }>;
} {
  const segments = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const path = segments.shift() ?? "";
  const filters = segments.map((s) => {
    const colon = s.indexOf(":");
    if (colon === -1) return { name: s };
    const name = s.slice(0, colon).trim();
    let arg = s.slice(colon + 1).trim();
    // Strip outer quotes from the filter argument so `default:"—"` works.
    if (
      (arg.startsWith('"') && arg.endsWith('"')) ||
      (arg.startsWith("'") && arg.endsWith("'"))
    ) {
      arg = arg.slice(1, -1);
    }
    return { name, arg };
  });
  return { path, filters };
}

export function render(
  template: string,
  ctx: MergeContext,
  opts: MergeOptions = {},
): string {
  const escape = opts.escape !== false;
  return template.replace(TOKEN_RE, (match, raw: string) => {
    const { path, filters } = parseToken(raw);
    let value = stringify(getPath(ctx, path));
    let bypassEscape = false;
    for (const f of filters) {
      if (f.name === "raw") {
        bypassEscape = true;
        continue;
      }
      const fn = FILTERS[f.name];
      if (fn) value = fn(value, f.arg);
    }
    if (!value || value.length === 0) {
      if (opts.keepUnresolved) return match;
      return "";
    }
    if (escape && !bypassEscape) return escapeHtml(value);
    return value;
  });
}

/**
 * Walk a template once and emit the set of `path` strings the user
 * referenced — handy for the "verfügbare Variablen" panel and for
 * pre-flight validation.
 */
export function extractTokens(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(TOKEN_RE)) {
    const { path } = parseToken(m[1] ?? "");
    if (path) out.add(path);
  }
  return Array.from(out).sort();
}

/**
 * Build the standard merge context for a CRM company record. Centralised
 * here so the docs in the UI stay aligned with the actual paths.
 *
 * Naming: nested under `company.*` (always) plus convenience flatteners
 * for the most-frequent fields.  We deliberately don't surface every
 * Twenty field — only the ones that make sense in a sales letter.
 *
 * Bump `CRM_MERGE_SCHEMA_VERSION` in merge-tokens.ts when adding/removing/
 * repurposing paths so Proposal-Generator and Mail-Merge can preflight templates.
 */

export type CompanyMergeShape = {
  id: string;
  name: string;
  domain?: string | null;
  employeeCountPhysio?: number | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  generalEmail?: string | null;
  ownerName?: string | null;
  leadSource?: string | null;
  bookingSystem?: string | null;
};

export function companyContext(c: CompanyMergeShape): MergeContext {
  return {
    company: {
      id: c.id,
      name: c.name ?? "",
      domain: c.domain ?? "",
      employees: c.employeeCountPhysio ?? "",
      city: c.city ?? "",
      country: c.country ?? "",
      email: c.generalEmail ?? "",
      phone: c.phone ?? "",
      owner: c.ownerName ?? "",
      leadSource: c.leadSource ?? "",
      bookingSystem: c.bookingSystem ?? "",
    },
    today: new Date().toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
  };
}

