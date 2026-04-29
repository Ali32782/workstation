"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Brain,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Building2,
  Package,
  MessageCircle,
  Tags,
  HelpCircle,
  PenSquare,
  Ban,
  Phone,
  Sparkles,
} from "lucide-react";

type Knowledge = {
  workspace: string;
  company: string;
  products: string;
  tone: string;
  pricing: string;
  faq: string;
  signature: string;
  bannedPhrases: string;
  contact: string;
  updatedAt: string;
  updatedBy: string;
};

type SectionKey = Exclude<
  keyof Knowledge,
  "workspace" | "updatedAt" | "updatedBy"
>;

type SectionConfig = {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  helper: string;
  placeholder: string;
  rows: number;
};

const SECTIONS: SectionConfig[] = [
  {
    key: "company",
    label: "Firma & Mission",
    icon: Building2,
    helper:
      "1-3 Sätze: Was macht die Firma, für wen, was unterscheidet sie. Wird in jede AI-Antwort als Grundkontext eingespielt.",
    placeholder:
      "Medtheris ist eine schweizweit tätige Praxisgruppe für ambulante orthopädische Versorgung. Wir vermitteln Termine, koordinieren Diagnostik und nehmen Patient:innen an unseren Standorten in Zürich, Bern und Basel auf.",
    rows: 4,
  },
  {
    key: "products",
    label: "Leistungen / Produkte",
    icon: Package,
    helper:
      "Was ihr verkauft / anbietet. Bulletpoints sind ok. Die AI verwendet das, um konkrete Anfragen sauber zuzuordnen.",
    placeholder:
      "- Erstkonsultation Orthopädie (90 CHF, 30 min)\n- MRT-Termine über Partner-Radiologien\n- Stosswellentherapie (12 CHF/Sitzung)\n- Gutachten für Versicherungen",
    rows: 6,
  },
  {
    key: "tone",
    label: "Ton & Stil",
    icon: MessageCircle,
    helper:
      "Du/Sie? Wie formell? Schweizerdeutsch oder Hochdeutsch? Welche Anrede für wen?",
    placeholder:
      "Wir siezen Patient:innen und Versicherer, duzen interne Kolleg:innen. Hochdeutsch mit Schweizer Schreibweise (ss statt ß). Antworten kurz, sachlich, ohne Floskeln.",
    rows: 3,
  },
  {
    key: "pricing",
    label: "Preise / Pakete",
    icon: Tags,
    helper:
      "Was darf die AI eigenständig zu Preisen sagen? Was nur auf Rückfrage? Listen nur fixierte Preise hier.",
    placeholder:
      "Fixe Preise: Erstkonsult 90 CHF, MRT 480 CHF, Befundbesprechung kostenlos.\nBei Pauschalen / Versicherungs-Abklärungen IMMER an Buchhaltung verweisen — keine Zusagen.",
    rows: 4,
  },
  {
    key: "faq",
    label: "Häufige Fragen & Antworten",
    icon: HelpCircle,
    helper:
      "F: ... A: ... — pro Zeile oder pro Block. Die AI greift das eins-zu-eins ab, wenn die Frage passt.",
    placeholder:
      "F: Brauche ich eine Überweisung?\nA: Nein, alle Konsultationen können direkt gebucht werden.\n\nF: Werden die Kosten von der Krankenkasse übernommen?\nA: Ja, bei medizinischer Indikation; freiwillige Leistungen müssen die Patient:innen selbst tragen.",
    rows: 8,
  },
  {
    key: "contact",
    label: "Eskalation & Kontakt",
    icon: Phone,
    helper:
      "Wer wird wofür kontaktiert, wenn die AI eine Frage nicht eigenständig lösen kann.",
    placeholder:
      "Buchhaltung: buchhaltung@medtheris.ch / 044 123 45 60\nNotfälle: Telefon 044 123 45 99 (24/7)\nIT-Probleme: it@medtheris.ch",
    rows: 4,
  },
  {
    key: "signature",
    label: "Pflicht-Signatur",
    icon: PenSquare,
    helper:
      "Wird unter jede AI-Mailantwort 1:1 angehängt. Bei SMS-Antworten weggelassen.",
    placeholder:
      "Freundliche Grüsse\n\nMedtheris Praxisgruppe\nBahnhofstrasse 12 · 8001 Zürich\n+41 44 123 45 67 · www.medtheris.ch",
    rows: 5,
  },
  {
    key: "bannedPhrases",
    label: "Verbotene Formulierungen",
    icon: Ban,
    helper:
      "Eine Phrase pro Zeile (oder Komma-getrennt). Trifft die AI eine davon, kommt eine Warnung in der Vorschau und der Operator sieht den Hit explizit.",
    placeholder:
      "Garantie\nzu 100% sicher\nbilligstes Angebot\ngünstiger als die Konkurrenz",
    rows: 4,
  },
];

