import "server-only";
import { auth } from "@/lib/auth";
import {
  isMemberOfAnyAllowedGroup,
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import { getHelpdeskTenant, type HelpdeskTenantConfig } from "./config";

/**
 * Multi-tenant helpdesk session resolver.
 *
 * Same Zammad instance for everyone; each portal workspace owns one or more
 * Zammad groups. The session resolver:
 *   1. authenticates the user
 *   2. checks the user is in a helpdesk-allowed Keycloak group
 *   3. picks the correct portal workspace (default = `kineo`) and looks up
 *      the matching Zammad tenant config (group names)
 *   4. denies access if the user has no membership in the requested
 *      portal workspace's Keycloak group
 */

export type HelpdeskSession = {
  email: string;
  username: string;
  fullName: string;
  workspace: string;
  tenant: HelpdeskTenantConfig;
};

// Workspace-prefix-based allowlist. Real Keycloak group paths look like
// `/kineo/leadership`, `/medtheris/sales`, `/corehub/dev-ops`, but a user can
// also be a top-level member (e.g. just `/corehub`). Both must grant access.
// Per-workspace tenant access is enforced separately by
// `userHasWorkspaceAccess`.
const ALLOWED_GROUPS = (
  process.env.HELPDESK_ALLOWED_GROUPS ?? "/kineo,/medtheris,/corehub"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

const DEFAULT_WORKSPACE = "medtheris";

export type ResolveResult =
  | { kind: "ok"; session: HelpdeskSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string }
  | { kind: "not_configured"; message: string; workspace: string };

export async function resolveHelpdeskSession(
  requestedWorkspace: string | null = null,
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const rawGroups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  if (!isAdmin && !isMemberOfAnyAllowedGroup(rawGroups, ALLOWED_GROUPS)) {
    return {
      kind: "forbidden",
      message: "Dein Account ist in keiner Gruppe, die Zugriff aufs Helpdesk hat.",
    };
  }

  const workspace = (requestedWorkspace ?? DEFAULT_WORKSPACE).toLowerCase();

  if (!userHasWorkspaceAccess(workspace, rawGroups, isAdmin)) {
    return {
      kind: "forbidden",
      message: `Dein Account hat keinen Zugriff auf den Workspace "${workspace}".`,
    };
  }

  const tenant = getHelpdeskTenant(workspace);
  if (!tenant) {
    return {
      kind: "not_configured",
      workspace,
      message: `F\u00fcr den Workspace "${workspace}" ist noch kein Helpdesk\u2011Tenant eingerichtet (HELPDESK_TENANT_${workspace.toUpperCase()}_GROUPS fehlt).`,
    };
  }

  return {
    kind: "ok",
    session: {
      email: session.user.email,
      username: session.user.username ?? "",
      fullName: session.user.name ?? "",
      workspace,
      tenant,
    },
  };
}
