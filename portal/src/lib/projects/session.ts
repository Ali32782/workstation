import "server-only";
import { auth } from "@/lib/auth";
import { planeWorkspaceForGroups, PLANE_WORKSPACE_SLUG_BY_CORE } from "@/lib/plane";

/**
 * Centralised session → Plane-workspace resolver shared by every
 * `/api/projects/*` route. The legacy SSO bridge uses the same function
 * (planeWorkspaceForGroups) so both paths agree on what the user is allowed
 * to see.
 */

export type ProjectsSession = {
  email: string;
  username: string;
  fullName: string;
  workspaceSlug: string;
};

const ADMIN_USERS = (process.env.PORTAL_ADMIN_USERNAMES ?? "ali,johannes")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export type ResolveResult =
  | { kind: "ok"; session: ProjectsSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string };

export async function resolveProjectsSession(
  requestedWorkspace: string | null,
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const groups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  let workspaceSlug: string | null = null;
  if (requestedWorkspace && PLANE_WORKSPACE_SLUG_BY_CORE[requestedWorkspace]) {
    if (isAdmin) {
      workspaceSlug = PLANE_WORKSPACE_SLUG_BY_CORE[requestedWorkspace];
    } else {
      workspaceSlug = planeWorkspaceForGroups(requestedWorkspace, groups);
    }
  } else {
    workspaceSlug = planeWorkspaceForGroups(undefined, groups);
  }

  if (!workspaceSlug) {
    return {
      kind: "forbidden",
      message:
        "Dein Account ist in keiner Keycloak-Gruppe, die einem Plane-Workspace zugeordnet ist.",
    };
  }

  return {
    kind: "ok",
    session: {
      email: session.user.email,
      username: session.user.username ?? "",
      fullName: session.user.name ?? "",
      workspaceSlug,
    },
  };
}
