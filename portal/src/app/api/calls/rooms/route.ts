import { NextRequest, NextResponse } from "next/server";
import { listCalls, startCall } from "@/lib/calls/store";
import { resolveCallsSession } from "@/lib/calls/session";
import type { CallContext } from "@/lib/calls/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Native calls API. Lists call records for a workspace and starts new ones.
 * The workspace is verified against the user's Keycloak group membership so
 * the `ws` param can't be used to peek into other tenants.
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCallsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  const calls = await listCalls(r.session.workspace, {
    activeOnly: scope === "active",
    limit: 200,
  });
  return NextResponse.json({ calls });
}

export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCallsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }

  let body: { subject?: string; context?: CallContext };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const summary = await startCall({
    workspaceId: r.session.workspace,
    createdBy: r.session.email,
    createdByName: r.session.fullName || r.session.email,
    subject: (body.subject ?? "").trim() || "Spontan-Call",
    context: body.context,
  });
  return NextResponse.json({ call: summary });
}
