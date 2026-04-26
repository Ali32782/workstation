import "server-only";

/**
 * Multi-tenant Documenso (Sign) config.
 *
 * Each portal workspace (`corehub`, `medtheris`, `kineo`) maps to its own
 * Documenso Team inside the same Documenso instance. Documents are scoped
 * to a Team via the API token used to authenticate the request — Documenso
 * issues team-scoped tokens via `Settings → API Tokens` in the team page.
 *
 *   DOCUMENSO_TEAM_<TENANT>_TOKEN  = api_xxx (Bearer token issued by team)
 *   DOCUMENSO_TEAM_<TENANT>_TEAM_URL = the team's URL slug (used for deep links)
 *
 * The shared DOCUMENSO_URL/DOCUMENSO_INTERNAL_URL stay one per Documenso
 * instance — same pattern as Twenty.
 */

export type SignTenantConfig = {
  /** Bearer token scoped to a single Documenso Team. */
  apiToken: string;
  /** Team url slug (`https://sign.kineo360.work/t/<teamUrl>/...`). */
  teamUrl: string | null;
  /** Numeric team id (only known after the first list call; cached lazily). */
  teamId: number | null;
};

const TENANT_ENV: Record<string, { token: string; teamUrl: string }> = {
  corehub: {
    token: "DOCUMENSO_TEAM_COREHUB_TOKEN",
    teamUrl: "DOCUMENSO_TEAM_COREHUB_URL",
  },
  medtheris: {
    token: "DOCUMENSO_TEAM_MEDTHERIS_TOKEN",
    teamUrl: "DOCUMENSO_TEAM_MEDTHERIS_URL",
  },
  kineo: {
    token: "DOCUMENSO_TEAM_KINEO_TOKEN",
    teamUrl: "DOCUMENSO_TEAM_KINEO_URL",
  },
};

export function getSignTenant(coreWorkspace: string): SignTenantConfig | null {
  const env = TENANT_ENV[coreWorkspace];
  if (!env) return null;
  const apiToken = process.env[env.token];
  if (!apiToken) return null;
  return {
    apiToken,
    teamUrl: process.env[env.teamUrl] ?? null,
    teamId: null,
  };
}

export function hasSignTenant(coreWorkspace: string): boolean {
  return getSignTenant(coreWorkspace) !== null;
}

export function configuredSignTenants(): string[] {
  return Object.keys(TENANT_ENV).filter((t) => hasSignTenant(t));
}

/** Public Documenso URL — used for deep links to open a doc in Documenso UI. */
export function documensoPublicUrl(): string {
  return process.env.DOCUMENSO_URL ?? "https://sign.kineo360.work";
}
