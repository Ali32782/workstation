"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
  X,
  Building2,
  UserPlus,
} from "lucide-react";

/**
 * Two-step CSV import wizard for the CRM (Twenty) app.
 *
 *  1. **Upload / paste** — user picks "Companies" or "People", uploads or pastes
 *     a CSV. We POST `mode: "preview"` to /api/crm/import and render the parsed
 *     drafts + column-to-field mapping.
 *  2. **Run** — user confirms; we POST `mode: "execute"` with (potentially
 *     adjusted) drafts. Skipped rows due to existing-by-email dups are reported
 *     back per row.
 *
 * Mirrors the UX of the Projects import modal so the experience is consistent
 * across apps that need bulk-import.
 */

type CompanyField =
  | "name"
  | "domainName"
  | "industry"
  | "phone"
  | "address"
  | "city"
  | "country"
  | "annualRecurringRevenue"
  | "employees"
  | "linkedinUrl"
  | "xUrl"
  | "notes"
  | "ignore";

type PersonField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "jobTitle"
  | "city"
  | "country"
  | "linkedinUrl"
  | "xUrl"
  | "company"
  | "notes"
  | "ignore";

type Entity = "companies" | "people";

type CompanyDraft = {
  rowIndex: number;
  name: string;
  domainName?: string;
  industry?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  annualRecurringRevenue?: number;
  employees?: number;
  linkedinUrl?: string;
  xUrl?: string;
  notes?: string;
  errors: string[];
};

type PersonDraft = {
  rowIndex: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  country?: string;
  linkedinUrl?: string;
  xUrl?: string;
  company?: string;
  notes?: string;
  errors: string[];
};

type Preview = {
  entity: Entity;
  delimiter: string;
  headers: string[];
  mapping: Record<string, string>;
  totals: { rows: number; valid: number; skipped: number };
  companies: CompanyDraft[];
  people: PersonDraft[];
};

type RunResult = {
  created: number;
  skipped?: { rowIndex: number; reason: string }[];
  errors?: { rowIndex: number; error: string }[];
};

const COMPANY_FIELDS: { value: CompanyField; label: string }[] = [
  { value: "ignore", label: "Ignorieren" },
  { value: "name", label: "Name" },
  { value: "domainName", label: "Domain" },
  { value: "industry", label: "Branche" },
  { value: "phone", label: "Telefon" },
  { value: "address", label: "Adresse" },
  { value: "city", label: "Stadt" },
  { value: "country", label: "Land" },
  { value: "annualRecurringRevenue", label: "Umsatz (ARR)" },
  { value: "employees", label: "Mitarbeiter" },
  { value: "linkedinUrl", label: "LinkedIn" },
  { value: "xUrl", label: "Twitter / X" },
  { value: "notes", label: "Notizen" },
];

const PERSON_FIELDS: { value: PersonField; label: string }[] = [
  { value: "ignore", label: "Ignorieren" },
  { value: "firstName", label: "Vorname" },
  { value: "lastName", label: "Nachname" },
  { value: "fullName", label: "Voller Name" },
  { value: "email", label: "E-Mail" },
  { value: "phone", label: "Telefon" },
  { value: "jobTitle", label: "Position" },
  { value: "city", label: "Stadt" },
  { value: "country", label: "Land" },
  { value: "linkedinUrl", label: "LinkedIn" },
  { value: "xUrl", label: "Twitter / X" },
  { value: "company", label: "Firma" },
  { value: "notes", label: "Notizen" },
];

