import { NextRequest, NextResponse } from "next/server";
import {
  getRepo,
  listBranches,
  listCommits,
  listIssues,
  listPullRequests,
} from "@/lib/code/gitea";
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
  const ref = req.nextUrl.searchParams.get("ref") ?? undefined;
  try {
    const [info, branches, issues, pulls, commits] = await Promise.all([
      getRepo(owner, repo),
      listBranches(owner, repo).catch(() => []),
      listIssues(owner, repo, { state: "open", type: "issues" }).catch(() => []),
      listPullRequests(owner, repo, "open").catch(() => []),
      listCommits(owner, repo, ref).catch(() => []),
    ]);
    return NextResponse.json({ info, branches, issues, pulls, commits });
  } catch (e) {
    console.error("[/api/code/repo] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
