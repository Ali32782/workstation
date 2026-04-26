import { NextRequest, NextResponse } from "next/server";
import {
  createFields,
  deleteField,
  listFields,
  type FieldCreateInput,
} from "@/lib/sign/documenso";
import { resolveSignSession, type SignSession } from "@/lib/sign/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(
  req: NextRequest,
): Promise<
  | { session: SignSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveSignSession(ws);
  if (r.kind === "unauthenticated") {
    return {
      err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
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

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id: idStr } = await context.params;
  const id = parseId(idStr);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const fields = await listFields(g.session.tenant, id);
    return NextResponse.json({ fields });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * Create one or more fields. The body shape mirrors what `createFields`
 * expects, plus we accept `documentId` implicitly from the URL:
 *
 *   { fields: [{type, recipientId, page, pageX, pageY, pageWidth, pageHeight, label?}, ...] }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id: idStr } = await context.params;
  const id = parseId(idStr);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  let body: { fields?: FieldCreateInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.fields) || body.fields.length === 0) {
    return NextResponse.json({ error: "fields[] required" }, { status: 400 });
  }
  try {
    const fields = await createFields(g.session.tenant, id, body.fields);
    return NextResponse.json({ fields });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  _context: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const fieldIdStr = req.nextUrl.searchParams.get("fieldId");
  const fieldId = fieldIdStr ? Number(fieldIdStr) : 0;
  if (!Number.isFinite(fieldId) || fieldId <= 0) {
    return NextResponse.json({ error: "fieldId required" }, { status: 400 });
  }
  try {
    await deleteField(g.session.tenant, fieldId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
