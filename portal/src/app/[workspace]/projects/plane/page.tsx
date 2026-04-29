import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import {
  PLANE_PUBLIC_BASE,
  PLANE_WORKSPACE_SLUG_BY_CORE,
  planeWorkspaceForGroups,
} from "@/lib/plane";
import { listProjects } from "@/lib/projects/plane";
import {
  ExternalLink,
  Folders,
  ArrowLeft,
  CalendarClock,
} from "lucide-react";

/**
 * Plane Embed Hub — single destination for power-users who want to live
 * in Plane's native UI without losing the workspace-aware login flow we
 * built for the bridge route.
 *
 * Note: actually iframing Plane is blocked by its CSP (`frame-ancestors`
 * = self only on the Community Edition), so we render a *deep-link hub*
 * instead: one big "Open Plane" CTA that hits `/api/plane/sso?ws=…`
 * (which handles the deterministic password sign-in + invite-acceptance
 * dance), plus per-project shortcut cards. This pattern avoids the
 * third-party cookie storm an iframe would trigger and gives users an
 * obvious "back to native portal view" escape hatch.
 */

export const dynamic = "force-dynamic";

export default async function PlaneHubPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/${workspaceParam}/projects/plane`)}`,
    );
  }

  const groups = (session.groups ?? []) as string[];
  // Resolve which Plane workspace this user can land in. We use the same
  // logic the SSO bridge uses so the hero CTA always lines up with the
  // project list shown on the page.
  const planeSlug =
    PLANE_WORKSPACE_SLUG_BY_CORE[workspace.id] &&
    planeWorkspaceForGroups(workspace.id, groups) === PLANE_WORKSPACE_SLUG_BY_CORE[workspace.id]
      ? PLANE_WORKSPACE_SLUG_BY_CORE[workspace.id]
      : planeWorkspaceForGroups(undefined, groups);

  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let projectsError: string | null = null;
  if (planeSlug) {
    try {
      projects = await listProjects(planeSlug);
    } catch (e) {
      projectsError = e instanceof Error ? e.message : String(e);
    }
  }

  const planeBase = PLANE_PUBLIC_BASE.replace(/\/$/, "");
  const ssoHref = `/api/plane/sso?ws=${encodeURIComponent(workspace.id)}`;

  return (
    <div className="min-h-full px-6 py-6 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-2 text-[12px] text-text-tertiary">
        <Link
          href={`/${workspace.id}/projects`}
          className="inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ArrowLeft size={12} />
          Zurück zu Projekten
        </Link>
        <span className="opacity-50">·</span>
        <span>Plane-Hub</span>
      </div>

      <header
        className="rounded-xl border border-stroke-1 bg-bg-elevated p-6 mb-6"
        style={{ borderColor: workspace.accent + "40" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{
              background: `${workspace.accent}18`,
              color: workspace.accent,
            }}
          >
            <Folders size={26} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-text-primary text-xl font-semibold">
              Plane · {workspace.name}
            </h1>
            <p className="text-text-tertiary text-[13px] mt-1 leading-relaxed">
              Öffne den nativen Plane-Workspace mit automatischer Anmeldung —
              Sprints, Module, Pages, Views, alle Plane-Features ohne Login.
              Cycles &amp; Issues editierst du in der gewohnten Portal-UI unter{" "}
              <Link
                href={`/${workspace.id}/projects`}
                className="text-info hover:underline"
              >
                Projekte
              </Link>
              .
            </p>
            <p className="mt-2 text-text-tertiary text-[11px]">
              Workspace-Slug:{" "}
              <code className="px-1.5 py-0.5 rounded bg-bg-base text-text-secondary">
                {planeSlug ?? "—"}
              </code>
              <span className="opacity-50 mx-2">·</span>
              Plane-URL:{" "}
              <code className="px-1.5 py-0.5 rounded bg-bg-base text-text-secondary">
                {planeBase}
              </code>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <a
              href={ssoHref}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: workspace.accent }}
            >
              Plane öffnen
              <ExternalLink size={14} />
            </a>
            <a
              href={ssoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
            >
              In neuem Tab
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </header>

      <section>
        <h2 className="text-[13px] font-semibold text-text-primary mb-3">
          Direkt zu einem Projekt
        </h2>
        {!planeSlug ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-200">
            Dein Account hat aktuell keinen Plane-Workspace, der diesem
            Portal-Workspace zugeordnet ist. Falls das ungewollt ist:
            sprich bitte mit einem Workspace-Admin.
          </div>
        ) : projectsError ? (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-300">
            Plane-Projekte konnten nicht geladen werden: {projectsError}
          </div>
        ) : projects.length === 0 ? (
          <p className="text-text-tertiary text-[12.5px]">
            Noch keine Projekte in diesem Plane-Workspace. Lege das erste
            via{" "}
            <a
              href={ssoHref}
              className="text-info hover:underline"
            >
              Plane öffnen
            </a>{" "}
            an.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((p) => {
              const issuesUrl = `${planeBase}/${planeSlug}/projects/${p.id}/issues/`;
              const cyclesUrl = `${planeBase}/${planeSlug}/projects/${p.id}/cycles/`;
              return (
                <li
                  key={p.id}
                  className="rounded-lg border border-stroke-1 bg-bg-elevated px-4 py-3 hover:border-stroke-2 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg" aria-hidden>
                      {p.emoji ?? "📁"}
                    </span>
                    <h3 className="text-text-primary text-[13.5px] font-medium truncate flex-1">
                      {p.name}
                    </h3>
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-bg-base text-text-tertiary">
                      {p.identifier}
                    </code>
                  </div>
                  {p.description && (
                    <p className="text-text-tertiary text-[12px] line-clamp-2 mb-2">
                      {p.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[11.5px]">
                    <a
                      href={issuesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:underline inline-flex items-center gap-1"
                    >
                      Issues
                      <ExternalLink size={10} />
                    </a>
                    <a
                      href={cyclesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
                    >
                      <CalendarClock size={11} />
                      Cycles
                    </a>
                    {typeof p.totalIssues === "number" && (
                      <span className="ml-auto text-text-tertiary tabular-nums">
                        {p.totalIssues} Issues
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-6 text-[11px] text-text-tertiary leading-relaxed">
        Hinweis: Wir leiten dich automatisch zur Plane-Anmeldung weiter
        und akzeptieren ausstehende Workspace-Einladungen für deine
        E-Mail. Beim ersten Aufruf erhältst du dort kein Passwort-Prompt
        — die Brücke übernimmt das im Hintergrund.
      </p>
    </div>
  );
}
