import { NextRequest, NextResponse } from "next/server";
import { createCycle, listCycles } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Project-scoped cycles (Plane's term for sprints). The Jira-UI uses these for
 * the Sprint board, the Backlog "move to sprint" action, and the Roadmap.
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
  try {
    const cycles = await listCycles(r.session.workspaceSlug, projectId);
    return NextResponse.json({ cycles });
  } catch (e) {
    console.error("[/api/projects/cycles GET] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

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

  let body: {
    name?: string;
    description?: string;
    startDate?: string | null;
    endDate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const cycle = await createCycle(r.session.workspaceSlug, projectId, {
      name,
      description: body.description,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
    });
    return NextResponse.json({ cycle });
  } catch (e) {
    console.error("[/api/projects/cycles POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
