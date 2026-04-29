import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";
import { complete, isAnthropicConfigured } from "@/lib/ai/anthropic";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * AI mail triage — classifies a batch of inbox messages into priority
 * buckets so the user can spot what actually matters in 5 seconds
 * instead of skimming 80 unread mails.
 *
 * Buckets (chosen to match the daily inbox-zero workflow):
 *   urgent    → reply today, customer/partner waiting
 *   needs-action → respond/decide this week, but not today
 *   fyi       → newsletters, notifications, internal status
 *   spam      → noise / promo / suspicious
 *
 * We send a single batched prompt with up to 40 messages per call so
 * one click classifies the whole inbox at once. The model returns a
 * compact JSON array; we map by uid+folder so the client can just
 * merge into its existing list state.
 */

type TriageInput = {
  uid: number;
  folder: string;
  subject: string;
  from: string;
  preview: string;
  date: string;
};

type TriageBucket = "urgent" | "needs-action" | "fyi" | "spam";

type TriageOutput = {
  uid: number;
  folder: string;
  bucket: TriageBucket;
  reason: string;
};

const SYSTEM = `Du bist eine Inbox-Triage-Assistenz für ein Schweizer KMU
(MedTheris / Kineo360 — Sales, Marketing, Internal Operations).
Klassifiziere jede Mail in genau einen Bucket:
  - "urgent":       Kunde/Partner wartet auf Antwort heute, Termin heute,
                    Vertrag/Angebot/Rechnung mit Frist, Eskalation.
  - "needs-action": Antwort/Entscheidung diese Woche nötig, aber nicht heute.
                    Lead-Anfrage, Follow-up, Bewerbung, Termin-Anfrage > 24 h.
  - "fyi":          Newsletter, Notifications, interne Status-Updates,
                    Read-only-Infos, GitHub/Slack-Digest, Calendly-Bestätigung.
  - "spam":         Werbung, Cold-Outreach ohne Bezug, Phishing-Verdacht,
                    automatische Marketing-Mails ohne Personalisierung.

Faustregeln:
  - Mails von "noreply@", "newsletter@", "info@<saas>.com" → fast immer "fyi".
  - Persönliche Anfrage mit konkreter Frage → mindestens "needs-action".
  - Frist heute / morgen / "asap" / "dringend" → "urgent".
  - Im Zweifel "needs-action" statt "urgent" wählen — false-positive
    "urgent" ist nerviger als false-negative.

Begründung in 1 kurzem deutschen Satz (max. 80 Zeichen).`;

function buildUserPrompt(items: TriageInput[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = items.map((m, i) => {
    const subj = (m.subject || "(kein Betreff)").slice(0, 140);
    const from = (m.from || "").slice(0, 90);
    const preview = (m.preview || "").replace(/\s+/g, " ").slice(0, 240);
    const date = m.date.slice(0, 10);
    return `[${i}] uid=${m.uid} folder=${m.folder}\nfrom: ${from}\ndate: ${date}\nsubject: ${subj}\npreview: ${preview}`;
  });
  return `Heutiges Datum: ${today}.

${lines.join("\n\n")}

Antworte mit einem JSON-Objekt:
{ "items": [
    { "uid": <number>, "folder": "<string>",
      "bucket": "urgent" | "needs-action" | "fyi" | "spam",
      "reason": "<kurzer Grund>" }
  ]
}
Genau ein Eintrag pro Eingabe-Mail, in derselben Reihenfolge.`;
}

const VALID_BUCKETS: ReadonlyArray<TriageBucket> = [
  "urgent",
  "needs-action",
  "fyi",
  "spam",
];

function isBucket(x: unknown): x is TriageBucket {
  return typeof x === "string" && (VALID_BUCKETS as readonly string[]).includes(x);
}

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ai_not_configured", message: "ANTHROPIC_API_KEY fehlt" },
      { status: 503 },
    );
  }

  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  // Hard-cap so one click can't burn the whole API budget. 40 mails
  // covers a typical morning inbox; if there are more, the client
  // batches multiple calls.
  const items: TriageInput[] = (body.messages as unknown[])
    .slice(0, 40)
    .map((raw): TriageInput | null => {
      if (!raw || typeof raw !== "object") return null;
      const m = raw as Record<string, unknown>;
      const uid = Number(m.uid);
      if (!Number.isFinite(uid)) return null;
      return {
        uid,
        folder: typeof m.folder === "string" ? m.folder : "INBOX",
        subject: typeof m.subject === "string" ? m.subject : "",
        from: typeof m.from === "string" ? m.from : "",
        preview: typeof m.preview === "string" ? m.preview : "",
        date: typeof m.date === "string" ? m.date : "",
      };
    })
    .filter((x): x is TriageInput => x !== null);

  if (items.length === 0) {
    return NextResponse.json({ items: [] });
  }

  let raw: string;
  try {
    raw = await complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(items) }],
      maxTokens: 2048,
      temperature: 0.1,
      jsonOnly: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "ai_unparseable", raw: raw.slice(0, 400) },
      { status: 502 },
    );
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    return NextResponse.json(
      { error: "ai_unparseable", raw: raw.slice(0, 400) },
      { status: 502 },
    );
  }

  const seenKeys = new Set<string>();
  const out: TriageOutput[] = [];
  for (const it of parsed.items as unknown[]) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const uid = Number(o.uid);
    const folder = typeof o.folder === "string" ? o.folder : "INBOX";
    if (!Number.isFinite(uid)) continue;
    const bucket = isBucket(o.bucket) ? o.bucket : "needs-action";
    const reason = typeof o.reason === "string" ? o.reason.slice(0, 200) : "";
    const key = `${folder}#${uid}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({ uid, folder, bucket, reason });
  }

  // Fall back to "needs-action" for anything the model dropped, so the
  // client always gets a verdict for every input — null state is the
  // worst UX in a triage view.
  for (const m of items) {
    const key = `${m.folder}#${m.uid}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      out.push({
        uid: m.uid,
        folder: m.folder,
        bucket: "needs-action",
        reason: "Kein Klassifikator-Output, manuell prüfen",
      });
    }
  }

  const counts = {
    urgent: out.filter((x) => x.bucket === "urgent").length,
    needsAction: out.filter((x) => x.bucket === "needs-action").length,
    fyi: out.filter((x) => x.bucket === "fyi").length,
    spam: out.filter((x) => x.bucket === "spam").length,
    total: out.length,
  };

  void audit({
    kind: "ai.mail_triage",
    actorEmail: session?.user?.email ?? null,
    actorName: session?.user?.name ?? null,
    action: "classify",
    details: counts,
  });

  return NextResponse.json({ items: out, counts });
}
