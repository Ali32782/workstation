import { NextRequest, NextResponse } from "next/server";
import { getFile, listContents } from "@/lib/code/gitea";
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ owner: string; repo: string }> },
) {
  const { err } = await gate();
  if (err) return err;
  const { owner, repo } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const ref = req.nextUrl.searchParams.get("ref") ?? undefined;
  const mode = req.nextUrl.searchParams.get("mode") ?? "auto";

  try {
    if (mode === "file") {
      const file = await getFile(owner, repo, path, ref);
      if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ file });
    }
    const entries = await listContents(owner, repo, path, ref);
    if (entries.length === 1 && entries[0].type === "file" && entries[0].path === path) {
      // Path was actually a file, fetch its content too.
      const file = await getFile(owner, repo, path, ref);
      return NextResponse.json({ entries: [], file });
    }
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("[/api/code/repo/contents] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
