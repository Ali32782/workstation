import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Per-workspace AI knowledge for reply-suggestion quality.
 *
 * The portal's reply assistants (mail, helpdesk, SMS) all condition the
 * model on a small, hand-curated knowledge bundle: who you are, what you
 * sell, your tone of voice, common Q&A and the mandatory signature.
 *
 * Persistence: a single JSON file per workspace under `${PORTAL_DATA_DIR}/
 * ai-knowledge/<workspace>.json` so it survives container rebuilds. Writes
 * are atomic (temp + rename) and the read cache is mtime-keyed for the
 * single-replica deployment.
 *
 * The shape is intentionally a flat bag of plain-text fields so the
 * editor stays trivial — no schema migrations, no markdown parsing on
 * the prompt path. If a section grows large enough to need its own page
 * we can promote it into a structured table.
 */

export type WorkspaceKnowledge = {
  workspace: string;
  /** Was macht die Firma? Kurzbeschreibung 1-3 Sätze. */
  company: string;
  /** Produkte / Services / Leistungen. Bulletpoints willkommen. */
  products: string;
  /** Ton & Stil-Vorgaben (du/Sie, Kürze, Branche-Slang etc.). */
  tone: string;
  /** Preise, Pakete, Honorar-Spannweiten — was geantwortet werden darf. */
  pricing: string;
  /** Häufige Fragen + Standardantworten. */
  faq: string;
  /** Pflicht-Signatur (wird unter jede Antwort gesetzt, wenn vorhanden). */
  signature: string;
  /** Verbotene Phrasen / no-go words / Compliance-Tabus. */
  bannedPhrases: string;
  /** Kontaktdaten für Eskalation / Hand-off. */
  contact: string;
  updatedAt: string;
  updatedBy: string;
};

export const EMPTY_KNOWLEDGE_FIELDS: Omit<
  WorkspaceKnowledge,
  "workspace" | "updatedAt" | "updatedBy"
> = {
  company: "",
  products: "",
  tone: "",
  pricing: "",
  faq: "",
  signature: "",
  bannedPhrases: "",
  contact: "",
};

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function knowledgeDir(): string {
  return path.join(dataDir(), "ai-knowledge");
}

function knowledgePath(workspace: string): string {
  // Workspace IDs are lowercase a-z0-9, but we sanitise defensively.
  const safe = workspace.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  if (!safe) throw new Error("invalid workspace id");
  return path.join(knowledgeDir(), `${safe}.json`);
}

const cache = new Map<
  string,
  { mtimeMs: number; data: WorkspaceKnowledge }
>();

export async function readKnowledge(
  workspace: string,
): Promise<WorkspaceKnowledge> {
  const file = knowledgePath(workspace);
  try {
    const stat = await fs.stat(file);
    const cached = cache.get(workspace);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const buf = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(buf) as Partial<WorkspaceKnowledge>;
    const data: WorkspaceKnowledge = {
      workspace,
      company: parsed.company ?? "",
      products: parsed.products ?? "",
      tone: parsed.tone ?? "",
      pricing: parsed.pricing ?? "",
      faq: parsed.faq ?? "",
      signature: parsed.signature ?? "",
      bannedPhrases: parsed.bannedPhrases ?? "",
      contact: parsed.contact ?? "",
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      updatedBy: parsed.updatedBy ?? "—",
    };
    cache.set(workspace, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[ai/knowledge-store] read failed:", err);
    }
    return {
      workspace,
      ...EMPTY_KNOWLEDGE_FIELDS,
      updatedAt: new Date(0).toISOString(),
      updatedBy: "—",
    };
  }
}

export async function writeKnowledge(
  workspace: string,
  patch: Partial<Omit<WorkspaceKnowledge, "workspace" | "updatedAt">>,
  updatedBy: string,
): Promise<WorkspaceKnowledge> {
  const current = await readKnowledge(workspace);
  const merged: WorkspaceKnowledge = {
    workspace,
    company: patch.company ?? current.company,
    products: patch.products ?? current.products,
    tone: patch.tone ?? current.tone,
    pricing: patch.pricing ?? current.pricing,
    faq: patch.faq ?? current.faq,
    signature: patch.signature ?? current.signature,
    bannedPhrases: patch.bannedPhrases ?? current.bannedPhrases,
    contact: patch.contact ?? current.contact,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  const file = knowledgePath(workspace);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  cache.delete(workspace);
  return merged;
}

/**
 * Render the knowledge as a single text block that fits at the top of a
 * Claude system prompt. We elide empty sections so unused fields don't
 * waste tokens or pollute the model's context.
 */
export function renderKnowledgeBlock(k: WorkspaceKnowledge): string {
  const parts: string[] = [];
  const push = (label: string, value: string) => {
    const v = value.trim();
    if (v) parts.push(`### ${label}\n${v}`);
  };
  push("Firma & Mission", k.company);
  push("Leistungen / Produkte", k.products);
  push("Ton & Stil", k.tone);
  push("Preise / Pakete", k.pricing);
  push("Häufige Fragen", k.faq);
  push("Verbotene Formulierungen", k.bannedPhrases);
  push("Eskalation / Kontakt", k.contact);
  if (parts.length === 0) return "";
  return (
    `## Firmen-Wissensbasis (für ${k.workspace})\n` +
    parts.join("\n\n") +
    `\n\n(Stand: ${k.updatedAt})`
  );
}

export function renderSignature(k: WorkspaceKnowledge): string {
  return k.signature.trim();
}
