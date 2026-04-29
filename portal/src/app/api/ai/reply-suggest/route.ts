import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import {
  AnthropicError,
  complete,
  isAnthropicConfigured,
} from "@/lib/ai/anthropic";
import {
  readKnowledge,
  renderKnowledgeBlock,
  renderSignature,
} from "@/lib/ai/knowledge-store";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/reply-suggest
 *
 * Generates 1-3 reply variants for an incoming message in any of the
 * portal's communication channels (mail, helpdesk-ticket, sms). The model
 * is conditioned on the workspace's curated knowledge base so the tone,
 * product names, prices and signature stay consistent across all replies
 * the team sends.
 *
 * Channels:
 *   - "mail":     full email reply (subject + body, multi-paragraph)
 *   - "helpdesk": ticket-article reply (no subject, plain-text body,
 *                 typically shorter, tickets often have an SLA chip
 *                 the operator is racing)
 *   - "sms":      single-paragraph, max ~320 chars (2 SMS), no greeting
 *
 * Body:
 *   {
 *     channel: "mail" | "helpdesk" | "sms";
 *     workspace: string;                 // required for knowledge lookup
 *     incoming: {                        // the message being replied to
 *       subject?: string;
 *       from?: string;                   // "Name <email>"
 *       body: string;                    // raw text or stripped HTML
 *       receivedAt?: string;
 *     };
 *     thread?: Array<{                   // optional prior context
 *       from: string;
 *       body: string;
 *       at?: string;
 *     }>;
 *     intent?: string;                   // optional steering ("Termin
 *                                          bestätigen, fragen ob am Mi
 *                                          14:00 passt")
 *     tone?: "freundlich" | "formell" | "kurz" | "empathisch";
 *     language?: "de" | "en";
 *     variants?: 1 | 2 | 3;              // default 3
 *   }
 *
 * Returns:
 *   {
 *     variants: Array<{
 *       label: string;                   // "Kurz", "Standard", "Empathisch"
 *       subject?: string;                // mail/helpdesk only
 *       body: string;
 *     }>;
 *     usedKnowledge: string[];           // section names that were non-empty
 *     warnings: string[];                // e.g. banned-phrase hits
 *   }
 */

const ADMIN_USERS = parseUsernameList(
  process.env.PORTAL_ADMIN_USERNAMES,
  "ali,johannes",
);

type Channel = "mail" | "helpdesk" | "sms";

type Body = {
  channel?: Channel;
  workspace?: string;
  incoming?: {
    subject?: string;
    from?: string;
    body?: string;
    receivedAt?: string;
  };
  thread?: Array<{ from?: string; body?: string; at?: string }>;
  intent?: string;
  tone?: "freundlich" | "formell" | "kurz" | "empathisch";
  language?: "de" | "en";
  variants?: number;
};

type Variant = { label: string; subject?: string; body: string };

const VARIANT_LABELS: Record<Channel, string[]> = {
  mail: ["Kurz & sachlich", "Ausführlich & freundlich", "Empathisch"],
  helpdesk: ["Schnellantwort", "Standard", "Mit Lösungsschritten"],
  sms: ["Bestätigen", "Rückfrage", "Termin verschieben"],
};

function channelHints(channel: Channel): string {
  switch (channel) {
    case "mail":
      return [
        "Kanal: E-Mail-Antwort. Erwarte ein vollständiges Antwortformat:",
        "- Subject: prägnant, ≤80 Zeichen, ohne Re:-Prefix (das fügt der Mail-Client an).",
        "- Body: Plaintext mit Anrede, 2-4 kurze Absätze, Grußformel.",
        "- Falls eine Pflicht-Signatur in der Wissensbasis steht, hänge sie 1:1 unter den Body.",
      ].join("\n");
    case "helpdesk":
      return [
        "Kanal: Ticket-Antwort (Helpdesk). Format:",
        "- Subject leer lassen (Tickets haben einen festen Betreff).",
        "- Body: kurz, lösungsorientiert, knappe Anrede oder direkter Einstieg.",
        "- Falls die Frage technisch ist, gib Schritte als nummerierte Liste.",
        "- Pflicht-Signatur am Ende (nur einmal, nicht in jeder Variante variieren).",
      ].join("\n");
    case "sms":
      return [
        "Kanal: SMS. Format:",
        "- Subject leer lassen.",
        "- Body: ein Absatz, max. 320 Zeichen (2 SMS-Segmente).",
        "- Keine Grußformel, kein Header — direkt zum Kern.",
        "- Keine Signatur (zu lang für SMS).",
      ].join("\n");
  }
}

