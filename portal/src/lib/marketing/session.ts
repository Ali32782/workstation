import "server-only";
import { auth } from "@/lib/auth";
import {
  isMemberOfAnyAllowedGroup,
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import { isMauticConfigured } from "./mautic";

/**
 * Multi-tenant marketing-session resolver. Pattern matches `/lib/crm/session.ts`
 * but for Mautic. Mautic itself is single-tenant (one DB, one set of campaigns)
 * so the only workspace currently exposing /marketing is `medtheris`. Other
 * workspaces hit a "not_configured" path with a friendly empty state.
 */

const MARKETING_GROUPS = (process.env.MARKETING_ALLOWED_GROUPS ?? "/kineo,/medtheris")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MARKETING_WORKSPACES = (process.env.MARKETING_WORKSPACES ?? "medtheris")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_USERS = parseUsernameList(process.env.PORTAL_ADMIN_USERNAMES, "ali,johannes");

export type MarketingSession = {
  email: string;
  username: string;
  fullName: string;
  workspace: string;
};

export type ResolveMarketingResult =
  | { kind: "ok"; session: MarketingSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; message: string }
  | { kind: "not_configured"; message: string; workspace: string };

export async function resolveMarketingSession(
  requestedWorkspace: string | null,
): Promise<ResolveMarketingResult> {
  const session = await auth();
  if (!session?.user?.email) return { kind: "unauthenticated" };

  const rawGroups = (session.groups ?? []) as string[];
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);

  if (!isAdmin && !isMemberOfAnyAllowedGroup(rawGroups, MARKETING_GROUPS)) {
    return {
      kind: "forbidden",
      message: "Dein Account ist in keiner Gruppe, die Zugriff auf Marketing hat.",
    };
  }

  const workspace = (requestedWorkspace ?? "medtheris").toLowerCase();

  if (!userHasWorkspaceAccess(workspace, rawGroups, isAdmin)) {
    return {
      kind: "forbidden",
      message: `Dein Account hat keinen Zugriff auf den Workspace "${workspace}".`,
    };
  }

  if (!MARKETING_WORKSPACES.includes(workspace)) {
    return {
      kind: "not_configured",
      workspace,
      message: `Für den Workspace "${workspace}" ist Marketing/Mautic nicht aktiviert.`,
    };
  }

  if (!isMauticConfigured()) {
    return {
      kind: "not_configured",
      workspace,
      message:
        "Mautic ist deployt, aber es ist noch kein Service-Account hinterlegt (MAUTIC_API_USERNAME / MAUTIC_API_TOKEN fehlen). Bitte Bridge-Token in Mautic anlegen und in der .env eintragen.",
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
