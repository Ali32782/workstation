import "server-only";

/**
 * Multi-tenant Twenty config.
 *
 * Each portal workspace (`corehub`, `medtheris`, `kineo`, …) maps to an
 * independent Twenty workspace inside the same Twenty instance. The mapping
 * is resolved from environment variables so a new tenant only requires
 * setting two vars:
 *
 *   TWENTY_WORKSPACE_<TENANT>_ID    = <uuid of the twenty workspace>
 *   TWENTY_WORKSPACE_<TENANT>_TOKEN = <workspace-scoped JWT (api key)>
 *
 * The shared TWENTY_URL/TWENTY_INTERNAL_URL stay one per Twenty instance.
 *
 * If a portal workspace has no Twenty config (e.g. corehub is engineering-
 * only), every CRM call returns a friendly "not configured" error — the UI
 * shows an empty-state instead of crashing.
 */

export type TwentyTenantConfig = {
  workspaceId: string;
  apiToken: string;
};

const TENANT_ENV: Record<string, { id: string; token: string }> = {
  corehub: {
    id: "TWENTY_WORKSPACE_COREHUB_ID",
    token: "TWENTY_WORKSPACE_COREHUB_TOKEN",
  },
  medtheris: {
    id: "TWENTY_WORKSPACE_MEDTHERIS_ID",
    token: "TWENTY_WORKSPACE_MEDTHERIS_TOKEN",
  },
  kineo: {
    id: "TWENTY_WORKSPACE_KINEO_ID",
    token: "TWENTY_WORKSPACE_KINEO_TOKEN",
  },
};

// Legacy single-workspace fallback (the original implementation).
function legacyFallback(): TwentyTenantConfig | null {
  const id =
    process.env.TWENTY_WORKSPACE_ID_KINEO ?? process.env.TWENTY_WORKSPACE_ID;
  const token =
    process.env.TWENTY_BRIDGE_API_TOKEN ?? process.env.TWENTY_API_TOKEN;
  if (!id || !token) return null;
  return { workspaceId: id, apiToken: token };
}

export function getTwentyTenant(coreWorkspace: string): TwentyTenantConfig | null {
  const env = TENANT_ENV[coreWorkspace];
  if (env) {
    const id = process.env[env.id];
    const token = process.env[env.token];
    if (id && token) return { workspaceId: id, apiToken: token };
  }
  // Compat: when no per-tenant config is set, kineo falls back to the
  // original single-workspace env vars so the existing deployment keeps
  // working without any change.
  if (coreWorkspace === "kineo") {
    return legacyFallback();
  }
  return null;
}

/** True iff at least one tenant config is wired up for the given workspace. */
export function hasTwentyTenant(coreWorkspace: string): boolean {
  return getTwentyTenant(coreWorkspace) !== null;
}

/**
 * Returns every portal workspace id that has a usable Twenty config.
 * Used by the workspaces listing to decide whether to render `/crm` as
 * native or hide the entry.
 */
export function configuredTwentyTenants(): string[] {
  return Object.keys(TENANT_ENV).filter((t) => hasTwentyTenant(t));
}
