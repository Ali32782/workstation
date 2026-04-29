import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFile } from "@/lib/cloud/webdav";
import { docxToHtml } from "@/lib/office/converter";
import { CRM_MERGE_SCHEMA_VERSION } from "@/lib/office/merge-tokens";
import { PROPOSAL_PRESETS_VERSION } from "@/lib/office/proposal-presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOCS_PREFIX = "/Documents";
const MAX_BYTES = 8 * 1024 * 1024;

function isSafeProposalPath(p: string): boolean {
  if (!p.startsWith("/") || p.includes("..")) return false;
  return p === DOCS_PREFIX || p.startsWith(`${DOCS_PREFIX}/`);
}

/**
 * Load a merge template from Nextcloud under `/Documents`: `.docx` (via mammoth)
 * or raw `.html`/`.htm`. Returns HTML suitable for `/api/office/word-merge`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const path = (req.nextUrl.searchParams.get("path") ?? "").trim();
  if (!path || !isSafeProposalPath(path)) {
    return NextResponse.json(
      {
        error:
          "Ungültiger Pfad — Vorlagen müssen unter /Documents liegen (keine ..).",
      },
      { status: 400 },
    );
  }

  const lower = path.toLowerCase();
  if (
    !lower.endsWith(".docx") &&
    !lower.endsWith(".html") &&
    !lower.endsWith(".htm")
  ) {
    return NextResponse.json(
      { error: "Nur .docx, .html oder .htm unterstützt." },
      { status: 400 },
    );
  }

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
        { error: `Nextcloud ${upstream.status}: ${text.slice(0, 240)}` },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      );
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Datei zu groß (max. 8 MB)." },
        { status: 400 },
      );
    }

    let html: string;
    let mammothMessages: string[] | undefined;
    if (lower.endsWith(".docx")) {
      const r = await docxToHtml(buf);
      html = r.html;
      mammothMessages = r.messages.length > 0 ? r.messages : undefined;
    } else {
      html = buf.toString("utf-8");
    }

    const name = path.split("/").pop() ?? path;
    return NextResponse.json({
      html,
      path,
      name,
      crmMergeSchemaVersion: CRM_MERGE_SCHEMA_VERSION,
      proposalPresetsVersion: PROPOSAL_PRESETS_VERSION,
      mammothMessages,
    });
  } catch (e) {
    console.error("[cloud-template]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
