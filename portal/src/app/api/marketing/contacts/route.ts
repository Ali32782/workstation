import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { listContacts, upsertContact } from "@/lib/marketing/mautic";

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
  const search = req.nextUrl.searchParams.get("q") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const start = Number(req.nextUrl.searchParams.get("start") ?? "0");
  const segmentRaw = req.nextUrl.searchParams.get("segment");
  const segmentId = segmentRaw ? Number(segmentRaw) : undefined;
  try {
    const result = await listContacts({ search, limit, start, segmentId });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/marketing/contacts] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  let body: {
    email?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    city?: string;
    country?: string;
    tags?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  try {
    const contact = await upsertContact({ ...body, email });
    return NextResponse.json({ contact });
  } catch (e) {
    console.error("[/api/marketing/contacts POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
