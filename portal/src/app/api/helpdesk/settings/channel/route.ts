import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import {
  createEmailAddress,
  createEmailChannel,
  type EmailChannelInput,
} from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawInbound = Partial<EmailChannelInput["inbound"]>;
type RawOutbound = Partial<EmailChannelInput["outbound"]>;

type Body = {
  groupId?: number;
  inbound?: RawInbound;
  outbound?: RawOutbound;
  /** Optional sender to create + bind to the new channel in one go. */
  sender?: { name?: string; email?: string };
};

function normalizeInbound(raw: RawInbound | undefined): EmailChannelInput["inbound"] {
  if (!raw) throw new Error("Inbound (IMAP/POP3) fehlt.");
  const adapter = raw.adapter === "pop3" ? "pop3" : "imap";
  const ssl =
    raw.ssl === "ssl" || raw.ssl === "starttls" || raw.ssl === "off"
      ? raw.ssl
      : "ssl";
  const host = String(raw.host ?? "").trim();
  const user = String(raw.user ?? "").trim();
  const password = String(raw.password ?? "");
  const port = Number(raw.port);
  if (!host || !user || !password || !Number.isFinite(port) || port <= 0) {
    throw new Error(
      "Inbound-Felder Host, Port, User und Passwort sind Pflicht.",
    );
  }
  return {
    adapter,
    host,
    port,
    user,
    password,
    ssl,
    folder: raw.folder ? String(raw.folder).trim() : undefined,
    keepOnServer: !!raw.keepOnServer,
  };
}

function normalizeOutbound(
  raw: RawOutbound | undefined,
): EmailChannelInput["outbound"] {
  if (!raw) throw new Error("Outbound (SMTP) fehlt.");
  const adapter = raw.adapter === "sendmail" ? "sendmail" : "smtp";
  if (adapter === "sendmail") {
    return {
      adapter: "sendmail",
      host: "",
      port: 0,
      user: "",
      password: "",
      ssl: "off",
    };
  }
  const ssl =
    raw.ssl === "ssl" || raw.ssl === "starttls" || raw.ssl === "off"
      ? raw.ssl
      : "starttls";
  const host = String(raw.host ?? "").trim();
  const user = String(raw.user ?? "").trim();
  const password = String(raw.password ?? "");
  const port = Number(raw.port);
  if (!host || !user || !password || !Number.isFinite(port) || port <= 0) {
    throw new Error(
      "Outbound-Felder Host, Port, User und Passwort sind Pflicht.",
    );
  }
  return { adapter: "smtp", host, port, user, password, ssl };
}

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
  const groupId = Number(body.groupId);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return NextResponse.json(
      { error: "Gruppe (groupId) fehlt oder ist ungültig." },
      { status: 400 },
    );
  }

  let input: EmailChannelInput;
  try {
    input = {
      groupId,
      inbound: normalizeInbound(body.inbound),
      outbound: normalizeOutbound(body.outbound),
    };
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  try {
    const channel = await createEmailChannel(r.session.tenant, input);
    let emailAddress: Awaited<
      ReturnType<typeof createEmailAddress>
    > | null = null;
    if (
      body.sender?.email &&
      body.sender?.name &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.sender.email.trim())
    ) {
      try {
        emailAddress = await createEmailAddress(r.session.tenant, {
          name: body.sender.name.trim(),
          email: body.sender.email.trim().toLowerCase(),
          channelId: channel.id,
        });
      } catch {
        // Channel was created — sender create is best-effort. UI will
        // re-fetch settings and the operator can add a sender manually.
      }
    }
    return NextResponse.json({ channel, emailAddress });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
