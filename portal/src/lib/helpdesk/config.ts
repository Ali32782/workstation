import "server-only";

/**
 * Multi-tenant Zammad config.
 *
 * One Zammad instance hosts every portal workspace's helpdesk; tenants are
 * isolated by *Group* (and optionally Organization). Each portal workspace
 * declares which Zammad group names belong to it via env variables:
 *
 *   HELPDESK_TENANT_MEDTHERIS_GROUPS = "Medtheris Support,Medtheris Internal"
 *   HELPDESK_TENANT_KINEO_GROUPS     = "Kineo Internal"
 *
 * Lookups are case-insensitive. The portal filters tickets by group name on
 * read and writes; tickets outside the tenant's groups are 403/404 to that
 * tenant.
 *
 * If a tenant has no groups configured, the routes return a 503 with code
 * `not_configured` so the UI can render a friendly empty state.
 */

export type HelpdeskTenantConfig = {
  workspace: string;
  groupNames: string[];
};

const TENANT_GROUPS_ENV: Record<string, string> = {
  corehub: "HELPDESK_TENANT_COREHUB_GROUPS",
  medtheris: "HELPDESK_TENANT_MEDTHERIS_GROUPS",
  kineo: "HELPDESK_TENANT_KINEO_GROUPS",
};

function readGroups(envVar: string): string[] {
  const raw = process.env[envVar];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getHelpdeskTenant(workspace: string): HelpdeskTenantConfig | null {
  const envVar = TENANT_GROUPS_ENV[workspace];
  if (!envVar) return null;
  const groups = readGroups(envVar);
  if (!groups.length) return null;
  return { workspace, groupNames: groups };
}

export function tenantAllowsGroup(
  tenant: HelpdeskTenantConfig,
  groupName: string,
): boolean {
  const target = groupName.toLowerCase();
  return tenant.groupNames.some((g) => g.toLowerCase() === target);
}
