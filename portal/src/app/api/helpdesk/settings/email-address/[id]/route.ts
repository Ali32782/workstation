import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import {
  deleteEmailAddress,
  getHelpdeskSettings,
  updateEmailAddress,
} from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Patch = Partial<{ name: string; active: boolean }>;

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

  // Only allow editing email addresses that are wired into a tenant group —
  // no cross-tenant sender hijacking via raw id.
  const settings = await getHelpdeskSettings(r.session.tenant);
  const ea = settings.emailAddresses.find((e) => e.id === id);
  if (!ea || !ea.inUseByTenant) {
    return NextResponse.json(
      {
        error:
          "Diese Absender-Adresse ist keiner Gruppe dieses Workspaces zugeordnet.",
      },
      { status: 403 },
    );
  }

  const patch: Patch = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Keine bekannten Felder im Patch." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateEmailAddress(id, patch);
    return NextResponse.json({
      emailAddress: { ...updated, inUseByTenant: true },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(
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

  try {
    await deleteEmailAddress(r.session.tenant, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
