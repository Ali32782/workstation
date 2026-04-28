import { NextRequest, NextResponse } from "next/server";
import {
  addArticle,
  createTicket,
  findOpenTicketByExactTitle,
} from "@/lib/helpdesk/zammad";
import { getHelpdeskTenant } from "@/lib/helpdesk/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phonestar webhook JSON (flat keys per vendor docs). */
type PhonestarPayload = {
  event?: string;
  channel_leg?: string;
  caller?: string;
  callee?: string;
  timestamp?: string;
  sip_from?: string;
  sip_request?: string;
};

const DEFAULT_WINDOW_MIN = 240;

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.PHONESTAR_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const q = req.nextUrl.searchParams.get("token");
  const h = req.headers.get("x-phonestar-token");
  return q === secret || h === secret;
}

function synthCustomerEmail(e164: string): string {
  const digits = e164.replace(/\D/g, "") || "unknown";
  return `phonestar.${digits}@import.kineo360.work`;
}

function titleInbound(caller: string): string {
  return `Phonestar · Eingehend · ${caller}`;
}

function titleOutbound(callee: string, caller: string): string {
  return `Phonestar · Ausgehend · ${callee} · Nebenstelle ${caller}`;
}

function htmlDetail(p: PhonestarPayload): string {
  const rows = [
    ["Event", p.event ?? "—"],
    ["Richtung", p.channel_leg ?? "—"],
    ["Anrufer (E.164)", p.caller ?? "—"],
    ["Angerufene Nr.", p.callee ?? "—"],
    ["Zeitstempel", p.timestamp ?? "—"],
    ["SIP From", p.sip_from ?? "—"],
    ["SIP Request", p.sip_request ?? "—"],
  ];
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;border:1px solid #444;color:#888">${k}</td>` +
        `<td style="padding:4px 8px;border:1px solid #444">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return (
    `<p><strong>Phonestar</strong> · automatischer Anruf-Eintrag</p>` +
    `<table style="border-collapse:collapse;font-size:12px">${body}</table>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parsePayload(req: NextRequest, raw: unknown): PhonestarPayload {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PhonestarPayload;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as PhonestarPayload;
      if (j && typeof j === "object") return j;
    } catch {
      /* form body */
    }
  }
  const out: PhonestarPayload = {};
  for (const key of [
    "event",
    "channel_leg",
    "caller",
    "callee",
    "timestamp",
    "sip_from",
    "sip_request",
  ] as const) {
    const v = req.nextUrl.searchParams.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "phonestar-webhook",
    hint: "POST JSON call events with ?token= or X-Phonestar-Token",
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.PHONESTAR_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json(
      { error: "PHONESTAR_WEBHOOK_SECRET nicht gesetzt" },
      { status: 503 },
    );
  }
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const wsRaw = (process.env.PHONESTAR_HELPDESK_WORKSPACE ?? "kineo").trim();
  const tenant = getHelpdeskTenant(wsRaw);
  if (!tenant) {
    return NextResponse.json(
      {
        error: `Kein Helpdesk-Tenant für Workspace "${wsRaw}" (HELPDESK_TENANT_*_GROUPS).`,
      },
      { status: 503 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    try {
      rawBody = await req.text();
    } catch {
      rawBody = {};
    }
  }
  const p = parsePayload(req, rawBody);
  const event = (p.event ?? "").trim().toLowerCase();
  const leg = (p.channel_leg ?? "").trim().toLowerCase();
  const caller = (p.caller ?? "").trim() || "unbekannt";
  const callee = (p.callee ?? "").trim() || "unbekannt";

  const windowMin = Math.min(
    Math.max(Number(process.env.PHONESTAR_TICKET_WINDOW_MIN) || DEFAULT_WINDOW_MIN, 30),
    24 * 60,
  );

  try {
    if (event === "channel_create") {
      if (leg === "inbound") {
        const title = titleInbound(caller);
        const existing = await findOpenTicketByExactTitle(tenant, title, windowMin);
        if (existing) {
          await addArticle(tenant, existing, {
            type: "phone",
            internal: false,
            subject: "Erneuter Anruf (gleiche Kennung)",
            body:
              `<p><strong>Folge-Anruf</strong> — es existiert bereits ein offenes Ticket mit gleichem Titel im Zeitfenster.</p>` +
              htmlDetail(p),
          });
          return NextResponse.json({
            ok: true,
            action: "article_deduped_inbound",
            ticketId: existing,
          });
        }
        await createTicket(tenant, {
          title,
          body: htmlDetail(p),
          customerEmail: synthCustomerEmail(caller),
          customerName: `Tel. ${caller}`,
          internal: false,
        });
        return NextResponse.json({ ok: true, action: "ticket_created_inbound" });
      }
      if (leg === "outbound") {
        const title = titleOutbound(callee, caller);
        const existing = await findOpenTicketByExactTitle(tenant, title, windowMin);
        if (existing) {
          await addArticle(tenant, existing, {
            type: "phone",
            internal: false,
            subject: "Erneuter Anruf (gleiche Kennung)",
            body:
              `<p><strong>Folge-Anruf</strong> — es existiert bereits ein offenes Ticket mit gleichem Titel im Zeitfenster.</p>` +
              htmlDetail(p),
          });
          return NextResponse.json({
            ok: true,
            action: "article_deduped_outbound",
            ticketId: existing,
          });
        }
        await createTicket(tenant, {
          title,
          body: htmlDetail(p),
          customerEmail: synthCustomerEmail(callee),
          customerName: `Tel. ${callee}`,
          internal: false,
        });
        return NextResponse.json({ ok: true, action: "ticket_created_outbound" });
      }
      return NextResponse.json({ ok: true, action: "ignored_create_unknown_leg" });
    }

    if (event === "channel_answer") {
      const title =
        leg === "inbound"
          ? titleInbound(caller)
          : leg === "outbound"
            ? titleOutbound(callee, caller)
            : null;
      if (!title) {
        return NextResponse.json({ ok: true, action: "ignored_answer_unknown_leg" });
      }
      const id = await findOpenTicketByExactTitle(tenant, title, windowMin);
      if (!id) {
        return NextResponse.json({ ok: true, action: "no_ticket_for_answer" });
      }
      await addArticle(tenant, id, {
        type: "phone",
        internal: false,
        subject: "Anruf angenommen",
        body: `<p>Anruf <strong>angenommen</strong> (${escapeHtml(leg)})</p>${htmlDetail(p)}`,
      });
      return NextResponse.json({ ok: true, action: "article_answer", ticketId: id });
    }

    if (event === "channel_destroy") {
      const title =
        leg === "inbound"
          ? titleInbound(caller)
          : leg === "outbound"
            ? titleOutbound(callee, caller)
            : null;
      if (!title) {
        return NextResponse.json({ ok: true, action: "ignored_destroy_unknown_leg" });
      }
      const id = await findOpenTicketByExactTitle(tenant, title, windowMin);
      if (!id) {
        return NextResponse.json({ ok: true, action: "no_ticket_for_destroy" });
      }
      const callbackHint =
        leg === "inbound"
          ? `<p style="margin-top:8px;color:#b45309"><em>Hinweis:</em> Bei kurzem oder verpasstem eingehenden Anruf ggf. <strong>Rückruf</strong> veranlassen oder im Ticket nachfassen.</p>`
          : "";
      await addArticle(tenant, id, {
        type: "note",
        internal: false,
        subject: "Anruf beendet",
        body:
          `<p>Anruf <strong>beendet</strong> (${escapeHtml(leg)})</p>${htmlDetail(p)}${callbackHint}`,
      });
      return NextResponse.json({ ok: true, action: "article_destroy", ticketId: id });
    }

    return NextResponse.json({ ok: true, action: "ignored_event", event });
  } catch (e) {
    console.error("[phonestar/webhook]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
