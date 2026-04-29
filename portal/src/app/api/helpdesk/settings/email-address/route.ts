import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import { createEmailAddress } from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  email?: string;
  channelId?: number | null;
};

export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json({ error: r.message }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body fehlt." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name und E-Mail-Adresse sind Pflicht." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "E-Mail-Adresse ist ungültig." },
      { status: 400 },
    );
  }
  try {
    const created = await createEmailAddress(r.session.tenant, {
      name,
      email,
      channelId:
        body.channelId == null ? null : Number(body.channelId),
    });
    return NextResponse.json({ emailAddress: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
