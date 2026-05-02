// =============================================================================
// env.ts — boot-time env-var validation (server-only)
//
// Why no zod? Adding a runtime dep just for env validation is overkill —
// the rules here are tiny (presence + URL/secret shape) and we want this
// module to be importable from any server entry without any bundling
// surprises. If we ever need composable schemas, swap to zod and keep the
// public API.
//
// Usage (preferred): import this from instrumentation.ts so it runs once at
// process start. Failure mode in production is hard-fail with a list of all
// missing/invalid vars; in dev it's a single big console.warn so you can
// keep iterating without restart loops.
// =============================================================================

type EnvRule = {
  name: string;
  required: boolean;
  // optional sanity check (return error message string or null)
  check?: (value: string) => string | null;
  // human description for the error output
  hint?: string;
};

const isUrl = (v: string): string | null => {
  try {
    const u = new URL(v);
    if (!u.protocol.startsWith("http")) {
      return `must be http(s) URL, got "${u.protocol}"`;
    }
    return null;
  } catch {
    return "not a valid URL";
  }
};

const minLen = (n: number) => (v: string): string | null =>
  v.length < n ? `must be ≥ ${n} chars (got ${v.length})` : null;

// -----------------------------------------------------------------------------
// Schema. Keep this list small and load-bearing — anything that's "nice to
// have" should NOT be in here, because adding noise makes the real failures
// invisible. Optional-but-known vars go in OPTIONAL_KNOWN below for the
// "did you forget?" pass.
// -----------------------------------------------------------------------------
const RULES: EnvRule[] = [
  // --- Keycloak / Auth ---
  { name: "KC_HOSTNAME", required: true, hint: "public Keycloak host" },
  { name: "KEYCLOAK_REALM", required: true, hint: "Keycloak realm name" },
  {
    name: "KEYCLOAK_INTERNAL_URL",
    required: true,
    check: isUrl,
    hint: "Internal Keycloak URL (e.g. http://keycloak:8080)",
  },
  {
    name: "KEYCLOAK_PORTAL_CLIENT_ID",
    required: true,
    hint: "OIDC client id for the Portal",
  },
  {
    name: "KEYCLOAK_PORTAL_CLIENT_SECRET",
    required: true,
    check: minLen(16),
    hint: "OIDC client secret (≥ 16 chars)",
  },
  {
    name: "NEXTAUTH_SECRET",
    required: true,
    check: minLen(32),
    hint: "openssl rand -base64 32",
  },
  {
    name: "NEXTAUTH_URL",
    required: true,
    check: isUrl,
    hint: "Public Portal URL (e.g. https://portal.kineo360.work)",
  },

  // --- Twenty CRM ---
  { name: "TWENTY_URL", required: true, check: isUrl },
  { name: "TWENTY_API_KEY", required: true, check: minLen(20) },

  // --- Plane (project management) ---
  { name: "PLANE_INTERNAL_URL", required: true, check: isUrl },
  { name: "PLANE_API_KEY", required: true, check: minLen(20) },

  // --- Rocket.Chat ---
  { name: "ROCKETCHAT_URL", required: true, check: isUrl },
];

// Vars we expect to see in production but tolerate missing in dev. Failing
// these emits a yellow warning instead of a red error.
const OPTIONAL_KNOWN: EnvRule[] = [
  { name: "MAUTIC_INTERNAL_URL", required: false, check: isUrl },
  { name: "MAUTIC_API_TOKEN", required: false },
  { name: "PORTAL_ADMIN_USERNAMES", required: false, hint: "comma-separated keycloak usernames" },
  { name: "PORTAL_OPENCUT_URL", required: false, check: isUrl },
  { name: "PORTAL_POSTIZ_URL", required: false, check: isUrl },
  { name: "DOCUMENSO_URL", required: false, check: isUrl },
  { name: "SENTRY_DSN", required: false, check: isUrl },
];

type Issue = { level: "error" | "warn"; var: string; msg: string };

function evaluate(env: NodeJS.ProcessEnv, rules: EnvRule[], level: Issue["level"]): Issue[] {
  const out: Issue[] = [];
  for (const r of rules) {
    const raw = env[r.name];
    if (!raw || raw.trim() === "") {
      if (r.required) {
        out.push({
          level,
          var: r.name,
          msg: `missing${r.hint ? ` — ${r.hint}` : ""}`,
        });
      } else {
        out.push({
          level: "warn",
          var: r.name,
          msg: `missing (optional)${r.hint ? ` — ${r.hint}` : ""}`,
        });
      }
      continue;
    }
    if (r.check) {
      const err = r.check(raw);
      if (err) {
        out.push({ level, var: r.name, msg: err });
      }
    }
  }
  return out;
}

/**
 * Run validation. Side effects:
 *   - logs every issue (one line each)
 *   - in production: throws if any error-level issue exists
 *   - in development: never throws (so iterative work isn't blocked)
 */
export function validateEnvOrExit(env: NodeJS.ProcessEnv = process.env): void {
  const errors = evaluate(env, RULES, "error");
  const warns = evaluate(env, OPTIONAL_KNOWN, "warn");
  const all = [...errors, ...warns];
  if (all.length === 0) {
    return;
  }

  const isProd = env.NODE_ENV === "production";
  const tag = "[env-check]";
  for (const i of all) {
    const line = `${tag} ${i.level.toUpperCase()} ${i.var}: ${i.msg}`;
    if (i.level === "error") {
      console.error(line);
    } else {
      console.warn(line);
    }
  }
  const hardErrors = all.filter((i) => i.level === "error").length;
  if (hardErrors > 0 && isProd) {
    throw new Error(
      `${tag} ${hardErrors} required env var(s) missing or invalid — refusing to boot in production.`,
    );
  }
}
