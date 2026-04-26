import { NextRequest, NextResponse } from "next/server";
import { listRepos } from "@/lib/code/gitea";
import { resolveCodeSession } from "@/lib/code/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate() {
  const r = await resolveCodeSession();
  if (r.kind === "unauthenticated")
    return { err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (r.kind === "forbidden")
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  return {};
}

export async function GET(req: NextRequest) {
  const { err } = await gate();
  if (err) return err;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  try {
    const repos = await listRepos({ query: q });
    return NextResponse.json({ repos });
  } catch (e) {
    console.error("[/api/code/repos] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
