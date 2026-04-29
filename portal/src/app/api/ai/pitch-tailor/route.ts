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

const CHANNEL_HINT: Record<
  "cold_email" | "linkedin" | "followup" | "call_opener",
  string
> = {
  cold_email:
    "Ausgabe: Erst-Mail an die Hauptkontaktadresse oder generisch ohne Namen wenn unbekannt. " +
    "Struktur: Zeile \"Betreff: …\", Leerzeile, dann maximal 550 Zeichen Mail-Body. " +
    "Ton: professionell, Sie-Form, ein konkreter Nutzenbezug ohne Marketing-Übertreibung.",
  linkedin:
    "Ausgabe: maximal 620 Zeichen (LinkedIn erste Nachricht / Verbindungsanlass). Kein Spam-Deck, " +
    "keine Phrasendrescherei, ein konkreter Bezug zur Praxis/Unternehmen.",
  followup:
    "Ausgabe: Nachfass-Mail nach ohne Antwort: höflich, ein neuer konkreter Winkel, maximal 380 Wörter. " +
    "Struktur wie cold_email.",
  call_opener:
    "Ausgabe: sehr kompaktes Call-Skript: 3–6 Stichpunkte nur für dich (nichts zum Vorlesen als Floskel-Block). " +
    "Inhalt: Zweck · relevanter Haken · eine offene Frage · nächster Schritt.",
};

type Body = {
  companyId?: string;
  websiteOverride?: string;
  channel?: keyof typeof CHANNEL_HINT;
};

function buildFacts(company: NonNullable<Awaited<ReturnType<typeof getCompany>>>): string {
  return [
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
        (company.googleReviewCount ? ` (${company.googleReviewCount} Reviews)` : ""),
    company.bookingSystem && `Buchungs-System: ${company.bookingSystem}`,
    company.specializations && `Spezialisierungen: ${company.specializations}`,
    company.languages && `Sprachen: ${company.languages}`,
    company.leadSource && `Lead-Quelle: ${company.leadSource}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * POST /api/ai/pitch-tailor?ws=…
 *
 * Varianten eines Kanals-spezifischen Pitches aus denselben CRM-Fakten
 * wie der Lead-Brief, aber kürzer und copy-paste-ready.
 */
export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "anthropic not configured", code: "not_configured" },
      { status: 503 },
    );
  }
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = (body.companyId ?? "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const channel = body.channel && CHANNEL_HINT[body.channel] ? body.channel : "cold_email";

  let company;
  try {
    company = await getCompany(r.session.tenant, companyId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const websiteCandidate =
    (body.websiteOverride ?? "").trim() || (company.domain ?? "").trim() || "";
  const { snippet: website } = await scrapeWebsiteSnippetForDomain(
    websiteCandidate || undefined,
  );

  const knowledge = ws ? await readKnowledge(ws).catch(() => null) : null;
  const knowledgeBlock = knowledge ? renderKnowledgeBlock(knowledge) : "";

  const facts = buildFacts(company);

  const system = [
    "Du bist B2B-Vertriebstexter für ein Praxis-/Klinik-SaaS-Angebot (DACH).",
    CHANNEL_HINT[channel],
    "Nutze WorkspaceKnowledge wenn vorhanden — verkaufe nichts Fremdes.",
    knowledgeBlock || "Kein zusätzlicher Wissensblock.",
  ].join("\n\n");

  const userPrompt = [
    `## Gewählter Kanal: ${channel}`,
    "",
    "## CRM-Fakten",
    facts || "(Wenig Daten im CRM)",
    "",
    "## Webseiten-Kontext (auto)",
    website ?? "(Nicht erreicht oder keine Domain)",
  ].join("\n");

  try {
    const text = await complete({
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: channel === "call_opener" ? 700 : 1_000,
      temperature: 0.45,
    });
    return NextResponse.json({
      text: text.trim(),
      channel,
      company: { id: company.id, name: company.name },
      usedKnowledge: !!knowledgeBlock,
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
}
