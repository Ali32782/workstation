// =============================================================================
// /api/log/client-error — sink for browser-side exceptions
//
// Called by lib/error-report.ts → reportClient. The browser cannot post to
// Sentry directly (would require shipping a public DSN that anyone can spam),
// so it forwards via this endpoint, which then enriches with the user's
// session + IP and re-emits via reportServer.
//
// Hard-limited to small payloads + rate-limited so a misbehaving page can't
// flood Loki / Sentry with tens of thousands of identical reports.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { reportServer } from "@/lib/error-report";
import { rateLimitResponse, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

type ClientPayload = {
  scope?: string;
  message?: string;
  stack?: string | null;
  digest?: string | null;
  extra?: Record<string, unknown>;
  url?: string;
  ts?: string;
};

export async function POST(req: NextRequest) {
  // 60 reports / minute / IP — generous for a tab that's actively crashing
  // (React error-boundary loop), but plenty low to neuter a malicious flood.
  const limited = rateLimitResponse(req, {
    scope: "log-client-error",
    windowMs: 60_000,
    max: 60,
  });
  if (limited) return limited;

  // Cheap belt: bound the read so we don't try to JSON.parse a 5 MB blob.
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: ClientPayload;
  try {
    body = JSON.parse(raw) as ClientPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const scope =
    typeof body.scope === "string" && body.scope.length > 0
      ? `client.${body.scope.slice(0, 80)}`
      : "client.unknown";
  const message =
    typeof body.message === "string" ? body.message.slice(0, 1000) : "(no message)";
  const stack =
    typeof body.stack === "string" ? body.stack.slice(0, 8000) : undefined;

  const err = new Error(message);
  if (stack) err.stack = stack;
  if (body.digest) (err as Error & { digest?: string }).digest = String(body.digest);

  await reportServer(err, {
    scope,
    extra: {
      url: typeof body.url === "string" ? body.url.slice(0, 500) : undefined,
      digest: body.digest ?? null,
      ip: clientIp(req),
      ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      ...(body.extra ?? {}),
    },
  });

  return NextResponse.json({ ok: true });
}
