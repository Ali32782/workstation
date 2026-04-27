import "server-only";

import { getRuntimeTenant, listRuntimeTenants } from "./runtime-store";

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
 *
 * Lookup order:
 *   1. Environment variables (host-level config, secrets in `/opt/corelab/.env`)
 *   2. Runtime store (browser-provisioned via `/admin/onboarding/sign`)
 *
 * Env wins so a host operator can always override a runtime-provisioned token.
 */

export type SignTenantConfig = {
  /** Bearer token scoped to a single Documenso Team. */
  apiToken: string;
  /** Team url slug (`https://sign.kineo360.work/t/<teamUrl>/...`). */
  teamUrl: string | null;
  /** Numeric team id (only known after the first list call; cached lazily). */
  teamId: number | null;
  /** Where the active config came from. */
  source: "env" | "runtime";
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

function getEnvTenant(coreWorkspace: string): SignTenantConfig | null {
  const env = TENANT_ENV[coreWorkspace];
  if (!env) return null;
  const apiToken = process.env[env.token];
  if (!apiToken) return null;
  return {
    apiToken,
    teamUrl: process.env[env.teamUrl] ?? null,
    teamId: null,
    source: "env",
  };
}

/**
 * Sync resolver — env-only. Used by hot paths that can't go async (deep-link
 * helpers, etc). For request handlers, prefer `resolveSignTenant`.
 */
export function getSignTenant(coreWorkspace: string): SignTenantConfig | null {
  return getEnvTenant(coreWorkspace);
}

/**
 * Async resolver that also consults the on-disk runtime store. This is what
 * `resolveSignSession` should use so admin-provisioned tenants light up
 * without a portal restart.
 */
export async function resolveSignTenant(
  coreWorkspace: string,
): Promise<SignTenantConfig | null> {
  const fromEnv = getEnvTenant(coreWorkspace);
  if (fromEnv) return fromEnv;
  const fromStore = await getRuntimeTenant(coreWorkspace);
  if (!fromStore) return null;
  return {
    apiToken: fromStore.apiToken,
    teamUrl: fromStore.teamUrl,
    teamId: null,
    source: "runtime",
  };
}

export function hasSignTenant(coreWorkspace: string): boolean {
  return getEnvTenant(coreWorkspace) !== null;
}

export function configuredSignTenants(): string[] {
  return Object.keys(TENANT_ENV).filter((t) => hasSignTenant(t));
}

export async function configuredSignTenantsAsync(): Promise<string[]> {
  const fromEnv = configuredSignTenants();
  const runtime = await listRuntimeTenants();
  const set = new Set(fromEnv);
  for (const k of Object.keys(runtime)) set.add(k);
  return Array.from(set);
}

export function knownSignWorkspaces(): string[] {
  return Object.keys(TENANT_ENV);
}

/** Public Documenso URL — used for deep links to open a doc in Documenso UI. */
export function documensoPublicUrl(): string {
  return process.env.DOCUMENSO_URL ?? "https://sign.kineo360.work";
}