export function ImportCrmModal({
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
  const [entity, setEntity] = useState<Entity>("people");
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState<string>("");
  const [autoCreateCompanies, setAutoCreateCompanies] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = entity === "companies" ? COMPANY_FIELDS : PERSON_FIELDS;

  const runPreview = useCallback(
    async (overrideMapping?: Record<string, string>) => {
      setError(null);
      setResult(null);
      if (!text.trim()) {
        setPreview(null);
        return;
      }
      setPreviewing(true);
      try {
        const r = await fetch(`/api/crm/import?ws=${workspaceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            entity,
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
    [delimiter, entity, text, workspaceId],
  );

  // Auto-preview when text or entity changes (debounced).
  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => void runPreview(), 350);
    return () => clearTimeout(t);
  }, [text, entity, delimiter, runPreview]);

  const onFile = useCallback(async (f: File) => {
    const t = await f.text();
    setText(t);
  }, []);

  const onMappingChange = useCallback(
    (header: string, field: string) => {
      if (!preview) return;
      const next = { ...preview.mapping, [header]: field };
      void runPreview(next);
    },
    [preview, runPreview],
  );

  const totalValid = useMemo(() => {
    if (!preview) return 0;
    return preview.totals.valid;
  }, [preview]);

  const onRun = useCallback(async () => {
    if (!preview) return;
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(`/api/crm/import?ws=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          entity,
          companies: entity === "companies" ? preview.companies : undefined,
          people: entity === "people" ? preview.people : undefined,
          autoCreateCompanies,
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
  }, [autoCreateCompanies, entity, onImported, preview, workspaceId]);

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
            <h2 className="text-[14px] font-semibold text-text-primary">CSV-Import</h2>
            <p className="text-[11px] text-text-tertiary truncate">
              {entity === "companies"
                ? "Firmen aus CSV in Twenty CRM importieren"
                : "Personen / Kontakte aus CSV in Twenty CRM importieren — duplikatfreie Übernahme via E-Mail"}
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
          {/* Entity switch */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEntity("people")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] border ${
                entity === "people"
                  ? "border-stroke-2 bg-bg-overlay text-text-primary"
                  : "border-stroke-1 text-text-secondary hover:border-stroke-2"
              }`}
            >
              <UserPlus size={13} /> Personen
            </button>
            <button
              type="button"
              onClick={() => setEntity("companies")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] border ${
                entity === "companies"
                  ? "border-stroke-2 bg-bg-overlay text-text-primary"
                  : "border-stroke-1 text-text-secondary hover:border-stroke-2"
              }`}
            >
              <Building2 size={13} /> Firmen
            </button>
            <span className="text-[10.5px] text-text-tertiary ml-2">
              Tipp: HubSpot/Pipedrive/Excel-Spalten werden automatisch erkannt.
            </span>
          </div>

          {/* Upload + paste */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`firstName,lastName,email,company,jobTitle\nMaria,Müller,m.mueller@example.com,Praxis Müller,Inhaberin\n…`}
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
              {entity === "people" && (
                <label className="text-[10.5px] text-text-secondary flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={autoCreateCompanies}
                    onChange={(e) => setAutoCreateCompanies(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Fehlende Firmen automatisch anlegen</span>
                </label>
              )}
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

              {/* Mapping table */}
              <div>
                <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">
                  Spalten-Mapping
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {preview.headers.map((h) => (
                    <label
                      key={h}
                      className="flex flex-col gap-1 text-[11px] text-text-tertiary"
                    >
                      <span className="truncate" title={h}>
                        {h || <em className="text-text-quaternary">(leer)</em>}
                      </span>
                      <select
                        value={preview.mapping[h] ?? "ignore"}
                        onChange={(e) => onMappingChange(h, e.target.value)}
                        className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[12px] text-text-secondary"
                      >
                        {fields.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview rows */}
              <div className="border border-stroke-1 rounded-md max-h-64 overflow-auto">
                <table className="w-full text-[11.5px]">
                  <thead className="bg-bg-chrome sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">#</th>
                      {entity === "companies" ? (
                        <>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Name</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Domain</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Stadt</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Branche</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Vor- / Nachname</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">E-Mail</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Firma</th>
                          <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Position</th>
                        </>
                      )}
                      <th className="text-left px-2 py-1.5 text-text-tertiary font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity === "companies"
                      ? preview.companies.slice(0, 80).map((d) => (
                          <tr key={d.rowIndex} className="border-t border-stroke-1">
                            <td className="px-2 py-1 text-text-quaternary">{d.rowIndex}</td>
                            <td className="px-2 py-1 text-text-primary">{d.name || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{d.domainName || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{d.city || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{d.industry || "—"}</td>
                            <td className="px-2 py-1">
                              {d.errors.length > 0 ? (
                                <span className="text-warning">{d.errors[0]}</span>
                              ) : (
                                <span className="text-success">OK</span>
                              )}
                            </td>
                          </tr>
                        ))
                      : preview.people.slice(0, 80).map((d) => (
                          <tr key={d.rowIndex} className="border-t border-stroke-1">
                            <td className="px-2 py-1 text-text-quaternary">{d.rowIndex}</td>
                            <td className="px-2 py-1 text-text-primary">
                              {[d.firstName, d.lastName].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td className="px-2 py-1 text-text-secondary">{d.email || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{d.company || "—"}</td>
                            <td className="px-2 py-1 text-text-secondary">{d.jobTitle || "—"}</td>
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
                <strong>{result.created}</strong>{" "}
                {entity === "companies" ? "Firmen" : "Personen"} angelegt.
              </div>
              {result.skipped && result.skipped.length > 0 && (
                <p className="text-text-tertiary">
                  <strong>{result.skipped.length}</strong> übersprungen (z. B. existierende E-Mail).
                </p>
              )}
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
            {totalValid > 0 ? `${totalValid} gültige Zeilen bereit` : "CSV einfügen oder hochladen"}
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
              disabled={!preview || totalValid === 0 || running}
              onClick={() => void onRun()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] disabled:opacity-50"
              style={{ background: accent }}
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {running ? "Importiere …" : `${totalValid} importieren`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
