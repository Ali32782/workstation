import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { addContactToSegment, listSegments } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveMarketingSession(ws);
  if (r.kind === "unauthenticated") {
    return { err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (r.kind === "forbidden") {
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  }
  if (r.kind === "not_configured") {
    return {
      err: NextResponse.json(
        { error: r.message, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  return { session: r.session };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  try {
    const result = await listSegments({ limit: 200 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/marketing/segments] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  let body: { contactId?: number; segmentId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const cid = Number(body.contactId);
  const sid = Number(body.segmentId);
  if (!cid || !sid) {
    return NextResponse.json(
      { error: "contactId and segmentId required" },
      { status: 400 },
    );
  }
  try {
    await addContactToSegment(cid, sid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/marketing/segments POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
