"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";

/**
 * Two-step CSV import wizard for the Helpdesk (Zammad) app.
 *
 *  1. **Upload / paste** — POST mode=preview to /api/helpdesk/import.
 *  2. **Run** — POST mode=execute. The executor resolves group / state /
 *     priority / owner labels against the live workspace meta, so the same
 *     CSV can be re-imported into a different tenant.
 */

type TicketField =
  | "title"
  | "body"
  | "customerEmail"
  | "customerName"
  | "group"
  | "priority"
  | "state"
  | "owner"
  | "tags"
  | "ignore";

type TicketDraft = {
  rowIndex: number;
  title: string;
  body: string;
  customerEmail: string;
  customerName?: string;
  group?: string;
  priority?: string;
  state?: string;
  owner?: string;
  tags?: string[];
  errors: string[];
};

type Preview = {
  delimiter: string;
  headers: string[];
  mapping: Record<string, TicketField>;
  totals: { rows: number; valid: number; skipped: number };
  drafts: TicketDraft[];
};

type RunResult = {
  created: number;
  errors?: { rowIndex: number; error: string }[];
};

const FIELDS: { value: TicketField; label: string }[] = [
  { value: "ignore", label: "Ignorieren" },
  { value: "title", label: "Titel / Betreff" },
  { value: "body", label: "Beschreibung" },
  { value: "customerEmail", label: "Kunden-E-Mail" },
  { value: "customerName", label: "Kundenname" },
  { value: "group", label: "Gruppe" },
  { value: "priority", label: "Priorität" },
  { value: "state", label: "Status" },
  { value: "owner", label: "Bearbeiter" },
  { value: "tags", label: "Tags" },
];

