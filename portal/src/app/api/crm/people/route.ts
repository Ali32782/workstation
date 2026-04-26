import { NextRequest, NextResponse } from "next/server";
import {
  createPerson,
  deletePerson,
  getPerson,
  listPeople,
  updatePerson,
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

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const id = req.nextUrl.searchParams.get("id");
  const companyId = req.nextUrl.searchParams.get("companyId") ?? undefined;
  const search = req.nextUrl.searchParams.get("q") ?? undefined;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  try {
    if (id) {
      const person = await getPerson(g.session.tenant, id);
      if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ person });
    }
    const result = await listPeople(g.session.tenant, { companyId, search, cursor });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/crm/people] failed:", e);
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
    firstName?: string;
    lastName?: string;
    email?: string;
    companyId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.firstName?.trim() && !body.lastName?.trim()) {
    return NextResponse.json(
      { error: "firstName or lastName required" },
      { status: 400 },
    );
  }
  try {
    const person = await createPerson(g.session.tenant, {
      name: {
        firstName: (body.firstName ?? "").trim(),
        lastName: (body.lastName ?? "").trim(),
      },
      ...(body.email
        ? { emails: { primaryEmail: body.email.trim() } }
        : {}),
      ...(body.companyId ? { companyId: body.companyId } : {}),
    });
    return NextResponse.json({ person });
  } catch (e) {
    console.error("[/api/crm/people POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const person = await updatePerson(g.session.tenant, id, patch);
    return NextResponse.json({ person });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deletePerson(g.session.tenant, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
