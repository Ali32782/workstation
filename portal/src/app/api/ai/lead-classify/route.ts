import { NextRequest, NextResponse } from "next/server";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCompany } from "@/lib/crm/twenty";
import {
  complete,
  isAnthropicConfigured,
  AnthropicError,
} from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai/lead-classify?ws=…
 *
 * Body: { companyId: string }
 *
 * Loads the company from Twenty, asks Claude to classify it as
 * hot/warm/cold + a one-paragraph reasoning + a concrete next-step
 * recommendation. Output is structured JSON so the CRM can render it
 * as a small banner above the company detail and (later) batch-tag
 * companies for triage.
 *
 * The prompt is deliberately MedTheris-specific: it knows we're
 * pitching a marketing+admin platform to physio practices and that
 * "ideal customer" means group practice (>1 therapist) with bookable
 * online presence. Other workspaces will get their own prompts when
 * they grow into Claude territory.
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
    return NextResponse.json({ error: r.message }, { status: 503 });
  }

  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = body.companyId?.trim();
  if (!id) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const company = await getCompany(r.session.tenant, id);
  if (!company) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const profile = {
    name: company.name,
    domain: company.domain,
    city: company.city,
    country: company.country,
    phone: company.phone,
    email: company.generalEmail,
    ownerName: company.ownerName,
    ownerEmail: company.ownerEmail,
    employeeCountPhysio: company.employeeCountPhysio,
    googleRating: company.googleRating,
    googleReviewCount: company.googleReviewCount,
    bookingSystem: company.bookingSystem,
    leadSource: company.leadSource,
    specializations: company.specializations,
    languages: company.languages,
    icp: company.idealCustomerProfile,
  };

  const system =
    "Du bist ein Sales-Analyst bei MedTheris. MedTheris verkauft eine " +
    "Marketing-+Praxis-Admin-Plattform an Schweizer Physio-Praxen. " +
    "Ideal-Customer-Profile (ICP): Gruppenpraxis mit ≥2 Therapeut:innen, " +
    "Online-Buchungssystem, gute Google-Reviews, klare Inhaber:innen. " +
    "Klassifiziere einen Lead anhand der gegebenen Datenpunkte als " +
    "hot / warm / cold mit kurzer Begründung und einem konkreten " +
    "Next-Step-Vorschlag (max. 1 Satz, deutsch, du-Form).";

  const prompt =
    "Lead-Profil:\n" +
    JSON.stringify(profile, null, 2) +
    "\n\nGib genau dieses JSON-Schema zurück:\n" +
    `{
  "tier": "hot" | "warm" | "cold",
  "reasoning": string,
  "nextStep": string
}`;

  try {
    const raw = await complete({
      system,
      messages: [{ role: "user", content: prompt }],
      jsonOnly: true,
      maxTokens: 400,
      temperature: 0.3,
    });
    type Result = { tier?: string; reasoning?: string; nextStep?: string };
    let parsed: Result = {};
    try {
      parsed = JSON.parse(raw) as Result;
    } catch {
      return NextResponse.json(
        { error: "model returned invalid JSON", raw },
        { status: 502 },
      );
    }
    const tier =
      parsed.tier === "hot" || parsed.tier === "warm" || parsed.tier === "cold"
        ? parsed.tier
        : "warm";
    return NextResponse.json({
      tier,
      reasoning: parsed.reasoning ?? "",
      nextStep: parsed.nextStep ?? "",
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