export function AiKnowledgeClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
}) {
  const [data, setData] = useState<Knowledge | null>(null);
  const [draft, setDraft] = useState<Knowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/ai/knowledge?ws=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { knowledge?: Knowledge; error?: string };
      if (!r.ok || !j.knowledge) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setData(j.knowledge);
      setDraft(j.knowledge);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    if (!data || !draft) return false;
    return SECTIONS.some((s) => data[s.key] !== draft[s.key]);
  }, [data, draft]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      for (const s of SECTIONS) patch[s.key] = draft[s.key];
      const r = await fetch(
        `/api/ai/knowledge?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const j = (await r.json()) as { knowledge?: Knowledge; error?: string };
      if (!r.ok || !j.knowledge) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setData(j.knowledge);
      setDraft(j.knowledge);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [draft, workspaceId]);

  const updateField = (key: SectionKey, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const filledCount = useMemo(() => {
    if (!draft) return 0;
    return SECTIONS.filter((s) => draft[s.key].trim().length > 0).length;
  }, [draft]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-5 py-3 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <Link
          href={`/${workspaceId}`}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Zurück"
        >
          <ArrowLeft size={14} />
        </Link>
        <div
          className="w-9 h-9 rounded flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <Brain size={18} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">
            AI-Wissensbasis
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · Firmen-Kontext für Mail-, Helpdesk- und
            SMS-Antworten
          </p>
        </div>
        <div className="hidden md:flex items-center gap-1.5 mr-2">
          <Sparkles size={11} style={{ color: accent }} />
          <span className="text-[11px] text-text-tertiary tabular-nums">
            {filledCount}/{SECTIONS.length} Abschnitte gefüllt
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
          disabled={loading || saving}
          title="Aktualisieren"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading || !isDirty}
          style={{ background: accent }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-40"
        >
          {saving ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Save size={11} />
          )}
          Speichern
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-5 space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12.5px] p-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Fehler</p>
                <p className="text-[11.5px] opacity-90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {savedAt !== null && (
            <div
              key={savedAt}
              className="rounded-md border border-success/40 bg-success/10 text-success text-[11.5px] p-2 flex items-center gap-2"
            >
              <CheckCircle2 size={12} />
              Gespeichert. Wird ab sofort von allen AI-Antworten in diesem
              Workspace genutzt.
            </div>
          )}

          {loading && !draft && (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="w-6 h-6 animate-spin"
                style={{ color: accent }}
              />
            </div>
          )}

          {draft && (
            <>
              <p className="text-[12px] text-text-tertiary leading-relaxed">
                Diese Inhalte werden bei jeder AI-Antwort (Mail, Helpdesk,
                SMS) als Firmen-Kontext mitgegeben. Je präziser hier, desto
                besser passen die Vorschläge — die Operator:in kann frei
                editieren, bevor abgesendet wird. Keine sensitiven Daten
                (z.B. Patientendaten) hier ablegen.
              </p>

              {data && data.updatedAt && (
                <div className="text-[10.5px] text-text-quaternary">
                  Zuletzt bearbeitet:{" "}
                  <span className="font-mono">
                    {new Date(data.updatedAt).toLocaleString("de-CH")}
                  </span>
                  {data.updatedBy && data.updatedBy !== "—" && (
                    <>
                      {" "}
                      von{" "}
                      <span className="text-text-tertiary">
                        {data.updatedBy}
                      </span>
                    </>
                  )}
                </div>
              )}

              {SECTIONS.map((s) => (
                <Section
                  key={s.key}
                  config={s}
                  value={draft[s.key]}
                  accent={accent}
                  onChange={(v) => updateField(s.key, v)}
                />
              ))}
            </>
          )}
        </div>
      </div>
      {isDirty && draft && (
        <footer
          className="shrink-0 px-5 py-2.5 border-t border-stroke-1 bg-bg-chrome flex items-center justify-between text-[11.5px]"
          style={{ background: `${accent}10` }}
        >
          <span className="text-text-tertiary">
            Änderungen noch nicht gespeichert.
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{ background: accent }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            Jetzt speichern
          </button>
        </footer>
      )}
    </div>
  );
}

function Section({
  config,
  value,
  accent,
  onChange,
}: {
  config: SectionConfig;
  value: string;
  accent: string;
  onChange: (v: string) => void;
}) {
  const Icon = config.icon;
  const filled = value.trim().length > 0;
  const chars = value.length;
  const pctOfCap = Math.min(100, Math.round((chars / 16_000) * 100));
  return (
    <section className="rounded-lg border border-stroke-1 bg-bg-chrome overflow-hidden">
      <header
        className="px-4 py-2.5 border-b border-stroke-1 flex items-center justify-between"
        style={{ background: `${accent}08` }}
      >
        <div className="flex items-center gap-2">
          <Icon
            size={14}
            style={{ color: filled ? accent : "var(--color-text-tertiary)" }}
          />
          <h3 className="text-[12.5px] font-semibold">{config.label}</h3>
          {filled ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success">
              gefüllt
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-stroke-1 bg-bg-base text-text-quaternary">
              leer
            </span>
          )}
        </div>
        <span className="text-[10.5px] text-text-quaternary tabular-nums">
          {chars.toLocaleString("de-CH")} Zeichen
          {pctOfCap > 50 && (
            <span className="ml-1.5 text-text-tertiary">({pctOfCap}%)</span>
          )}
        </span>
      </header>
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-text-tertiary leading-snug">
          {config.helper}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 16_000))}
          rows={config.rows}
          placeholder={config.placeholder}
          className="w-full px-2.5 py-2 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none resize-y leading-relaxed"
        />
      </div>
    </section>
  );
}
