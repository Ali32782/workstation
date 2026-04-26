import { NextRequest, NextResponse } from "next/server";
import { listLabels, listStates, listWorkspaceMembers } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Single endpoint that returns the metadata the issue editor needs to render
 * the right sidebar (states + labels + workspace members). Keeping this in
 * one route saves the client three round-trips when switching projects.
 */
export async function GET(req: NextRequest) {
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

  const slug = r.session.workspaceSlug;
  try {
    const [states, labels, members] = await Promise.all([
      listStates(slug, projectId),
      listLabels(slug, projectId),
      listWorkspaceMembers(slug),
    ]);
    return NextResponse.json({ states, labels, members });
  } catch (e) {
    console.error("[/api/projects/states] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
