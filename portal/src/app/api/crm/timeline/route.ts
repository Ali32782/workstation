import { NextRequest, NextResponse } from "next/server";
import {
  createNoteForCompany,
  listNotesForCompany,
  listOpportunitiesForCompany,
  listTasksForCompany,
} from "@/lib/crm/twenty";
import { resolveCrmSession, type CrmSession } from "@/lib/crm/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: CrmSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const r = await resolveCrmSession(req.nextUrl.searchParams.get("ws"));
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
 * Returns the related-records bundle for the company-detail right pane:
 * notes + tasks + opportunities in a single round-trip.
 */
export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const t = g.session.tenant;
  try {
    const [notes, tasks, opportunities] = await Promise.all([
      listNotesForCompany(t, companyId).catch(() => []),
      listTasksForCompany(t, companyId).catch(() => []),
      listOpportunitiesForCompany(t, companyId).catch(() => []),
    ]);
    return NextResponse.json({ notes, tasks, opportunities });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  try {
    const note = await createNoteForCompany(
      g.session.tenant,
      companyId,
      title,
      body.body ?? "",
    );
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[/api/crm/timeline POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
