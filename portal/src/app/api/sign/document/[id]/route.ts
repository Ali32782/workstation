import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocument,
  distributeDocument,
  getDocument,
  redistributeDocument,
  repeatDocument,
} from "@/lib/sign/documenso";
import {
  resolveSignSession,
  type SignSession,
} from "@/lib/sign/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const document = await getDocument(g.session.tenant, id);
    return NextResponse.json({ document });
  } catch (e) {
    console.error(`[/api/sign/document/${idStr}] failed:`, e);
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("404") ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id: idStr } = await context.params;
  const id = parseId(idStr);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    await deleteDocument(g.session.tenant, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * Custom action verbs. Body shape:
 *   { action: "send", subject?, message? } — distribute draft to recipients
 *   { action: "remind", recipients?: number[], subject?, message? }
 *     — re-send signing emails (omit `recipients` to remind everyone
 *     still pending; pass an array of recipient ids to send a targeted
 *     reminder)
 *   { action: "repeat" } — clone the document into a new DRAFT with the
 *     same recipients, useful when a completed/rejected doc needs to be
 *     re-run. Response includes `documentId` of the new draft.
 *
 * `subject` and `message` are forwarded to Documenso's `meta` envelope —
 * if either is missing, Documenso uses the team-default email template.
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
  let body: {
    action?: string;
    recipients?: number[];
    subject?: string;
    message?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine */
  }
  const meta =
    body.subject || body.message
      ? { subject: body.subject, message: body.message }
      : undefined;
  try {
    if (body.action === "send") {
      await distributeDocument(g.session.tenant, id, meta);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remind") {
      await redistributeDocument(
        g.session.tenant,
        id,
        body.recipients,
        meta,
      );
      return NextResponse.json({ ok: true, recipients: body.recipients ?? null });
    }
    if (body.action === "repeat") {
      const out = await repeatDocument(g.session.tenant, id);
      return NextResponse.json({ ok: true, documentId: out.documentId });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
