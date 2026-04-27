import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import { updateGroup } from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Patch = Partial<{
  name: string;
  active: boolean;
  emailAddressId: number | null;
  signatureId: number | null;
  note: string | null;
}>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Patch | null;
  if (!body) {
    return NextResponse.json({ error: "Body fehlt." }, { status: 400 });
  }

  const patch: Parameters<typeof updateGroup>[2] = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if ("emailAddressId" in body) {
    patch.email_address_id =
      body.emailAddressId == null ? null : Number(body.emailAddressId);
  }
  if ("signatureId" in body) {
    patch.signature_id =
      body.signatureId == null ? null : Number(body.signatureId);
  }
  if ("note" in body) {
    patch.note = body.note == null ? null : String(body.note);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Keine bekannten Felder im Patch." },
      { status: 400 },
    );
  }

  try {
    const group = await updateGroup(r.session.tenant, id, patch);
    return NextResponse.json({ group });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
