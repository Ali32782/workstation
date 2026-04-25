import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { uploadFileToRoom, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form-data" }, { status: 400 });
  }

  const roomId = form.get("roomId");
  const file = form.get("file");
  const msg = form.get("msg");

  if (typeof roomId !== "string" || !roomId.trim()) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size < 1) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name || "upload.bin";
  const ct = file.type || "application/octet-stream";
  const caption = typeof msg === "string" && msg.trim() ? msg.trim() : undefined;

  try {
    const message = await uploadFileToRoom(
      s.ctx.rcUserId,
      roomId,
      buf,
      name,
      ct,
      caption,
    );
    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        {
          error: `Bitte warte kurz – Chat-Server hat das Limit erreicht (in ${e.retryAfterSeconds}s erneut versuchen).`,
          rateLimited: true,
          retryAfter: e.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    console.error("[/api/chat/upload] failed:", e);
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: err }, { status: 502 });
  }
}
