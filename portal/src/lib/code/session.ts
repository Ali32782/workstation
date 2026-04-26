import "server-only";
import { auth } from "@/lib/auth";
import { isMemberOfAnyAllowedGroup, parseUsernameList } from "@/lib/access-helpers";

export type CodeSession = {
  email: string;
  username: string;
  fullName: string;
};

// Workspace-prefix-based allowlist. Real Keycloak group paths look like
// `/kineo/leadership`, `/medtheris/sales`, `/corehub/dev-ops`. Top-level
// memberships (`/corehub`) are also accepted.
const ALLOWED_GROUPS = (
  process.env.CODE_ALLOWED_GROUPS ?? "/kineo,/medtheris,/corehub"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

export type ResolveResult =
  | { kind: "ok"; session: CodeSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string };

export async function resolveCodeSession(): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const groups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  if (!isAdmin && !isMemberOfAnyAllowedGroup(groups, ALLOWED_GROUPS)) {
    return {
      kind: "forbidden",
      message: "Dein Account ist in keiner Gruppe, die Zugriff auf Code hat.",
    };
  }

  return {
    kind: "ok",
    session: {
      email: session.user.email,
      username: session.user.username ?? "",
      fullName: session.user.name ?? "",
    },
  };
}
