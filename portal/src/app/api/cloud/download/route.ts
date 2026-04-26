import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFile } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  try {
    const upstream = await downloadFile({
      workspace: ws,
      user: username,
      path,
      accessToken: session.accessToken,
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Nextcloud GET ${upstream.status}: ${text.slice(0, 200)}` },
        { status: upstream.status },
      );
    }
    const headers = new Headers();
    const ct = upstream.headers.get("content-type") ?? "application/octet-stream";
    headers.set("content-type", ct);
    const filename = path.split("/").pop() ?? "download";
    headers.set(
      "content-disposition",
      `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"`,
    );
    const len = upstream.headers.get("content-length");
    if (len) headers.set("content-length", len);
    return new Response(upstream.body, { headers });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
