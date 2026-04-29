import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import {
  deleteEmailChannel,
  type EmailChannelInput,
  updateEmailChannel,
} from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Patch = {
  active?: boolean;
  groupId?: number;
  inbound?: Partial<EmailChannelInput["inbound"]>;
  outbound?: Partial<EmailChannelInput["outbound"]>;
};

function normalizeInbound(
  raw: Partial<EmailChannelInput["inbound"]> | undefined,
): EmailChannelInput["inbound"] | undefined {
  if (!raw) return undefined;
  const adapter = raw.adapter === "pop3" ? "pop3" : "imap";
  const ssl =
    raw.ssl === "ssl" || raw.ssl === "starttls" || raw.ssl === "off"
      ? raw.ssl
      : "ssl";
  return {
    adapter,
    host: String(raw.host ?? "").trim(),
    port: Number(raw.port ?? 0),
    user: String(raw.user ?? "").trim(),
    password: String(raw.password ?? ""),
    ssl,
    folder: raw.folder ? String(raw.folder).trim() : undefined,
    keepOnServer: !!raw.keepOnServer,
  };
}

function normalizeOutbound(
  raw: Partial<EmailChannelInput["outbound"]> | undefined,
): EmailChannelInput["outbound"] | undefined {
  if (!raw) return undefined;
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
  return {
    adapter: "smtp",
    host: String(raw.host ?? "").trim(),
    port: Number(raw.port ?? 0),
    user: String(raw.user ?? "").trim(),
    password: String(raw.password ?? ""),
    ssl,
  };
}

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

  try {
    const updated = await updateEmailChannel(r.session.tenant, id, {
      active: body.active,
      groupId:
        body.groupId == null ? undefined : Number(body.groupId),
      inbound: normalizeInbound(body.inbound),
      outbound: normalizeOutbound(body.outbound),
    });
    return NextResponse.json({ channel: updated });
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
    await deleteEmailChannel(r.session.tenant, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
