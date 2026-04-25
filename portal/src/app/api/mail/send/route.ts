import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendMessage } from "@/lib/mail/smtp";
import type { MailAddress } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SendBody = {
  to: MailAddress[] | string[];
  cc?: MailAddress[] | string[];
  bcc?: MailAddress[] | string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  // JSON path only: base64 (prefer multipart `files` from the client instead).
  attachments?: Array<{ filename: string; contentType?: string; base64: string }>;
};

function parseAddrList(list: SendBody["to"] | undefined): MailAddress[] {
  if (!list) return [];
  return list.map((e) =>
    typeof e === "string"
      ? { address: e.trim() }
      : { name: e.name?.trim() || undefined, address: e.address.trim() },
  );
}

/** Strip `data:*;base64,` or whitespace so Buffer.from does not return empty. */
function normalizeBase64(s: string): string {
  const t = s.trim();
  const m = t.match(/^data:[^;]+;base64,([\s\S]+)$/i);
  if (m) return m[1]!.replace(/\s/g, "");
  return t.replace(/\s/g, "");
}

function hasPayload(body: SendBody, fileCount: number): boolean {
  return !!(
    body.subject?.trim() ||
    body.text?.trim() ||
    body.html?.trim() ||
    (body.attachments && body.attachments.length > 0) ||
    fileCount > 0
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ct = req.headers.get("content-type") ?? "";
  let body: SendBody;
  let filesFromForm: { filename: string; content: Buffer; contentType?: string }[] = [];

  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
    }
    const raw = form.get("payload");
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "payload field (JSON) required" }, { status: 400 });
    }
    try {
      body = JSON.parse(raw) as SendBody;
    } catch {
      return NextResponse.json({ error: "payload: invalid JSON" }, { status: 400 });
    }
    const files = form.getAll("files");
    for (const f of files) {
      if (typeof f === "string") continue;
      // Next/undici liefert meist `File`, in manchen Fällen nur `Blob` — `instanceof File` wäre false,
      // dann gingen bisher 0 Anhänge raus, obwohl der Client `files` mitschickt.
      if (!f || typeof f !== "object" || !("arrayBuffer" in f)) continue;
      const blob = f as File | Blob;
      const ab = await blob.arrayBuffer();
      const content = Buffer.from(ab);
      if (content.length === 0) continue;
      const nameFromFile = typeof (blob as File).name === "string" ? (blob as File).name : "";
      const filename =
        (nameFromFile && nameFromFile.trim().length > 0 ? nameFromFile : null) ?? "attachment.bin";
      const contentType = blob.type?.trim() ? blob.type : undefined;
      filesFromForm.push({ filename, content, contentType });
    }
  } else {
    try {
      body = (await req.json()) as SendBody;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
  }

  if (!hasPayload(body, filesFromForm.length)) {
    return NextResponse.json(
      { error: "Leere Nachricht — Betreff, Text oder Anhang erforderlich" },
      { status: 400 },
    );
  }

  const jsonAttachments = body.attachments?.map((a) => {
    const b64 = normalizeBase64(a.base64);
    const content = Buffer.from(b64, "base64");
    if (content.length === 0 && b64.length > 0) {
      console.warn("[mail/send] attachment decoded to 0 bytes:", a.filename);
    }
    return {
      filename: a.filename,
      contentType: a.contentType,
      content,
      contentDisposition: "attachment" as const,
    };
  });

  const fromMultipart = filesFromForm.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: a.content,
    contentDisposition: "attachment" as const,
  }));

  const allAttachments = [...(fromMultipart ?? []), ...(jsonAttachments ?? [])];

  try {
    const result = await Promise.race([
      sendMessage({
        from: email,
        fromName: session.user?.name ?? undefined,
        to: parseAddrList(body.to),
        cc: parseAddrList(body.cc),
        bcc: parseAddrList(body.bcc),
        subject: body.subject ?? "",
        text: body.text,
        html: body.html,
        inReplyTo: body.inReplyTo,
        references: body.references,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      }),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error("SMTP-Timeout (30s) — outbound Port 465 vom Hoster geblockt? Siehe Server-Setup.")),
          30_000,
        ),
      ),
    ]);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
