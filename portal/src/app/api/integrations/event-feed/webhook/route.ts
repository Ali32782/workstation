import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendIntegrationEvent } from "@/lib/integrations/event-feed-store";
import {
  envelopeFromDocumensoWebhook,
  envelopeFromNormalizedBody,
} from "@/lib/integrations/normalize-documenso-webhook";
import { notifyRocketChatIntegrationEvent } from "@/lib/integrations/rc-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ctEq(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyGenericSecret(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return ctEq(auth.slice(7).trim(), secret);
  }
  const q = req.nextUrl.searchParams.get("token");
  return q ? ctEq(q, secret) : false;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const documensoSecret = process.env.DOCUMENSO_WEBHOOK_SECRET?.trim();
  const genericSecret = process.env.INTEGRATION_FEED_WEBHOOK_SECRET?.trim();

  const dsEnvelope = envelopeFromDocumensoWebhook(body);
  if (dsEnvelope) {
    if (!documensoSecret) {
      return NextResponse.json(
        { error: "DOCUMENSO_WEBHOOK_SECRET not configured" },
        { status: 503 },
      );
    }
    const hdr = req.headers.get("x-documenso-secret") ?? "";
    if (!ctEq(hdr, documensoSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await appendIntegrationEvent(dsEnvelope);
    void notifyRocketChatIntegrationEvent(dsEnvelope);
    return NextResponse.json({ ok: true, id: dsEnvelope.id });
  }

  if (!genericSecret) {
    return NextResponse.json(
      { error: "INTEGRATION_FEED_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }
  if (!verifyGenericSecret(req, genericSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envelope = envelopeFromNormalizedBody(body);
  if (!envelope) {
    return NextResponse.json(
      { error: "expected { workspaceId, eventType, payload? }" },
      { status: 400 },
    );
  }
  await appendIntegrationEvent(envelope);
  void notifyRocketChatIntegrationEvent(envelope);
  return NextResponse.json({ ok: true, id: envelope.id });
}
