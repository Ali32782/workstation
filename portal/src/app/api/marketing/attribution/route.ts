import { NextRequest, NextResponse } from "next/server";

import { resolveCrmSession } from "@/lib/crm/session";
import { hasAnyUtm } from "@/lib/marketing/attribution-types";
import {
  getCompanyAttribution,
  upsertCompanyAttribution,
} from "@/lib/marketing/attribution-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — read stored UTM / landing attribution for a CRM company.
 * Query: ws, companyId
 *
 * POST — merge attribution (first or last touch). CRM session required.
 * Body: { companyId, touch: "first"|"last", utm_*, referrer?, landingPath?, capturedAt? }
 */
export async function GET(req: NextRequest) {
  const ws = (req.nextUrl.searchParams.get("ws") ?? "medtheris").toLowerCase();
  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, code: "not_configured" },
      { status: 503 },
    );
  }

  const record = await getCompanyAttribution(r.session.workspace, companyId);
  return NextResponse.json({ attribution: record });
}

export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, code: "not_configured" },
      { status: 503 },
    );
  }

  let body: {
    companyId?: string;
    touch?: "first" | "last";
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    referrer?: string | null;
    landingPath?: string | null;
    capturedAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const companyId = (body.companyId ?? "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const touch = body.touch === "last" ? "last" : "first";

  const payload = {
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
    utm_term: body.utm_term,
    utm_content: body.utm_content,
    referrer: body.referrer,
    landingPath: body.landingPath,
    capturedAt: body.capturedAt,
  };
  if (!hasAnyUtm(payload)) {
    return NextResponse.json(
      { error: "At least one UTM field, referrer, or landingPath required" },
      { status: 400 },
    );
  }

  try {
    const record = await upsertCompanyAttribution({
      workspace: r.session.workspace,
      companyId,
      touch,
      payload,
    });
    return NextResponse.json({ attribution: record });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
