import { NextRequest, NextResponse } from "next/server";
import {
  createIssue,
  createLabel,
  listLabels,
  listStates,
  listWorkspaceMembers,
} from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";
import {
  buildImportPreview,
  type CanonicalField,
  type IssueDraft,
} from "@/lib/projects/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bulk CSV import for the Projects ("Plane") app.
 *
 * Two modes:
 *   • `mode: "preview"` — parses the CSV and returns the preview the
 *     wizard renders without touching Plane. Cheap, side-effect-free.
 *   • `mode: "execute"` — applies the (possibly user-edited) drafts as
 *     real Plane issues. Optionally creates missing labels.
 *
 * Accepts both Jira CSV exports (Summary/Description/Status/...) and
 * Plane/Linear-style headers — the column → field mapping happens in
 * `lib/projects/import.ts`.
 */
type PreviewBody = {
  mode: "preview";
  csv: string;
  delimiter?: string;
  mappingOverride?: Record<number, CanonicalField>;
};

type ExecuteBody = {
  mode: "execute";
  drafts: IssueDraft[];
  /** When true, missing labels are created before issues are imported. */
  autoCreateLabels?: boolean;
};

type Body = PreviewBody | ExecuteBody;

export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) {
    return NextResponse.json({ error: "project required" }, { status: 400 });
  }
  const r = await resolveProjectsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.mode === "preview") {
    if (!body.csv || typeof body.csv !== "string") {
      return NextResponse.json({ error: "csv required" }, { status: 400 });
    }
    try {
      const [states, labels, members] = await Promise.all([
        listStates(r.session.workspaceSlug, projectId),
        listLabels(r.session.workspaceSlug, projectId),
        listWorkspaceMembers(r.session.workspaceSlug),
      ]);
      const preview = buildImportPreview(body.csv, {
        states,
        labels,
        members,
        mappingOverride: body.mappingOverride,
        delimiter: body.delimiter,
      });
      return NextResponse.json({
        preview,
        context: {
          stateCount: states.length,
          labelCount: labels.length,
          memberCount: members.length,
        },
      });
    } catch (e) {
      console.error("[/api/projects/import preview] failed:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  }

  if (body.mode === "execute") {
    const drafts = Array.isArray(body.drafts) ? body.drafts : [];
    if (drafts.length === 0) {
      return NextResponse.json({ error: "no drafts" }, { status: 400 });
    }
    try {
      // If the caller asked us to auto-create unknown labels, dedupe the
      // missing names across drafts and create them once before importing.
      const labelIdByName = new Map<string, string>();
      if (body.autoCreateLabels) {
        const wanted = new Set<string>();
        for (const d of drafts) {
          for (const u of d.unresolvedLabels ?? []) wanted.add(u);
        }
        for (const name of wanted) {
          try {
            const created = await createLabel(
              r.session.workspaceSlug,
              projectId,
              { name },
            );
            labelIdByName.set(name.toLowerCase(), created.id);
          } catch (err) {
            console.warn(
              "[/api/projects/import] label create failed for",
              name,
              err,
            );
          }
        }
      }

      const results: {
        rowIndex: number;
        ok: boolean;
        issueId?: string;
        sequenceId?: number;
        error?: string;
      }[] = [];

      for (const d of drafts) {
        try {
          const labelIds = [
            ...d.labels,
            ...((d.unresolvedLabels ?? [])
              .map((n) => labelIdByName.get(n.toLowerCase()))
              .filter((x): x is string => Boolean(x))),
          ];
          const issue = await createIssue(
            r.session.workspaceSlug,
            projectId,
            {
              name: d.name,
              descriptionHtml: d.descriptionHtml,
              state: d.state ?? undefined,
              priority: d.priority,
              assignees: d.assignees,
              labels: Array.from(new Set(labelIds)),
              startDate: d.startDate ?? null,
              targetDate: d.targetDate ?? null,
              estimatePoint: d.estimatePoint ?? null,
            },
          );
          results.push({
            rowIndex: d.rowIndex,
            ok: true,
            issueId: issue.id,
            sequenceId: issue.sequenceId,
          });
        } catch (e) {
          results.push({
            rowIndex: d.rowIndex,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      return NextResponse.json({
        imported: okCount,
        failed: results.length - okCount,
        results,
      });
    } catch (e) {
      console.error("[/api/projects/import execute] failed:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ error: "invalid mode" }, { status: 400 });
}
