import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocument,
  distributeDocument,
  getDocument,
  listFields,
  redistributeDocument,
  repeatDocument,
} from "@/lib/sign/documenso";
import { draftSignatureCoveragePreflight } from "@/lib/sign/draft-preflight";
import {
  workspaceIdOrNull,
  deletePortalAnnotations,
  copyPortalDocumentAnnotations,
  setPortalPrivate,
  clearPortalPrivate,
  getPortalUploader,
  getPortalPrivateOwners,
  registerPortalUpload,
} from "@/lib/sign/document-privacy-store";
import { blockIfSignDocumentInaccessible } from "@/lib/sign/document-access-guard";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { resolveSignSession, type SignSession } from "@/lib/sign/session";

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
    const deny = await blockIfSignDocumentInaccessible(
      g.session.workspace,
      id,
      g.session.username,
    );
    if (deny) return deny;
    const document = await getDocument(g.session.tenant, id);
    const owners = await getPortalPrivateOwners(g.session.workspace);
    const portalPrivate = owners.has(id);
    const uploader = await getPortalUploader(g.session.workspace, id);

    let draftSendPreflight: { ok: boolean; missingSignatureFor: string[] } | undefined;
    if (document.status === "DRAFT") {
      try {
        const fields = await listFields(g.session.tenant, id);
        draftSendPreflight = draftSignatureCoveragePreflight(
          document.recipients,
          fields,
        );
      } catch {
        draftSendPreflight = {
          ok: false,
          missingSignatureFor: [],
        };
      }
    }

    return NextResponse.json({
      document: {
        ...document,
        portalPrivate,
        uploadedViaPortal: Boolean(uploader),
        draftSendPreflight,
      },
    });
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
    const deny = await blockIfSignDocumentInaccessible(
      g.session.workspace,
      id,
      g.session.username,
    );
    if (deny) return deny;
    await deleteDocument(g.session.tenant, id);
    await deletePortalAnnotations(g.session.workspace, id);
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
 *   { action: "setPortalVisibility", scope: "private" | "team" } — CoreLab-only
 *     listing scope (who sees the envelope in Sign). Requires portal upload origin
 *     to lock to yourself, unless you release a private doc you own or are admin.
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
    scope?: "private" | "team";
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
    const deny = await blockIfSignDocumentInaccessible(
      g.session.workspace,
      id,
      g.session.username,
    );
    if (deny) return deny;

    const wid = workspaceIdOrNull(g.session.workspace);
    const userLower = g.session.username.trim().toLowerCase();
    const admin = isAdminUsername(g.session.username);

    if (body.action === "setPortalVisibility") {
      if (!wid) {
        return NextResponse.json(
          { error: "Ungültiger Workspace." },
          { status: 400 },
        );
      }
      const scope = body.scope;
      if (scope !== "private" && scope !== "team") {
        return NextResponse.json(
          { error: "scope muss \"private\" oder \"team\" sein." },
          { status: 400 },
        );
      }
      if (scope === "private") {
        if (!admin) {
          const uploader = await getPortalUploader(g.session.workspace, id);
          if (!uploader || uploader !== userLower) {
            return NextResponse.json(
              {
                error:
                  "Nur Dokumente, die im Portal hochgeladen wurden, können auf „nur für mich“ gesetzt werden.",
              },
              { status: 403 },
            );
          }
        } else {
          await registerPortalUpload(wid, id, userLower);
        }
        await setPortalPrivate(wid, id, userLower);
        return NextResponse.json({ ok: true });
      }
      const owners = await getPortalPrivateOwners(g.session.workspace);
      const privOwner = owners.get(id);
      if (privOwner && !admin && privOwner !== userLower) {
        return NextResponse.json(
          { error: "Nur der Inhaber oder ein Admin kann für das Team freigeben." },
          { status: 403 },
        );
      }
      await clearPortalPrivate(g.session.workspace, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send") {
      const doc = await getDocument(g.session.tenant, id);
      if (doc.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Versand nur für Entwürfe möglich." },
          { status: 400 },
        );
      }
      const fields = await listFields(g.session.tenant, id);
      const pre = draftSignatureCoveragePreflight(doc.recipients, fields);
      if (!pre.ok) {
        return NextResponse.json(
          {
            error:
              `Bei Documenso fehlen noch Signatur-Felder auf dem PDF für: ${pre.missingSignatureFor.join(", ")}. ` +
              `Öffne „Felder & Empfänger im Editor“, platziere mindestens ein „Signatur“-Feld pro Unterzeichner, ` +
              `speichere (Senden im Editor), oder versuche danach erneut „Direkt senden“.`,
            code: "missing_signature_fields",
            missingSignatureFor: pre.missingSignatureFor,
          },
          { status: 400 },
        );
      }
      await distributeDocument(g.session.tenant, id, meta);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remind") {
      const doc = await getDocument(g.session.tenant, id);
      if (doc.status !== "PENDING") {
        return NextResponse.json(
          {
            error:
              "Erinnerungen sind nur möglich, solange das Dokument auf Unterschrift wartet (Status „Ausstehend“).",
          },
          { status: 400 },
        );
      }
      const pendingIds = doc.recipients
        .filter(
          (r) =>
            r.signingStatus === "NOT_SIGNED" &&
            r.role !== "CC" &&
            r.role !== "VIEWER",
        )
        .map((r) => r.id);
      let ids: number[];
      if (body.recipients?.length) {
        const allowed = new Set(pendingIds);
        ids = body.recipients.filter((rid) => allowed.has(rid));
        if (ids.length === 0) {
          return NextResponse.json(
            {
              error:
                "Keine der gewählten Empfänger ist noch ausstehend — Erinnerung nicht möglich.",
            },
            { status: 400 },
          );
        }
      } else {
        ids = pendingIds;
      }
      if (ids.length === 0) {
        return NextResponse.json(
          {
            error:
              "Keine ausstehenden Unterzeichner — es gibt niemanden, den wir erinnern können.",
          },
          { status: 400 },
        );
      }
      await redistributeDocument(g.session.tenant, id, ids, meta);
      return NextResponse.json({ ok: true, recipients: ids });
    }
    if (body.action === "repeat") {
      const out = await repeatDocument(g.session.tenant, id);
      if (wid) {
        await copyPortalDocumentAnnotations(wid, id, out.documentId);
      }
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
