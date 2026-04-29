import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchFiles } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Workspace-wide filename search across the user's Nextcloud tree.
 *
 * Uses Nextcloud's WebDAV SEARCH endpoint under the hood, scoped to
 * the operator's home — so share permissions are honoured and we
 * never have to filter results post-hoc.  Returns up to 50 hits sorted
 * by modification date, newest first.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ hits: [], reason: "query_too_short" });
  }
  try {
    const hits = await searchFiles({
      workspace: ws,
      user: username,
      query: q,
      limit: 50,
      accessToken: session.accessToken,
    });
    return NextResponse.json({ hits, query: q });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
