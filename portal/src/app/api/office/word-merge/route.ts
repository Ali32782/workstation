import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCompany, listCompanies } from "@/lib/crm/twenty";
import { htmlToDocxBuffer } from "@/lib/office/converter";
import {
  companyContext,
  CRM_MERGE_SCHEMA_VERSION,
  extractTokens,
  render,
  type CompanyMergeShape,
} from "@/lib/office/merge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Word Mail-Merge: render a template with `{{company.name}}` style
 * tokens against a list of CRM companies and return a ZIP of DOCX
 * files.
 *
 * Request body:
 *   {
 *     templateHtml: string,
 *     companyIds?: string[],   // explicit selection
 *     scope?: "all" | "ids",   // when "all", iterates listCompanies
 *     preview?: boolean,
 *     output?: "zip" | "docx",   // docx = single company only
 *     downloadBaseName?: string, // for output docx filename stem
 *     limit?: number             // safety cap, default 100, max 500
 *   }
 *
 * Default response: `application/zip`. With `output: "docx"` and exactly one
 * company, returns a single `.docx` (Proposal flow).
 */
export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, code: "not_configured" },
      { status: 503 },
    );
  }

  let body: {
    templateHtml?: string;
    companyIds?: string[];
    scope?: "all" | "ids";
    limit?: number;
    preview?: boolean;
    output?: "zip" | "docx";
    downloadBaseName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const templateHtml = (body.templateHtml ?? "").trim();
  if (!templateHtml) {
    return NextResponse.json(
      { error: "templateHtml required" },
      { status: 400 },
    );
  }
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 500);

  // Resolve target companies.
  const targets: CompanyMergeShape[] = [];
  try {
    if (body.scope === "all") {
      let cursor: string | null | undefined = undefined;
      while (targets.length < limit) {
        const page = await listCompanies(r.session.tenant, {
          cursor,
          limit: Math.min(100, limit - targets.length),
        });
        for (const c of page.items) targets.push(c as CompanyMergeShape);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
    } else {
      const ids = (body.companyIds ?? []).filter(Boolean).slice(0, limit);
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "companyIds (or scope=all) required" },
          { status: 400 },
        );
      }
      // Fetch in parallel but cap concurrency at 8 to stay polite to
      // Twenty's GraphQL endpoint — it rate-limits fairly aggressively.
      const concurrency = 8;
      for (let i = 0; i < ids.length; i += concurrency) {
        const slice = ids.slice(i, i + concurrency);
        const results = await Promise.all(
          slice.map((id) => getCompany(r.session.tenant, id)),
        );
        for (const c of results) {
          if (c) targets.push(c as CompanyMergeShape);
        }
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "Keine Empfänger im Scope gefunden." },
      { status: 400 },
    );
  }

  // Preview mode: render the first 3 substitutions to plain HTML so
  // the UI can show "wie wird das aussehen" before the user commits
  // to a full batch.
  if (body.preview) {
    const previews = targets.slice(0, 3).map((c) => {
      const ctx = companyContext(c);
      return {
        companyId: c.id,
        companyName: c.name,
        html: render(templateHtml, ctx, { escape: false }),
      };
    });
    return NextResponse.json({
      previews,
      total: targets.length,
      tokens: extractTokens(templateHtml),
      schemaVersion: CRM_MERGE_SCHEMA_VERSION,
    });
  }

  const output = body.output === "docx" ? "docx" : "zip";
  if (output === "docx") {
    if (targets.length !== 1) {
      return NextResponse.json(
        {
          error:
            "output=docx erfordert genau eine Firma (ein Eintrag in companyIds oder scope ohne Mehrfach-Treffer).",
        },
        { status: 400 },
      );
    }
    const c = targets[0]!;
    const html = render(templateHtml, companyContext(c), { escape: false });
    let buf: Buffer;
    try {
      buf = await htmlToDocxBuffer(html);
    } catch (e) {
      console.warn(
        `[word-merge] DOCX render failed for ${c.id}:`,
        e instanceof Error ? e.message : e,
      );
      return NextResponse.json(
        { error: "DOCX-Erzeugung fehlgeschlagen." },
        { status: 502 },
      );
    }
    const stem = (body.downloadBaseName ?? `Angebot-${c.name || c.id}`)
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 120);
    const filename = `${stem || "Angebot"}.docx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
        "X-Merge-Count": "1",
        "X-Crm-Merge-Schema": String(CRM_MERGE_SCHEMA_VERSION),
      },
    });
  }

  // Full render → ZIP
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const c of targets) {
    const ctx = companyContext(c);
    const html = render(templateHtml, ctx, { escape: false });
    let buf: Buffer;
    try {
      buf = await htmlToDocxBuffer(html);
    } catch (e) {
      console.warn(
        `[word-merge] DOCX render failed for ${c.id}:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    let base = (c.name || c.id || "Kunde")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 60);
    if (!base) base = c.id;
    let candidate = `${base}.docx`;
    let suffix = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${base} (${suffix}).docx`;
      suffix++;
    }
    usedNames.add(candidate.toLowerCase());
    zip.file(candidate, buf);
  }

  const zipBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `mail-merge-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuf.length),
      "X-Merge-Count": String(usedNames.size),
      "X-Crm-Merge-Schema": String(CRM_MERGE_SCHEMA_VERSION),
    },
  });
}
