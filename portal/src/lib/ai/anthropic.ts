import "server-only";

/**
 * Minimal Anthropic Messages client for the portal's AI features.
 *
 * We deliberately don't pull in the official `@anthropic-ai/sdk` here
 * because (a) we only need the `/v1/messages` POST and (b) keeping the
 * dependency-graph slim makes server-side hot-reload faster. If we ever
 * need streaming or tool-use we'll revisit and adopt the SDK at that
 * point — but for short JSON-mode classifications and email drafts a
 * raw fetch is plenty.
 *
 * Auth: `ANTHROPIC_API_KEY` env-var. The same key is shared with the
 * MedTheris scraper today; we'll split it per-app once we hit usage
 * tiers that justify per-team accounting.
 */

const API_BASE = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export class AnthropicError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`anthropic ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnthropicCompletionOpts = {
  /** Model slug, defaults to Claude Sonnet (latest production-ready). */
  model?: string;
  /** Max output tokens. Hard cap so a runaway prompt can't DoS the budget. */
  maxTokens?: number;
  /** System prompt; used for role-prompting. */
  system?: string;
  /** Conversation messages. */
  messages: AnthropicMessage[];
  /** Sampling temperature [0..1]. Default 0.4 — slight creativity, mostly grounded. */
  temperature?: number;
  /**
   * If true, append a JSON-only instruction to the system prompt and
   * extract the first JSON object found in the response. Caller is
   * responsible for parsing/validating with Zod or similar.
   */
  jsonOnly?: boolean;
};

export async function complete(
  opts: AnthropicCompletionOpts,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AnthropicError(500, "ANTHROPIC_API_KEY not set");

  const model = opts.model ?? "claude-sonnet-4-20250514";
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.4;

  let system = opts.system ?? "";
  if (opts.jsonOnly) {
    system =
      (system ? system + "\n\n" : "") +
      "Antworte ausschliesslich mit einem einzigen JSON-Objekt. " +
      "Keine Markdown-Codefences, kein Prosa-Vorspann, keine Nachbemerkungen.";
  }

  const r = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: opts.messages,
    }),
    // 60 s — long enough for complex drafts, short enough to fail fast
    // before the user gives up and clicks again.
    signal: AbortSignal.timeout(60_000),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AnthropicError(r.status, body);
  }

  type Response = {
    content?: Array<{ type: string; text?: string }>;
  };
  const j = (await r.json()) as Response;
  const text =
    j.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("") ?? "";

  if (opts.jsonOnly) {
    // Be tolerant of leading/trailing whitespace and stray code fences,
    // but extract the first balanced JSON object we find.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return text.slice(start, end + 1);
    }
    return text.trim();
  }
  return text.trim();
}