function lengthCapForChannel(channel: Channel): number {
  switch (channel) {
    case "mail":
      return 2_000;
    case "helpdesk":
      return 1_400;
    case "sms":
      return 320;
  }
}

function buildSystemPrompt(
  channel: Channel,
  language: "de" | "en",
  tone: string,
  knowledgeBlock: string,
  signature: string,
  bannedPhrases: string,
): string {
  const langLabel = language === "de" ? "Deutsch" : "Englisch";
  const lines: string[] = [
    `Du bist eine Antwort-Assistenz für ein Schweizer KMU. Sprache: ${langLabel}. Tonalität: ${tone}.`,
    "Deine Aufgabe ist, hochwertige Antwortvarianten auf eine eingehende Nachricht zu schreiben — die Operator:in wählt eine aus, editiert ggf. minimal und sendet.",
    "Antworten müssen sachlich korrekt sein. Erfinde keine Preise, Termine oder Personennamen. Wenn dir eine Information fehlt, formuliere eine Rückfrage statt zu raten.",
    channelHints(channel),
  ];
  if (knowledgeBlock) {
    lines.push(
      "\nVerwende die folgende Wissensbasis als Quelle der Wahrheit. Wenn die Frage darin steht, antworte direkt; sonst formuliere eine sinnvolle Rückfrage.",
    );
    lines.push(knowledgeBlock);
  }
  if (bannedPhrases.trim()) {
    lines.push(
      "\n### Verbotene Formulierungen / Compliance-Tabus\nFolgende Formulierungen NIEMALS verwenden:",
    );
    lines.push(bannedPhrases.trim());
  }
  if (signature && channel !== "sms") {
    lines.push(
      "\n### Pflicht-Signatur (am Ende des Bodys, exakt so):",
    );
    lines.push(signature);
  }
  lines.push(
    "\nAusgabeformat: ein einziges JSON-Objekt mit dem Feld `variants` als Array. Keine Codefences. Beispielstruktur:",
    `{ "variants": [ { "label": "Kurz", "subject": "…", "body": "…" }, { "label": "Standard", "subject": "…", "body": "…" } ] }`,
  );
  if (channel === "sms" || channel === "helpdesk") {
    lines.push("Das Feld `subject` darf weggelassen werden.");
  }
  return lines.join("\n");
}

function buildUserPrompt(
  body: Required<Pick<Body, "incoming">> & Body,
  channel: Channel,
  variantCount: number,
): string {
  const lines: string[] = [];
  if (body.intent && body.intent.trim()) {
    lines.push(`Steuerung der Operator:in: ${body.intent.trim()}`);
    lines.push("");
  }
  lines.push("--- Eingehende Nachricht ---");
  if (body.incoming.from) lines.push(`Von: ${body.incoming.from}`);
  if (body.incoming.subject) lines.push(`Betreff: ${body.incoming.subject}`);
  if (body.incoming.receivedAt)
    lines.push(`Empfangen: ${body.incoming.receivedAt}`);
  lines.push("");
  lines.push((body.incoming.body ?? "").slice(0, 6_000));

  if (body.thread && body.thread.length > 0) {
    lines.push("\n--- Bisheriger Verlauf (älteste zuerst) ---");
    for (const t of body.thread.slice(-6)) {
      lines.push(`> ${t.from ?? ""} (${t.at ?? ""})`);
      lines.push((t.body ?? "").slice(0, 1500));
      lines.push("");
    }
  }

  lines.push(
    `\nGeneriere ${variantCount} Antwort-Variante(n). Empfohlene Labels: ${VARIANT_LABELS[
      channel
    ]
      .slice(0, variantCount)
      .join(", ")}.`,
  );
  return lines.join("\n");
}

