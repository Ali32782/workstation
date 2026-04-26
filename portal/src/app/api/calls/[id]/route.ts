import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { endCall, getCall, joinCall } from "@/lib/calls/store";
import { resolveCallsSession } from "@/lib/calls/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Per-call routes.
 *
 * GET   – fetch a single call (must be in the caller's workspace).
 * PATCH – `{ action: "join" | "end", everyone?: boolean }`. Both are
 *         idempotent and safe to retry.
 *
 * The caller's workspace is taken from their Keycloak groups (admins can
 * access every workspace). We refuse to operate on a call that lives in a
 * workspace the user has no membership in so call records can't be probed
 * cross-tenant.
 */
async function gate(id: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false as const, status: 401, error: "unauthenticated" };
  }
  const call = await getCall(id);
  if (!call) {
    return { ok: false as const, status: 404, error: "not_found" };
  }
  // Verify workspace access for this call.
  const r = await resolveCallsSession(call.workspaceId);
  if (r.kind === "unauthenticated") {
    return { ok: false as const, status: 401, error: "unauthenticated" };
  }
  if (r.kind === "forbidden") {
    return { ok: false as const, status: 403, error: r.message };
  }
  return { ok: true as const, call, session: r.session };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ call: g.call });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { action?: "join" | "end"; everyone?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.action === "end") {
    const call = await endCall(id, {
      email: g.session.email,
      everyone: !!body.everyone,
    });
    if (!call) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ call });
  }
  // default: join
  const call = await joinCall(id, {
    email: g.session.email,
    displayName: g.session.fullName || g.session.email,
  });
  if (!call) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ call });
}
