import { NextRequest, NextResponse } from "next/server";
import {
  getTotalsVisible,
  listDocumentsVisible,
} from "@/lib/sign/document-portal-access";
import { getPortalPrivateOwners } from "@/lib/sign/document-privacy-store";
import {
  resolveSignSession,
  type SignSession,
} from "@/lib/sign/session";
import type { SignStatus } from "@/lib/sign/types";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID: ReadonlyArray<SignStatus> = [
  "DRAFT",
  "PENDING",
  "COMPLETED",
  "REJECTED",
];

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

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1") || 1;
  const includeTotals = req.nextUrl.searchParams.get("totals") === "1";

  const filter: SignStatus | undefined =
    status && VALID.includes(status as SignStatus)
      ? (status as SignStatus)
      : undefined;

  try {
    const privateOwners = await getPortalPrivateOwners(g.session.workspace);
    const accessCtx = {
      viewerUsername: g.session.username,
      isPortalAdmin: isAdminUsername(g.session.username),
      privateOwners,
    };
    const [list, totals] = await Promise.all([
      listDocumentsVisible(
        g.session.tenant,
        {
          status: filter,
          query: q,
          page,
        },
        accessCtx,
      ),
      includeTotals
        ? getTotalsVisible(g.session.tenant, accessCtx)
        : Promise.resolve(undefined),
    ]);
    return NextResponse.json({
      ...list,
      totals,
    });
  } catch (e) {
    console.error("[/api/sign/documents] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
