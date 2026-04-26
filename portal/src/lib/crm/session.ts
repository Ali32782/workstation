import "server-only";
import { auth } from "@/lib/auth";
import {
  isMemberOfAnyAllowedGroup,
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import { getTwentyTenant, type TwentyTenantConfig } from "./config";

/**
 * Multi-tenant CRM session resolver.
 *
 *   1. Verify the user is authenticated.
 *   2. Verify the user is in a CRM-allowed Keycloak group (or is an admin).
 *   3. Pick the Twenty tenant (workspace + token) for the requested portal
 *      workspace. Each portal workspace has its own tenant config so the
 *      same Twenty instance can serve multiple isolated CRMs.
 *   4. Verify the user's Keycloak groups grant access to that specific
 *      portal workspace — admins bypass this check.
 */

export type CrmSession = {
  email: string;
  username: string;
  fullName: string;
  workspace: string;
  tenant: TwentyTenantConfig;
};

// Workspace-prefix-based allowlist. Real Keycloak group paths look like
// `/kineo/leadership`, `/medtheris/sales`, `/corehub/dev-ops`, but a user can
// also be a top-level member (e.g. just `/corehub`). Both must grant access.
// Per-workspace tenant access is enforced separately by
// `userHasWorkspaceAccess`.
const CRM_GROUPS = (process.env.CRM_ALLOWED_GROUPS ?? "/kineo,/medtheris,/corehub")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

const DEFAULT_WORKSPACE = "kineo";

export type ResolveResult =
  | { kind: "ok"; session: CrmSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string }
  | { kind: "not_configured"; message: string; workspace: string };

export async function resolveCrmSession(
  requestedWorkspace: string | null,
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const rawGroups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  if (!isAdmin && !isMemberOfAnyAllowedGroup(rawGroups, CRM_GROUPS)) {
    return {
      kind: "forbidden",
      message: "Dein Account ist in keiner Gruppe, die Zugriff aufs CRM hat.",
    };
  }

  const workspace = (requestedWorkspace ?? DEFAULT_WORKSPACE).toLowerCase();

  if (!userHasWorkspaceAccess(workspace, rawGroups, isAdmin)) {
    return {
      kind: "forbidden",
      message: `Dein Account hat keinen Zugriff auf den Workspace "${workspace}".`,
    };
  }

  const tenant = getTwentyTenant(workspace);
  if (!tenant) {
    return {
      kind: "not_configured",
      workspace,
      message: `F\u00fcr den Workspace "${workspace}" ist noch kein Twenty\u2011Tenant eingerichtet (TWENTY_WORKSPACE_${workspace.toUpperCase()}_ID/_TOKEN fehlen).`,
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
