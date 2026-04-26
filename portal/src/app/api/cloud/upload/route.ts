import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const dir = req.nextUrl.searchParams.get("dir") ?? "/";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const uploaded: { path: string; name: string; size: number }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const value of form.getAll("files")) {
    if (typeof value === "string") continue;
    if (!value || typeof value !== "object" || !("arrayBuffer" in value)) continue;
    const blob = value as File | Blob;
    const ab = await blob.arrayBuffer();
    const content = Buffer.from(ab);
    if (content.length === 0) continue;
    const name = (blob as File).name || "upload.bin";
    const target = (dir.endsWith("/") ? dir : dir + "/") + name;
    try {
      await uploadFile({
        workspace: ws,
        user: username,
        path: target,
        body: content,
        contentType: blob.type || undefined,
        accessToken: session.accessToken,
      });
      uploaded.push({ path: target, name, size: content.length });
    } catch (e) {
      errors.push({ name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ uploaded, errors });
}
