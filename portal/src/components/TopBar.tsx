import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  WORKSPACES,
  visibleWorkspacesForGroups,
  type Workspace,
  type WorkspaceId,
} from "@/lib/workspaces";
import { initials } from "@/lib/utils";
import { UserMenu } from "./UserMenu";

export function TopBar({
  workspace,
  user,
  isAdmin,
  groups,
}: {
  workspace: Workspace;
  user: { name: string; username?: string; email?: string };
  isAdmin?: boolean;
  /** Keycloak group paths the user is a member of (e.g. ['/corehub/dev-ops']). */
  groups?: string[];
}) {
  const visibleIds = isAdmin
    ? (Object.keys(WORKSPACES) as WorkspaceId[])
    : visibleWorkspacesForGroups(groups ?? []);
  // Always include the currently-active workspace so the switcher is never empty.
  const visibleSet = new Set<WorkspaceId>(visibleIds);
  visibleSet.add(workspace.id);
  const visibleWorkspaces = (Object.keys(WORKSPACES) as WorkspaceId[])
    .filter((id) => visibleSet.has(id))
    .map((id) => WORKSPACES[id]);

  return (
    <header className="h-16 px-5 flex items-center gap-4 bg-bg-chrome border-b border-stroke-1">
      <Link
        href={`/${workspace.id}/dashboard`}
        className="flex items-center gap-3 hover:opacity-90 transition-opacity"
      >
        <div className="relative shrink-0">
          <span
            aria-hidden
            className="absolute inset-0 rounded-md blur-md opacity-40"
            style={{ background: workspace.accent }}
          />
          <Image
            src="/branding/corehub-mark.svg"
            alt="Corehub"
            width={36}
            height={36}
            priority
            className="relative"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-text-primary text-[15px] font-semibold tracking-tight">
            Corehub Workstation
          </span>
          <span className="text-text-quaternary text-[10px] tracking-[0.16em] uppercase">
            Internal · Corehub · MedTheris · Kineo
          </span>
        </div>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 rounded-full border border-stroke-1 bg-bg-base/40 p-1">
        <span className="text-text-tertiary text-[11px] uppercase tracking-wider px-2.5">
          Workspace
        </span>
        {visibleWorkspaces.map((ws) => {
          const active = workspace.id === ws.id;
          return (
            <Link
              key={ws.id}
              href={`/${ws.id}/dashboard`}
              className="rounded-full text-xs font-medium inline-flex items-center gap-2 px-3 py-1.5 transition-all"
              style={{
                background: active ? `${ws.accent}22` : "transparent",
                color: active
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
                boxShadow: active
                  ? `inset 0 0 0 1px ${ws.accent}66`
                  : "none",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: ws.accent,
                  boxShadow: active ? `0 0 8px ${ws.accent}` : "none",
                }}
              />
              {ws.name}
            </Link>
          );
        })}
      </div>

      {isAdmin && (
        <Link
          href="/admin/onboarding"
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium px-2.5 py-1.5 border border-stroke-1 text-text-tertiary hover:text-text-primary hover:border-stroke-2 transition-colors"
          title="Onboarding-Tool: Mitglieder & Clients verwalten"
        >
          <ShieldCheck size={12} />
          Onboarding
        </Link>
      )}

      <div className="w-px h-6 bg-stroke-1" />

      <UserMenu
        name={user.name}
        username={user.username}
        email={user.email}
        avatarText={initials(user.name)}
        workspaceName={workspace.name}
      />
    </header>
  );
}
