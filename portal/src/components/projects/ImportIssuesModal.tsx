"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Two-step CSV import wizard for the Projects app.
 *
 *  1. **Upload / paste** — user provides the raw CSV (file picker or
 *     paste-area). The component POSTs `mode: "preview"` to the import
 *     route and renders the resulting per-row drafts plus a column→field
 *     mapping table.
 *  2. **Run** — user confirms; we POST `mode: "execute"` with the (now
 *     possibly user-edited) drafts. Optionally creates missing labels.
 *
 * The modal is intentionally self-contained: the parent only needs to
 * pass the project id + a refresh callback so the issue list reloads.
 */

type CanonicalField =
  | "name"
  | "description"
  | "state"
  | "priority"
  | "assignee"
  | "labels"
  | "startDate"
  | "targetDate"
  | "estimatePoint"
  | "ignore";

type IssueDraft = {
  rowIndex: number;
  name: string;
  descriptionHtml?: string;
  state?: string | null;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  assignees: string[];
  labels: string[];
  startDate?: string | null;
  targetDate?: string | null;
  estimatePoint?: number | null;
  unresolvedLabels: string[];
  warnings: string[];
};

type ImportPreview = {
  delimiter: string;
  headers: string[];
  mapping: Record<number, CanonicalField>;
  drafts: IssueDraft[];
  totals: {
    rows: number;
    valid: number;
    skipped: number;
    unmappedLabels: number;
    unresolvedAssignees: number;
  };
};

type RunResult = {
  imported: number;
  failed: number;
  results: { rowIndex: number; ok: boolean; error?: string }[];
};

const FIELD_KEYS: { value: CanonicalField; labelKey: keyof Messages }[] = [
  { value: "ignore", labelKey: "projects.import.field.ignore" },
  { value: "name", labelKey: "projects.import.field.name" },
  { value: "description", labelKey: "projects.import.field.description" },
  { value: "state", labelKey: "projects.import.field.state" },
  { value: "priority", labelKey: "projects.import.field.priority" },
  { value: "assignee", labelKey: "projects.import.field.assignee" },
  { value: "labels", labelKey: "projects.import.field.labels" },
  { value: "startDate", labelKey: "projects.import.field.startDate" },
  { value: "targetDate", labelKey: "projects.import.field.targetDate" },
  { value: "estimatePoint", labelKey: "projects.import.field.estimatePoint" },
];

