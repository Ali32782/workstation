import { NextRequest, NextResponse } from "next/server";
import {
  addTicketTag,
  listTagsForTicket,
  removeTicketTag,
  suggestTags,
} from "@/lib/helpdesk/zammad";
import {
  resolveHelpdeskSession,
  type HelpdeskSession,
} from "@/lib/helpdesk/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: HelpdeskSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
  if (r.kind === "unauthenticated") {
    return { err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (r.kind === "forbidden") {
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  }
  if (r.kind === "not_configured") {
    return {
      err: NextResponse.json(
        { error: r.message, workspace: r.workspace, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  return { session: r.session };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // Optional ?suggest=… → autocomplete instead of ticket tags
  const suggest = req.nextUrl.searchParams.get("suggest");
  if (suggest != null) {
    const suggestions = await suggestTags(suggest);
    return NextResponse.json({ suggestions });
  }
  try {
    const tags = await listTagsForTicket(tid);
    return NextResponse.json({ tags });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: { tag?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.tag?.trim()) {
    return NextResponse.json({ error: "tag required" }, { status: 400 });
  }
  try {
    const tags = await addTicketTag(g.session.tenant, tid, body.tag);
    return NextResponse.json({ tags });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // Tag can come from JSON body or ?tag query param
  const qTag = req.nextUrl.searchParams.get("tag");
  let tag = qTag ?? "";
  if (!tag) {
    try {
      const body = await req.json();
      tag = (body?.tag as string) ?? "";
    } catch {
      /* allow query-only */
    }
  }
  if (!tag.trim()) {
    return NextResponse.json({ error: "tag required" }, { status: 400 });
  }
  try {
    const tags = await removeTicketTag(g.session.tenant, tid, tag);
    return NextResponse.json({ tags });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
