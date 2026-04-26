import "server-only";
import { auth } from "@/lib/auth";
import {
  isMemberOfAnyAllowedGroup,
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import { getSignTenant, type SignTenantConfig } from "./config";

/**
 * Multi-tenant Sign session resolver.
 *
 *   1. Verify the user is authenticated.
 *   2. Verify the user is in a Sign-allowed Keycloak group (or is admin).
 *   3. Pick the Documenso tenant (team-scoped API token) for the requested
 *      portal workspace. Each portal workspace has its own team config so
 *      the same Documenso instance can serve multiple isolated team spaces.
 *   4. Verify the user's Keycloak groups grant access to that workspace.
 */

export type SignSession = {
  email: string;
  username: string;
  fullName: string;
  workspace: string;
  tenant: SignTenantConfig;
};

// Workspace-prefix-based allowlist. Real Keycloak group paths look like
// `/kineo/leadership`, `/medtheris/sales`, `/corehub/dev-ops`, but a user can
// also be a top-level member (e.g. just `/corehub`). Both must grant access.
// Per-workspace tenant access is enforced separately by
// `userHasWorkspaceAccess`.
const SIGN_GROUPS = (process.env.SIGN_ALLOWED_GROUPS ?? "/kineo,/medtheris,/corehub")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

const DEFAULT_WORKSPACE = "kineo";

export type ResolveResult =
  | { kind: "ok"; session: SignSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string }
  | { kind: "not_configured"; message: string; workspace: string };

export async function resolveSignSession(
  requestedWorkspace: string | null,
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const rawGroups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  if (!isAdmin && !isMemberOfAnyAllowedGroup(rawGroups, SIGN_GROUPS)) {
    return {
      kind: "forbidden",
      message: "Dein Account ist in keiner Gruppe, die Zugriff auf Sign hat.",
    };
  }

  const workspace = (requestedWorkspace ?? DEFAULT_WORKSPACE).toLowerCase();

  if (!userHasWorkspaceAccess(workspace, rawGroups, isAdmin)) {
    return {
      kind: "forbidden",
      message: `Dein Account hat keinen Zugriff auf den Workspace "${workspace}".`,
    };
  }

  const tenant = getSignTenant(workspace);
  if (!tenant) {
    return {
      kind: "not_configured",
      workspace,
      message: `F\u00fcr den Workspace "${workspace}" ist noch kein Documenso\u2011Team eingerichtet (DOCUMENSO_TEAM_${workspace.toUpperCase()}_TOKEN fehlt).`,
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
