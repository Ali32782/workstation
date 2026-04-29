import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import {
  type EmailChannelInput,
  verifyEmailInbound,
  verifyEmailOutbound,
} from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  inbound?: Partial<EmailChannelInput["inbound"]>;
  outbound?: Partial<EmailChannelInput["outbound"]>;
  fromEmail?: string;
};

export async function POST(req: NextRequest) {
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
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body fehlt." }, { status: 400 });
  }

  const out: {
    inbound?: { ok: boolean; message?: string };
    outbound?: { ok: boolean; message?: string };
  } = {};
  if (body.inbound) {
    const inb: EmailChannelInput["inbound"] = {
      adapter: body.inbound.adapter === "pop3" ? "pop3" : "imap",
      host: String(body.inbound.host ?? "").trim(),
      port: Number(body.inbound.port ?? 0),
      user: String(body.inbound.user ?? "").trim(),
      password: String(body.inbound.password ?? ""),
      ssl:
        body.inbound.ssl === "off" || body.inbound.ssl === "starttls"
          ? body.inbound.ssl
          : "ssl",
      folder: body.inbound.folder ? String(body.inbound.folder) : undefined,
      keepOnServer: !!body.inbound.keepOnServer,
    };
    const res = await verifyEmailInbound(inb);
    out.inbound = res.ok
      ? { ok: true }
      : { ok: false, message: res.message };
  }
  if (body.outbound) {
    const adapter = body.outbound.adapter === "sendmail" ? "sendmail" : "smtp";
    const otb: EmailChannelInput["outbound"] =
      adapter === "sendmail"
        ? {
            adapter: "sendmail",
            host: "",
            port: 0,
            user: "",
            password: "",
            ssl: "off",
          }
        : {
            adapter: "smtp",
            host: String(body.outbound.host ?? "").trim(),
            port: Number(body.outbound.port ?? 0),
            user: String(body.outbound.user ?? "").trim(),
            password: String(body.outbound.password ?? ""),
            ssl:
              body.outbound.ssl === "ssl" || body.outbound.ssl === "off"
                ? body.outbound.ssl
                : "starttls",
          };
    const res = await verifyEmailOutbound(
      otb,
      String(body.fromEmail ?? "").trim() || "noreply@example.com",
    );
    out.outbound = res.ok
      ? { ok: true }
      : { ok: false, message: res.message };
  }
  return NextResponse.json(out);
}
