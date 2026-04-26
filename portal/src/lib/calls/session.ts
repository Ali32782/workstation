import "server-only";
import { auth } from "@/lib/auth";
import { parseUsernameList, userHasWorkspaceAccess } from "@/lib/access-helpers";

/**
 * Calls session resolver.
 *
 * Calls are simpler than CRM/Helpdesk — there's no per-tenant external service
 * to wire up. We just need to verify the caller is authenticated AND has
 * access to the requested workspace (Keycloak group membership). Workspace
 * access is enforced server-side so a user can't list/start calls in a
 * workspace they don't belong to by tampering with the `ws` query param.
 */

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

const DEFAULT_WORKSPACE = "corehub";

export type CallsSession = {
  email: string;
  username: string;
  fullName: string;
  workspace: string;
};

export type ResolveResult =
  | { kind: "ok"; session: CallsSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string };

export async function resolveCallsSession(
  requestedWorkspace: string | null = null,
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const rawGroups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  const workspace = (requestedWorkspace ?? DEFAULT_WORKSPACE).toLowerCase();

  if (!userHasWorkspaceAccess(workspace, rawGroups, isAdmin)) {
    return {
      kind: "forbidden",
      message: `Dein Account hat keinen Zugriff auf den Workspace "${workspace}".`,
    };
  }

  return {
    kind: "ok",
    session: {
      email: session.user.email,
      username: session.user.username ?? "",
      fullName: session.user.name ?? "",
      workspace,
    },
  };
}