export function ImportIssuesModal({
  workspaceId,
  projectId,
  accent,
  onClose,
  onImported,
}: {
  workspaceId: string;
  projectId: string;
  accent: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useT();
  const [csvText, setCsvText] = useState("");
  const [delimiter, setDelimiter] = useState<"" | "," | ";" | "\t">("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLabels, setAutoLabels] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = useCallback(
    (path: string) => {
      const sep = path.includes("?") ? "&" : "?";
      return `${path}${sep}ws=${workspaceId}&project=${projectId}`;
    },
    [workspaceId, projectId],
  );

  /** Run preview whenever the CSV input or delimiter setting changes. */
  const runPreview = useCallback(
    async (override?: Record<number, CanonicalField>) => {
      if (!csvText.trim()) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      setError(null);
      try {
        const r = await fetch(apiUrl("/api/projects/import"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            csv: csvText,
            delimiter: delimiter || undefined,
            mappingOverride: override,
          }),
        });
        const j = (await r.json()) as { preview?: ImportPreview; error?: string };
        if (!r.ok || !j.preview) throw new Error(j.error ?? `HTTP ${r.status}`);
        setPreview(j.preview);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPreviewLoading(false);
      }
    },
    [csvText, delimiter, apiUrl],
  );

  // Debounce previews on free-form paste — don't fire a request for every
  // keystroke, but be snappy enough that the table feels live.
  useEffect(() => {
    if (!csvText.trim()) {
      setPreview(null);
      return;
    }
    const id = window.setTimeout(() => void runPreview(), 350);
    return () => window.clearTimeout(id);
  }, [csvText, delimiter, runPreview]);

  const onFile = useCallback(async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setResult(null);
  }, []);

  const onMappingChange = useCallback(
    (columnIndex: number, field: CanonicalField) => {
      if (!preview) return;
      const next = { ...preview.mapping, [columnIndex]: field };
      void runPreview(next);
    },
    [preview, runPreview],
  );

  const onRun = useCallback(async () => {
    if (!preview || preview.drafts.length === 0) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(apiUrl("/api/projects/import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          drafts: preview.drafts,
          autoCreateLabels: autoLabels,
        }),
      });
      const j = (await r.json()) as RunResult & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j);
      if (j.imported > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [preview, apiUrl, autoLabels, onImported]);

  const totals = preview?.totals;
  const canRun = !!preview && preview.drafts.length > 0 && !running;

  const errorRows = useMemo(
    () =>
      result
        ? new Map(
            result.results
              .filter((r) => !r.ok)
              .map((r) => [r.rowIndex, r.error ?? ""]),
          )
        : null,
    [result],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-base border border-stroke-1 rounded-xl shadow-2xl w-[min(1100px,95vw)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stroke-1">
          <FileUp size={16} style={{ color: accent }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-text-primary">
              {t("projects.import.title", "Issues aus CSV importieren")}
            </h2>
            <p className="text-[11.5px] text-text-tertiary mt-0.5">
              {t(
                "projects.import.description",
                "Lädt Issues aus einer CSV-Datei.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Step 1 — input */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px]"
                style={{ background: accent }}
              >
                <Upload size={12} />
                {t("projects.import.upload", "CSV hochladen")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <label className="inline-flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
                {t("projects.import.delimiter", "Trenner")}:
                <select
                  value={delimiter}
                  onChange={(e) =>
                    setDelimiter(e.target.value as "" | "," | ";" | "\t")
                  }
                  className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11.5px] outline-none focus:border-stroke-2"
                >
                  <option value="">
                    {t("projects.import.delimiter.auto", "automatisch")}
                  </option>
                  <option value=",">,</option>
                  <option value=";">;</option>
                  <option value={"\t"}>Tab</option>
                </select>
              </label>
              <span className="ml-auto text-[10.5px] text-text-quaternary">
                {t(
                  "projects.import.help.jira",
                  "Tipp: Jira → Export → CSV (alle Felder).",
                )}
              </span>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setResult(null);
              }}
              placeholder={t("projects.import.paste", "oder hier einfügen …")}
              spellCheck={false}
              className="w-full h-32 bg-bg-elevated border border-stroke-1 rounded-md p-2 font-mono text-[11px] outline-none focus:border-stroke-2 resize-none"
            />
          </section>

          {/* Step 2 — preview */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-[11.5px] text-red-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {previewLoading && !preview && (
            <div className="flex items-center gap-2 text-[11.5px] text-text-tertiary py-8 justify-center">
              <Loader2 size={14} className="animate-spin" />
              {t("common.loading", "Wird geladen …")}
            </div>
          )}

          {!preview && !previewLoading && !csvText.trim() && (
            <p className="text-center text-text-quaternary text-[12px] py-8">
              {t("projects.import.empty", "Noch keine CSV geladen.")}
            </p>
          )}

          {preview && totals && (
            <>
              {/* Totals */}
              <div className="flex items-center gap-3 text-[11px] text-text-secondary">
                <span>
                  <strong className="text-text-primary tabular-nums">
                    {totals.rows}
                  </strong>{" "}
                  {t("projects.import.totals.rows", "Zeilen")}
                </span>
                <span className="text-emerald-400">
                  <strong className="tabular-nums">{totals.valid}</strong>{" "}
                  {t("projects.import.totals.valid", "gültig")}
                </span>
                {totals.skipped > 0 && (
                  <span className="text-text-tertiary">
                    <strong className="tabular-nums">{totals.skipped}</strong>{" "}
                    {t("projects.import.totals.skipped", "übersprungen")}
                  </span>
                )}
                {totals.unmappedLabels > 0 && (
                  <span className="text-amber-400">
                    <strong className="tabular-nums">
                      {totals.unmappedLabels}
                    </strong>{" "}
                    {t("projects.import.totals.unmapped", "unbekannte Labels")}
                  </span>
                )}
                {previewLoading && (
                  <Loader2
                    size={12}
                    className="animate-spin text-text-tertiary"
                  />
                )}
              </div>

              {/* Mapping */}
              <section>
                <h3 className="text-[11.5px] font-medium text-text-primary mb-1.5">
                  {t("projects.import.mapping", "Spalten-Mapping")}
                </h3>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[11.5px]">
                  {preview.headers.map((h, i) => (
                    <div key={i} className="contents">
                      <div className="truncate text-text-secondary py-1">
                        <span className="text-text-quaternary mr-1.5 tabular-nums">
                          {String.fromCharCode(65 + (i % 26))}
                        </span>
                        {h || (
                          <em className="text-text-quaternary">
                            (Spalte {i + 1})
                          </em>
                        )}
                      </div>
                      <select
                        value={preview.mapping[i] ?? "ignore"}
                        onChange={(e) =>
                          onMappingChange(i, e.target.value as CanonicalField)
                        }
                        className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11px] outline-none focus:border-stroke-2"
                      >
                        {FIELD_KEYS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {t(f.labelKey, f.value)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </section>

              {/* Preview table */}
              <section>
                <h3 className="text-[11.5px] font-medium text-text-primary mb-1.5">
                  {t("projects.import.preview", "Vorschau")}
                </h3>
                <div className="border border-stroke-1 rounded-md overflow-hidden">
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-bg-elevated text-text-tertiary sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">#</th>
                          <th className="text-left px-2 py-1.5 font-medium">
                            {t("projects.import.field.name", "Titel")}
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium">
                            {t("projects.import.field.priority", "Priorität")}
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium">
                            {t("projects.import.field.state", "Status")}
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium">
                            {t("projects.import.field.labels", "Labels")}
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium">
                            {t("projects.import.field.targetDate", "Zieldatum")}
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke-1">
                        {preview.drafts.slice(0, 50).map((d) => {
                          const err = errorRows?.get(d.rowIndex);
                          const ok = result && !err;
                          return (
                            <tr key={d.rowIndex} className="align-top">
                              <td className="px-2 py-1.5 text-text-quaternary tabular-nums">
                                {d.rowIndex}
                              </td>
                              <td className="px-2 py-1.5 text-text-primary truncate max-w-[280px]">
                                {d.name}
                              </td>
                              <td className="px-2 py-1.5 text-text-secondary">
                                {d.priority}
                              </td>
                              <td className="px-2 py-1.5 text-text-tertiary">
                                {d.state ? "ok" : "—"}
                              </td>
                              <td className="px-2 py-1.5 text-text-tertiary">
                                {d.labels.length}
                                {d.unresolvedLabels.length > 0 && (
                                  <span className="text-amber-400 ml-1">
                                    +{d.unresolvedLabels.length} neu
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-text-tertiary">
                                {d.targetDate ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                {err && (
                                  <span
                                    className="text-red-400 text-[10px]"
                                    title={err}
                                  >
                                    <AlertCircle
                                      size={11}
                                      className="inline -mt-0.5"
                                    />
                                  </span>
                                )}
                                {ok && (
                                  <CheckCircle2
                                    size={11}
                                    className="text-emerald-400"
                                  />
                                )}
                                {d.warnings.length > 0 && !err && (
                                  <span
                                    className="text-amber-400 text-[10px]"
                                    title={d.warnings.join("\n")}
                                  >
                                    !
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {preview.drafts.length > 50 && (
                    <div className="px-2 py-1 text-[10.5px] text-text-quaternary border-t border-stroke-1 bg-bg-elevated">
                      … {preview.drafts.length - 50} weitere Zeilen ausgeblendet
                    </div>
                  )}
                </div>
              </section>

              {/* Auto-create labels */}
              {totals.unmappedLabels > 0 && (
                <label className="inline-flex items-center gap-2 text-[11.5px] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={autoLabels}
                    onChange={(e) => setAutoLabels(e.target.checked)}
                  />
                  {t(
                    "projects.import.autoLabels",
                    "Fehlende Labels automatisch anlegen",
                  )}
                </label>
              )}

              {/* Result banner */}
              {result && (
                <div
                  className={`flex items-start gap-2 px-3 py-2 rounded-md text-[11.5px] ${
                    result.failed === 0
                      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {result.failed === 0 ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div>
                      {t(
                        "projects.import.done",
                        "{count} Issues importiert.",
                      ).replace("{count}", String(result.imported))}
                    </div>
                    {result.failed > 0 && (
                      <div className="text-[11px]">
                        {t(
                          "projects.import.failed",
                          "{count} Zeilen fehlgeschlagen.",
                        ).replace("{count}", String(result.failed))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stroke-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-overlay"
          >
            {t("common.cancel", "Abbrechen")}
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] disabled:opacity-50"
            style={{ background: accent }}
          >
            {running ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {t("projects.import.running", "Importiere …")}
              </>
            ) : (
              <>
                <FileUp size={12} />
                {t("projects.import.run", "Importieren")}
                {preview && preview.drafts.length > 0 && (
                  <span className="opacity-80 tabular-nums">
                    ({preview.drafts.length})
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
