import { NextRequest, NextResponse } from "next/server";
import { createIssue, listIssues } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";
import { resolvePlaneMember } from "@/lib/projects/user-resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const issues = await listIssues(r.session.workspaceSlug, projectId);
    return NextResponse.json({ issues });
  } catch (e) {
    console.error("[/api/projects/issues GET] failed:", e);
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
    descriptionHtml?: string;
    state?: string;
    priority?: "urgent" | "high" | "medium" | "low" | "none";
    assignToMe?: boolean;
    assignees?: string[];
    labels?: string[];
    parent?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  let assignees = body.assignees ?? [];
  if (body.assignToMe) {
    const me = await resolvePlaneMember(r.session.workspaceSlug, r.session.email);
    if (me) assignees = Array.from(new Set([...assignees, me.id]));
  }

  try {
    const issue = await createIssue(r.session.workspaceSlug, projectId, {
      name,
      descriptionHtml: body.descriptionHtml,
      state: body.state,
      priority: body.priority,
      assignees,
      labels: body.labels,
      parent: body.parent,
    });
    return NextResponse.json({ issue });
  } catch (e) {
    console.error("[/api/projects/issues POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
