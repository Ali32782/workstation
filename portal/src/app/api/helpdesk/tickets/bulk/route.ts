import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateTickets, type BulkPatch } from "@/lib/helpdesk/zammad";
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

/**
 * POST /api/helpdesk/tickets/bulk
 *   { ids: number[], patch: { state_id?, priority_id?, group_id?, owner_id? } }
 *
 * Returns per-ticket result so the UI can highlight what failed.
 */
export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  let body: { ids?: number[]; patch?: BulkPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || !body.ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (!body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "patch required" }, { status: 400 });
  }
  const ids = body.ids.filter((n) => Number.isFinite(n)).map(Number);
  if (!ids.length) {
    return NextResponse.json({ error: "ids invalid" }, { status: 400 });
  }
  // Cap concurrency / size to avoid runaway requests.
  if (ids.length > 200) {
    return NextResponse.json({ error: "too many ids (max 200)" }, { status: 400 });
  }
  try {
    const results = await bulkUpdateTickets(g.session.tenant, ids, body.patch);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