function checkBannedPhrases(text: string, banned: string): string[] {
  const phrases = banned
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p.toLowerCase()));
}

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "anthropic not configured", code: "not_configured" },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);
  const groups = (session.groups ?? []) as string[];

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const channel = body.channel;
  if (channel !== "mail" && channel !== "helpdesk" && channel !== "sms") {
    return NextResponse.json(
      { error: "channel muss mail|helpdesk|sms sein" },
      { status: 400 },
    );
  }
  const workspace = (body.workspace ?? "").toLowerCase();
  if (!workspace) {
    return NextResponse.json(
      { error: "workspace required" },
      { status: 400 },
    );
  }
  if (!userHasWorkspaceAccess(workspace, groups, isAdmin)) {
    return NextResponse.json(
      { error: `kein Zugriff auf Workspace "${workspace}"` },
      { status: 403 },
    );
  }
  const incomingBody = body.incoming?.body?.trim();
  if (!incomingBody) {
    return NextResponse.json(
      { error: "incoming.body required" },
      { status: 400 },
    );
  }

  const language = body.language === "en" ? "en" : "de";
  const tone = body.tone ?? "freundlich";
  const variantCount = Math.min(Math.max(body.variants ?? 3, 1), 3);

  const knowledge = await readKnowledge(workspace);
  const knowledgeBlock = renderKnowledgeBlock(knowledge);
  const signature = renderSignature(knowledge);

  const usedKnowledge: string[] = [];
  if (knowledge.company.trim()) usedKnowledge.push("company");
  if (knowledge.products.trim()) usedKnowledge.push("products");
  if (knowledge.tone.trim()) usedKnowledge.push("tone");
  if (knowledge.pricing.trim()) usedKnowledge.push("pricing");
  if (knowledge.faq.trim()) usedKnowledge.push("faq");
  if (knowledge.contact.trim()) usedKnowledge.push("contact");
  if (knowledge.bannedPhrases.trim()) usedKnowledge.push("bannedPhrases");
  if (knowledge.signature.trim()) usedKnowledge.push("signature");

  const system = buildSystemPrompt(
    channel,
    language,
    tone,
    knowledgeBlock,
    signature,
    knowledge.bannedPhrases,
  );
  const userPrompt = buildUserPrompt(
    {
      ...body,
      incoming: {
        subject: body.incoming?.subject,
        from: body.incoming?.from,
        body: incomingBody,
        receivedAt: body.incoming?.receivedAt,
      },
    },
    channel,
    variantCount,
  );

  let raw: string;
  try {
    raw = await complete({
      system,
      messages: [{ role: "user", content: userPrompt }],
      jsonOnly: true,
      maxTokens: 2_500,
      temperature: 0.55,
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

  type Result = { variants?: unknown };
  let parsed: Result = {};
  try {
    parsed = JSON.parse(raw) as Result;
  } catch {
    return NextResponse.json(
      { error: "model returned invalid JSON", raw: raw.slice(0, 800) },
      { status: 502 },
    );
  }
  const arr = Array.isArray(parsed.variants) ? parsed.variants : [];
  const cap = lengthCapForChannel(channel);
  const variants: Variant[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < arr.length && variants.length < variantCount; i++) {
    const v = arr[i] as { label?: unknown; subject?: unknown; body?: unknown };
    const bodyText = typeof v.body === "string" ? v.body.trim() : "";
    if (!bodyText) continue;
    const truncated =
      bodyText.length > cap
        ? bodyText.slice(0, cap).trimEnd() + " […]"
        : bodyText;
    if (truncated.length < bodyText.length) {
      warnings.push(`Variante ${i + 1} wurde auf ${cap} Zeichen gekürzt.`);
    }
    const hits = knowledge.bannedPhrases
      ? checkBannedPhrases(truncated, knowledge.bannedPhrases)
      : [];
    if (hits.length > 0) {
      warnings.push(
        `Variante ${i + 1} enthält verbotene Formulierungen: ${hits.join(", ")}`,
      );
    }
    variants.push({
      label:
        typeof v.label === "string" && v.label.trim()
          ? v.label.trim()
          : VARIANT_LABELS[channel][i] ?? `Variante ${i + 1}`,
      subject:
        channel !== "sms" && typeof v.subject === "string"
          ? v.subject.trim()
          : undefined,
      body: truncated,
    });
  }

  if (variants.length === 0) {
    return NextResponse.json(
      { error: "model returned no usable variants", raw: raw.slice(0, 800) },
      { status: 502 },
    );
  }

  void audit({
    kind: "ai",
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    workspace,
    resource: `ai.reply-suggest.${channel}`,
    action: "generate",
    details: {
      variants: variants.length,
      tone,
      language,
      knowledgeSections: usedKnowledge,
      incomingPreview: incomingBody.slice(0, 200),
    },
  });

  return NextResponse.json({ variants, usedKnowledge, warnings });
}