export function ImportTicketsModal({
  workspaceId,
  accent,
  onClose,
  onImported,
}: {
  workspaceId: string;
  accent: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runPreview = useCallback(
    async (overrideMapping?: Record<string, TicketField>) => {
      setError(null);
      setResult(null);
      if (!text.trim()) {
        setPreview(null);
        return;
      }
      setPreviewing(true);
      try {
        const r = await fetch(`/api/helpdesk/import?ws=${workspaceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            text,
            delimiter: delimiter || undefined,
            mapping: overrideMapping,
          }),
        });
        const j = (await r.json()) as { preview?: Preview; error?: string };
        if (!r.ok || !j.preview) {
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setPreview(j.preview);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    },
    [delimiter, text, workspaceId],
  );

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => void runPreview(), 350);
    return () => clearTimeout(t);
  }, [text, delimiter, runPreview]);

  const onFile = useCallback(async (f: File) => {
    setText(await f.text());
  }, []);

  const onMappingChange = useCallback(
    (header: string, field: TicketField) => {
      if (!preview) return;
      const next = { ...preview.mapping, [header]: field };
      void runPreview(next);
    },
    [preview, runPreview],
  );

  const onRun = useCallback(async () => {
    if (!preview) return;
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(`/api/helpdesk/import?ws=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          drafts: preview.drafts,
        }),
      });
      const j = (await r.json()) as RunResult & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [onImported, preview, workspaceId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-bg-base border border-stroke-2 rounded-lg shadow-2xl overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-3 border-b border-stroke-1">
          <span
            className="w-9 h-9 rounded flex items-center justify-center"
            style={{ background: `${accent}1f` }}
          >
            <FileUp size={16} style={{ color: accent }} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-text-primary">
              CSV-Import (Tickets)
            </h2>
            <p className="text-[11px] text-text-tertiary truncate">
              Tickets aus Zendesk / Freshdesk / Excel ins Helpdesk importieren —
              Gruppen, Status, Priorität und Bearbeiter werden via Name aufgelöst.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`subject,body,email,priority,group\n"Login funktioniert nicht","Beim Login passiert nichts","kunde@x.de","High","Support"`}
              className="w-full h-32 bg-bg-elevated border border-stroke-1 rounded-md px-3 py-2 text-[12px] font-mono outline-none focus:border-stroke-2"
            />
            <div className="flex flex-col gap-2 min-w-[180px]">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-stroke-1 hover:border-stroke-2 text-[12px]"
              >
                <Upload size={13} /> CSV hochladen
              </button>
              <label className="text-[10.5px] text-text-tertiary flex flex-col gap-1">
                Trenner
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1.5 text-[12px]"
                >
                  <option value="">automatisch</option>
                  <option value=",">Komma (,)</option>
                  <option value=";">Semikolon (;)</option>
                  <option value="\t">Tab</option>
                </select>
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-[12px] text-red-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {previewing && !preview && (
            <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
              <Loader2 size={13} className="animate-spin" /> Vorschau wird erzeugt …
            </div>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
                <span className="text-text-secondary">
                  <strong className="text-text-primary">{preview.totals.rows}</strong> Zeilen
                </span>
                <span className="text-text-secondary">
                  <strong className="text-success">{preview.totals.valid}</strong> gültig
                </span>
                <span className="text-text-secondary">
                  <strong className="text-warning">{preview.totals.skipped}</strong> übersprungen
                </span>
                <span className="text-text-tertiary text-[10.5px]">
                  Trenner: <code>{preview.delimiter === "\t" ? "\\t" : preview.delimiter}</code>
                </span>
              </div>

              <div>
                <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">
                  Spalten-Mapping
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {preview.headers.map((h) => (
                    <label key={h} className="flex flex-col gap-1 text-[11px] text-text-tertiary">
                      <span className="truncate" title={h}>
                        {h || <em className="text-text-quaternary">(leer)</em>}
                      </span>
                      <select
                        value={preview.mapping[h] ?? "ignore"}
                        onChange={(e) =>
                          onMappingChange(h, e.target.value as TicketField)
                        }
                        className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[12px] text-text-secondary"
                      >
                        {FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border border-stroke-1 rounded-md max-h-64 overflow-auto">
                <table className="w-full text-[11.5px]">
                  <thead className="bg-bg-chrome sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">#</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Titel</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Kunde</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Gruppe</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Priorität</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Status</th>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Validierung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.drafts.slice(0, 80).map((d) => (
                      <tr key={d.rowIndex} className="border-t border-stroke-1">
                        <td className="px-2 py-1 text-text-quaternary">{d.rowIndex}</td>
                        <td className="px-2 py-1 text-text-primary truncate max-w-[260px]">
                          {d.title || "—"}
                        </td>
                        <td className="px-2 py-1 text-text-secondary">{d.customerEmail || "—"}</td>
                        <td className="px-2 py-1 text-text-secondary">{d.group || "—"}</td>
                        <td className="px-2 py-1 text-text-secondary">{d.priority || "—"}</td>
                        <td className="px-2 py-1 text-text-secondary">{d.state || "—"}</td>
                        <td className="px-2 py-1">
                          {d.errors.length > 0 ? (
                            <span className="text-warning">{d.errors[0]}</span>
                          ) : (
                            <span className="text-success">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="flex flex-col gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/30 text-[12px]">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 size={13} />
                <strong>{result.created}</strong> Tickets angelegt.
              </div>
              {result.errors && result.errors.length > 0 && (
                <p className="text-warning">
                  <strong>{result.errors.length}</strong> fehlgeschlagen — Details: {" "}
                  {result.errors.slice(0, 3).map((e) => `Zeile ${e.rowIndex}`).join(", ")}
                  {result.errors.length > 3 && " …"}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-stroke-1 bg-bg-chrome">
          <span className="text-[10.5px] text-text-tertiary">
            {preview && preview.totals.valid > 0
              ? `${preview.totals.valid} gültige Zeilen bereit`
              : "CSV einfügen oder hochladen"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-[12px] hover:border-stroke-2"
            >
              Schließen
            </button>
            <button
              type="button"
              disabled={!preview || preview.totals.valid === 0 || running}
              onClick={() => void onRun()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] disabled:opacity-50"
              style={{ background: accent }}
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {running ? "Importiere …" : `${preview?.totals.valid ?? 0} importieren`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
