import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Create a "blank" file in Nextcloud. For text/markdown we just write an
 * empty/placeholder body. For Office-Formate (docx/xlsx/pptx) we write a
 * tiny zero-length placeholder — Collabora will treat it as a "new" file
 * and let the user start editing. Existing names are suffixed `(2)`, `(3)`…
 *
 * (We deliberately don't bundle full OOXML templates here; richdocuments
 *  bootstraps an editable doc from a 0-byte file just fine.)
 */

const TEMPLATES: Record<string, { ext: string; mime: string; body: Buffer }> = {
  doc: {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    body: Buffer.alloc(0),
  },
  sheet: {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: Buffer.alloc(0),
  },
  slides: {
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    body: Buffer.alloc(0),
  },
  text: { ext: "md", mime: "text/markdown", body: Buffer.from("# \n", "utf8") },
};

export async function POST(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    ws?: string;
    dir?: string;
    name?: string;
    kind?: keyof typeof TEMPLATES;
  };
  const ws = body.ws ?? "corehub";
  const dir = body.dir ?? "/";
  const kind = body.kind ?? "doc";
  const tpl = TEMPLATES[kind];
  if (!tpl) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  const safeName = (body.name?.trim() || `Neues Dokument`).replace(/[\\/]/g, "_");
  const name = safeName.endsWith(`.${tpl.ext}`) ? safeName : `${safeName}.${tpl.ext}`;
  const target = (dir.endsWith("/") ? dir : dir + "/") + name;

  try {
    await uploadFile({
      workspace: ws,
      user: username,
      path: target,
      body: tpl.body,
      contentType: tpl.mime,
      accessToken: session.accessToken,
    });
    return NextResponse.json({ path: target, name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
