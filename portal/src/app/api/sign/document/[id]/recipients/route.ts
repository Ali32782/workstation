import { NextRequest, NextResponse } from "next/server";
import {
  deleteRecipient,
  getDocument,
  replaceRecipients,
  type RecipientUpsertInput,
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
    const doc = await getDocument(g.session.tenant, id);
    return NextResponse.json({ recipients: doc.recipients });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * Replace the entire recipient list with the given inputs. The UI uses
 * this as a single "save recipients" action — adds, updates and removes
 * are diffed server-side.
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
  let body: { recipients?: RecipientUpsertInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json(
      { error: "recipients[] required" },
      { status: 400 },
    );
  }
  for (const r of body.recipients) {
    if (!r.email || !r.email.includes("@") || !r.name) {
      return NextResponse.json(
        { error: "each recipient needs email + name" },
        { status: 400 },
      );
    }
  }
  try {
    const recipients = await replaceRecipients(
      g.session.tenant,
      id,
      body.recipients,
    );
    return NextResponse.json({ recipients });
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
  const recipIdStr = req.nextUrl.searchParams.get("recipientId");
  const recipientId = recipIdStr ? Number(recipIdStr) : 0;
  if (!Number.isFinite(recipientId) || recipientId <= 0) {
    return NextResponse.json(
      { error: "recipientId required" },
      { status: 400 },
    );
  }
  try {
    await deleteRecipient(g.session.tenant, recipientId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
