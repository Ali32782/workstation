import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  complete,
  isAnthropicConfigured,
  AnthropicError,
} from "@/lib/ai/anthropic";
import {
  readKnowledge,
  renderKnowledgeBlock,
  renderSignature,
} from "@/lib/ai/knowledge-store";
import { userHasWorkspaceAccess, parseUsernameList } from "@/lib/access-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_USERS = parseUsernameList(
  process.env.PORTAL_ADMIN_USERNAMES,
  "ali,johannes",
);

/**
 * POST /api/ai/email-draft
 *
 * Body:
 *   {
 *     intent: string;          // freie "schreibe X"-Anweisung
 *     context?: {
 *       senderName?: string;   // für Signatur
 *       recipientName?: string;
 *       recipientEmail?: string;
 *       companyName?: string;
 *       previousMessage?: string;  // wenn Reply: der Original-Inhalt
 *     };
 *     language?: "de" | "en";  // Default: de
 *     tone?: "freundlich" | "formell" | "kurz"; // Default: freundlich
 *   }
 *
 * Returns: { subject: string, body: string }
 *
 * Used by:
 *   - Mail-Compose: "Entwurf mit AI" — der Operator gibt ein Intent ein,
 *     bekommt subject+body vorgeschlagen, kann frei editieren bevor
 *     gesendet wird.
 *   - CRM-Detail: "Erstmail an …" — füllt subject+body für die mailto-
 *     QuickAction (perspektivisch direkt in den Mail-Compose-Deeplink).
 */
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

  let body: {
    intent?: string;
    workspace?: string;
    context?: {
      senderName?: string;
      recipientName?: string;
      recipientEmail?: string;
      companyName?: string;
      previousMessage?: string;
    };
    language?: "de" | "en";
    tone?: "freundlich" | "formell" | "kurz";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const intent = (body.intent ?? "").trim();
  if (!intent) {
    return NextResponse.json({ error: "intent required" }, { status: 400 });
  }
  const language = body.language ?? "de";
  const tone = body.tone ?? "freundlich";
  const ctx = body.context ?? {};

  const senderName =
    ctx.senderName ?? session.user.name ?? session.user.email ?? "—";

  const langLabel = language === "de" ? "Deutsch" : "Englisch";

  // Optional workspace knowledge — silently skipped if no workspace passed
  // or the user has no access. Keeps the legacy callers (no `workspace`
  // field) working as before.
  let knowledgeBlock = "";
  let signature = "";
  if (body.workspace) {
    const ws = body.workspace.toLowerCase();
    const username = (session.user.username ?? "").toLowerCase();
    const isAdmin = ADMIN_USERS.includes(username);
    const groups = (session.groups ?? []) as string[];
    if (userHasWorkspaceAccess(ws, groups, isAdmin)) {
      const knowledge = await readKnowledge(ws);
      knowledgeBlock = renderKnowledgeBlock(knowledge);
      signature = renderSignature(knowledge);
    }
  }

  const systemBase =
    `Du schreibst E-Mails im Auftrag von ${senderName}. ` +
    `Sprache: ${langLabel}. Tonalität: ${tone}. ` +
    "Antworte ausschliesslich mit einem JSON-Objekt mit den Feldern " +
    `"subject" (kurz, prägnant, ≤80 Zeichen) und "body" (Plaintext, ` +
    "Anrede, 2-4 kurze Absätze, Grußformel, keine Markdown-Codefences). " +
    "Verzichte auf übertriebene Werbesprache, halte den Text " +
    "natürlich und professionell. Erfinde keine Preise, Termine oder " +
    "Personennamen; wenn dir Information fehlt, formuliere eine Rückfrage.";

  const system =
    [
      systemBase,
      knowledgeBlock
        ? "\nNutze die folgende Wissensbasis als Quelle der Wahrheit:\n" +
          knowledgeBlock
        : "",
      signature
        ? "\nPflicht-Signatur (1:1 unter den Body setzen):\n" + signature
        : "",
    ]
      .filter(Boolean)
      .join("\n");

  const ctxLines: string[] = [];
  if (ctx.recipientName) ctxLines.push(`Empfänger:in: ${ctx.recipientName}`);
  if (ctx.recipientEmail) ctxLines.push(`Empfänger-Email: ${ctx.recipientEmail}`);
  if (ctx.companyName) ctxLines.push(`Firma: ${ctx.companyName}`);
  if (ctx.previousMessage) {
    ctxLines.push(`\n--- Vorgängige Nachricht ---\n${ctx.previousMessage.slice(0, 4000)}\n--- Ende ---`);
  }
  const ctxBlock = ctxLines.length > 0 ? "\n\nKontext:\n" + ctxLines.join("\n") : "";

  const prompt = `Aufgabe: ${intent}${ctxBlock}\n\nFormat: {"subject": "...", "body": "..."}`;

  try {
    const raw = await complete({
      system,
      messages: [{ role: "user", content: prompt }],
      jsonOnly: true,
      maxTokens: 1500,
      temperature: 0.6,
    });
    type Result = { subject?: string; body?: string };
    let parsed: Result = {};
    try {
      parsed = JSON.parse(raw) as Result;
    } catch {
      return NextResponse.json(
        { error: "model returned invalid JSON", raw },
        { status: 502 },
      );
    }
    return NextResponse.json({
      subject: (parsed.subject ?? "").trim(),
      body: (parsed.body ?? "").trim(),
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
