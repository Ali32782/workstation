import { NextRequest, NextResponse } from "next/server";
import { createProject, deleteProject, listProjects } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveProjectsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  try {
    const projects = await listProjects(r.session.workspaceSlug);
    return NextResponse.json({ projects, workspaceSlug: r.session.workspaceSlug });
  } catch (e) {
    console.error("[/api/projects/projects] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveProjectsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  let body: { name?: string; identifier?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  let identifier = (body.identifier ?? "").trim().toUpperCase();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!identifier) {
    // Plane requires an identifier (max 12 chars, alpha). Derive from name.
    identifier = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5) || "PROJ";
  }
  try {
    const project = await createProject(r.session.workspaceSlug, {
      name,
      identifier,
      description: body.description,
    });
    return NextResponse.json({ project });
  } catch (e) {
    console.error("[/api/projects/projects POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const projectId = req.nextUrl.searchParams.get("project")?.trim() ?? "";
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
    await deleteProject(r.session.workspaceSlug, projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/projects/projects DELETE] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
