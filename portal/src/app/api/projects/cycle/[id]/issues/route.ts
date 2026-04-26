import { NextRequest, NextResponse } from "next/server";
import {
  addIssuesToCycle,
  removeIssueFromCycle,
} from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function resolve(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) {
    return {
      error: NextResponse.json({ error: "project required" }, { status: 400 }),
    } as const;
  }
  const r = await resolveProjectsSession(ws);
  if (r.kind === "unauthenticated") {
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    } as const;
  }
  if (r.kind === "forbidden") {
    return {
      error: NextResponse.json({ error: r.message }, { status: 403 }),
    } as const;
  }
  return { ok: { workspaceSlug: r.session.workspaceSlug, projectId } } as const;
}

/**
 * Bulk-assign issues to this cycle. Plane handles the membership table itself
 * — we send a single batched call so the UI's "drag many backlog items into a
 * sprint" stays a single round-trip.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: cycleId } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;

  let body: { issueIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const ids = (body.issueIds ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "issueIds required" }, { status: 400 });
  }
  try {
    await addIssuesToCycle(r.ok.workspaceSlug, r.ok.projectId, cycleId, ids);
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error("[/api/projects/cycle/issues POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id: cycleId } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const issueId = req.nextUrl.searchParams.get("issue");
  if (!issueId) {
    return NextResponse.json({ error: "issue required" }, { status: 400 });
  }
  try {
    await removeIssueFromCycle(
      r.ok.workspaceSlug,
      r.ok.projectId,
      cycleId,
      issueId,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/projects/cycle/issues DELETE] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
