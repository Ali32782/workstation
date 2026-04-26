import { NextRequest, NextResponse } from "next/server";
import { deleteCycle, updateCycle } from "@/lib/projects/plane";
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

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;

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
  try {
    const cycle = await updateCycle(r.ok.workspaceSlug, r.ok.projectId, id, body);
    return NextResponse.json({ cycle });
  } catch (e) {
    console.error("[/api/projects/cycle PATCH] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;
  try {
    await deleteCycle(r.ok.workspaceSlug, r.ok.projectId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/projects/cycle DELETE] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
