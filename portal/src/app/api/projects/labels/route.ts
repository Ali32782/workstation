import { NextRequest, NextResponse } from "next/server";
import { createLabel, listLabels } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Plane label CRUD scoped to a project. Used by the Issue drawer's "Issue-
 * Typ" picker to create the Story/Task/Bug/Epic labels on demand the first
 * time a user assigns one (Plane CE has no native issue-type concept).
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
    const labels = await listLabels(r.session.workspaceSlug, projectId);
    return NextResponse.json({ labels });
  } catch (e) {
    console.error("[/api/projects/labels GET] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
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
  let body: { name?: string; color?: string };
  try {
    body = (await req.json()) as { name?: string; color?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const label = await createLabel(r.session.workspaceSlug, projectId, {
      name: body.name,
      color: body.color,
    });
    return NextResponse.json({ label });
  } catch (e) {
    console.error("[/api/projects/labels POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
