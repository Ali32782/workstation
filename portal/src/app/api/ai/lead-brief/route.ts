import { NextRequest, NextResponse } from "next/server";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCompany } from "@/lib/crm/twenty";
import {
  complete,
  isAnthropicConfigured,
  AnthropicError,
} from "@/lib/ai/anthropic";
import {
  readKnowledge,
  renderKnowledgeBlock,
} from "@/lib/ai/knowledge-store";
import { scrapeWebsiteSnippetForDomain } from "@/lib/ai/scrape-website-snippet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/lead-brief?ws=…
 *
 * Lead-Recherche-Brief: pulls the CRM company's known facts +
 * publicly-scraped website snippet and asks Claude for a 1-pager
 * sales briefing. Output is structured (Markdown) and includes:
 *   - Was wir wissen
 *   - Was sie wahrscheinlich brauchen (basierend auf company size,
 *     specialisations, marketing maturity)
 *   - 3 konkrete Pitch-Anker
 *   - Eisbrecher-Fragen für ein Erstgespräch
 *
 * The brief is conditioned on the workspace's WorkspaceKnowledge so
 * the pitch angles are aligned with what we actually sell, not
 * generic salesbot output.
 */

type Body = {
  companyId?: string;
  /** Optional manual website override — when the CRM domain is wrong/empty. */
  websiteOverride?: string;
};


export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "anthropic not configured", code: "not_configured" },
      { status: 503 },
    );
  }
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated")
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (r.kind === "forbidden")
    return NextResponse.json({ error: r.message }, { status: 403 });
  if (r.kind === "not_configured")
    return NextResponse.json(
      { error: r.message, code: "not_configured" },
      { status: 503 },
    );

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = (body.companyId ?? "").trim();
  if (!companyId)
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 },
    );

  let company;
  try {
    company = await getCompany(r.session.tenant, companyId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!company)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Resolve website: override > CRM domain > nothing.
  const websiteCandidate =
    (body.websiteOverride ?? "").trim() ||
    (company.domain ?? "").trim() ||
    "";
  const {
    snippet: website,
    normalizedUrl,
  } = await scrapeWebsiteSnippetForDomain(websiteCandidate || undefined);

  const knowledge = ws
    ? await readKnowledge(ws).catch(() => null)
    : null;
  const knowledgeBlock = knowledge ? renderKnowledgeBlock(knowledge) : "";

  const facts = [
    company.name && `Firma: ${company.name}`,
    company.city && `Ort: ${company.city}`,
    company.country && `Land: ${company.country}`,
    company.domain && `Webseite: ${company.domain}`,
    company.phone && `Telefon: ${company.phone}`,
    company.generalEmail && `Email: ${company.generalEmail}`,
    company.employeeCountPhysio &&
      `Therapeut*innen: ${company.employeeCountPhysio}`,
    company.googleRating &&
      `Google-Rating: ${company.googleRating}` +
        (company.googleReviewCount
          ? ` (${company.googleReviewCount} Reviews)`
          : ""),
    company.bookingSystem && `Buchungs-System: ${company.bookingSystem}`,
    company.specializations &&
      `Spezialisierungen: ${company.specializations}`,
    company.languages && `Sprachen: ${company.languages}`,
    company.leadSource && `Lead-Quelle: ${company.leadSource}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Du bist Sales-Researcher für ein B2B-SaaS-Unternehmen.",
    "Aufgabe: Erstelle einen kompakten Lead-Recherche-Brief in Markdown,",
    "max. 380 Wörter, in vier Sektionen (jeweils mit ## Heading):",
    "## Was wir wissen",
    "## Wahrscheinlicher Bedarf",
    "## Pitch-Anker (3 Bulletpoints)",
    "## Eisbrecher-Fragen (3 Bulletpoints)",
    "Schreibe auf Deutsch (Sie-Form), faktenbasiert und konkret.",
    "Wenn ein Fakt fehlt, sag das offen — keine Erfindungen.",
    knowledgeBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = [
    "## CRM-Fakten",
    facts || "(Wenig Daten im CRM)",
    "",
    "## Webseiten-Snippet (auto-gescrapt)",
    website ?? "(Keine Webseite verfügbar oder nicht erreichbar)",
  ].join("\n");

  let text: string;
  try {
    text = await complete({
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 900,
      temperature: 0.5,
    });
  } catch (e) {
    if (e instanceof AnthropicError) {
      return NextResponse.json(
        { error: e.message, status: e.status },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    brief: text.trim(),
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
    },
    websiteFetched: website !== null && !!websiteCandidate,
    websiteUrl: websiteCandidate ? normalizedUrl ?? websiteCandidate : null,
    usedKnowledge: !!knowledgeBlock,
  });
}
