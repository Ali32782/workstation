import { NextRequest, NextResponse } from "next/server";
import { addComment, listComments } from "@/lib/projects/plane";
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

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;
  try {
    const comments = await listComments(r.ok.workspaceSlug, r.ok.projectId, id);
    return NextResponse.json({ comments });
  } catch (e) {
    console.error("[/api/projects/issue/comment GET] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await resolve(req);
  if ("error" in r) return r.error;

  let body: { commentHtml?: string };
  try {
    body = (await req.json()) as { commentHtml?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const commentHtml = (body.commentHtml ?? "").trim();
  if (!commentHtml) {
    return NextResponse.json({ error: "commentHtml required" }, { status: 400 });
  }
  try {
    const comment = await addComment(
      r.ok.workspaceSlug,
      r.ok.projectId,
      id,
      commentHtml,
    );
    return NextResponse.json({ comment });
  } catch (e) {
    console.error("[/api/projects/issue/comment POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
