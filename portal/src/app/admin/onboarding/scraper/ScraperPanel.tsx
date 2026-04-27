"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Activity,
} from "lucide-react";

const SWISS_CANTONS = [
  "ZH",
  "BE",
  "VD",
  "AG",
  "SG",
  "LU",
  "TI",
  "GE",
  "BS",
  "BL",
  "FR",
  "VS",
  "SO",
  "TG",
  "GR",
  "NE",
  "SZ",
  "OW",
  "NW",
  "AR",
  "AI",
  "JU",
  "GL",
  "UR",
  "ZG",
  "SH",
];

type Status = {
  state: "idle" | "running" | "done" | "error";
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  cmd?: string[];
  params?: Record<string, unknown>;
  log_tail?: string;
  log_updated_at?: string | null;
  log_size?: number;
  server_now?: string;
  proc_alive?: boolean;
  reachable?: boolean;
  error?: string;
};

const POLL_INTERVAL_MS = 2000;
const STALL_WARN_S = 60;

function fmtDurationSeconds(secs: number): string {
  if (secs < 1) return "< 1 s";
  if (secs < 60) return `${Math.floor(secs)} s`;
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m} min ${s.toString().padStart(2, "0")} s`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

/** Best-effort phase detector based on log content. */
function detectPhase(log: string | undefined): {
  phase: string;
  detail?: string;
} {
  if (!log) return { phase: "Initialisierung" };
  const tail = log.slice(-2000);
  if (/Fertig\.\s*CSV:/i.test(tail)) return { phase: "Abgeschlossen" };
  // Match a "[3/45]" counter and surface the latest one.
  const counter = [...tail.matchAll(/\[(\d+)\/(\d+)\]/g)].pop();
  if (counter) {
    return {
      phase: "Verarbeite Praxen",
      detail: `${counter[1]} / ${counter[2]}`,
    };
  }
  if (/CRM:/.test(tail)) return { phase: "CRM-Push (Twenty)" };
  if (/extractor|extract/i.test(tail))
    return { phase: "Inhalts-Extraktion (LLM)" };
  if (/social_finder|social/i.test(tail)) return { phase: "Social-Lookup" };
  if (/enrich/i.test(tail)) return { phase: "Anreicherung" };
  if (/Verarbeite\s+\d+\s+Praxen/i.test(tail))
    return { phase: "Discovery abgeschlossen" };
  if (/Cache:.*Praxen.*DB/i.test(tail)) return { phase: "Cache geladen" };
  if (/^\s*\.+/m.test(tail) || /Searching|Suche|google/i.test(tail))
    return { phase: "Discovery (Google Maps)" };
  return { phase: "Initialisierung" };
}

export function ScraperPanel({ disabled }: { disabled: boolean }) {
  const [country, setCountry] = useState<string>("ch");
  const [canton, setCanton] = useState<string>("ZH");
  const [city, setCity] = useState<string>("");
  const [plz, setPlz] = useState<string>("");
  const [terms, setTerms] = useState<string>("");
  const [limit, setLimit] = useState<string>("20");
  const [maxPlz, setMaxPlz] = useState<string>("10");
  const [maxPages, setMaxPages] = useState<string>("2");
  const [dryRun, setDryRun] = useState(true);
  const [noExtract, setNoExtract] = useState(false);
  const [noMerge, setNoMerge] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  // Tick once per second so elapsed-time / "since last log" labels stay live
  // without us re-fetching status on every tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status?.state !== "running") return;
    const t = window.setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000);
    return () => window.clearInterval(t);
  }, [status?.state]);
  // Auto-scroll the log pre to bottom whenever the log content changes while
  // a run is active, so the latest output is always visible.
  const logRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (status?.state === "running") {
      el.scrollTop = el.scrollHeight;
    }
  }, [status?.log_tail, status?.state]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scraper/status", { cache: "no-store" });
      const j = (await r.json()) as Status;
      setStatus(j);
    } catch (e) {
      setStatus({
        state: "error",
        reachable: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    void fetchStatus();
  }, [disabled, fetchStatus]);

  useEffect(() => {
    if (disabled) return;
    if (status?.state !== "running") {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.state, fetchStatus, disabled]);

  async function handleTrigger() {
    if (disabled) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        country: country || undefined,
        canton: canton || undefined,
        city: city.trim() || undefined,
        plz: plz.trim() || undefined,
        terms: terms.trim()
          ? terms
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
        limit: limit ? Number(limit) : undefined,
        max_plz: maxPlz ? Number(maxPlz) : undefined,
        max_pages: maxPages ? Number(maxPages) : undefined,
        dry_run: dryRun,
        no_extract: noExtract,
        no_merge: noMerge,
      };
      const r = await fetch("/api/admin/scraper/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      void fetchStatus();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const isRunning = status?.state === "running";

  const liveStats = useMemo(() => {
    if (!status) return null;
    const now = Date.now();
    const startedMs = status.started_at
      ? new Date(status.started_at).getTime()
      : null;
    const logMs = status.log_updated_at
      ? new Date(status.log_updated_at).getTime()
      : null;
    const elapsedSec = startedMs ? Math.max(0, (now - startedMs) / 1000) : null;
    const sinceLogSec = logMs ? Math.max(0, (now - logMs) / 1000) : null;
    return { elapsedSec, sinceLogSec };
  }, [status]);

  const phase = useMemo(() => detectPhase(status?.log_tail), [status?.log_tail]);
  const stalled =
    isRunning &&
    liveStats?.sinceLogSec != null &&
    liveStats.sinceLogSec > STALL_WARN_S;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1">
          <h2 className="text-text-primary text-base font-semibold">
            Neuen Scraper-Lauf starten
          </h2>
          <p className="text-text-tertiary text-xs mt-0.5">
            Empfehlung für den ersten Test: Kanton ZH, Limit 10, Dry-Run aktiv.
            Live-Lauf (mit Twenty-Push) erst, wenn die Token-Quotas geprüft
            sind.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Land">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={disabled || isRunning}
              className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
            >
              <option value="ch">Schweiz (CH)</option>
              <option value="de">Deutschland (DE)</option>
              <option value="at">Österreich (AT)</option>
              <option value="li">Liechtenstein (LI)</option>
            </select>
          </Field>

          <Field label="Kanton / Bundesland">
            <input
              list="canton-list"
              value={canton}
              onChange={(e) => setCanton(e.target.value.toUpperCase())}
              disabled={disabled || isRunning}
              placeholder="z.B. ZH oder BY"
              className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
            />
            <datalist id="canton-list">
              {SWISS_CANTONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Stadt (optional)">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={disabled || isRunning}
              placeholder="z.B. Zürich, Bern, München"
              className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
            />
          </Field>

          <Field label="PLZ (optional)">
            <input
              type="text"
              value={plz}
              onChange={(e) => setPlz(e.target.value)}
              disabled={disabled || isRunning}
              placeholder="z.B. 8001"
              className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
            />
          </Field>

          <Field label="Zusatz-Suchbegriffe (komma)">
            <input
              type="text"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={disabled || isRunning}
              placeholder="Sportphysio, Manuelle Therapie"
              className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
            />
          </Field>

          <Field label="Limit (max. Praxen)">
            <NumberInput
              value={limit}
              onChange={setLimit}
              disabled={disabled || isRunning}
            />
          </Field>

          <Field label="max. PLZ">
            <NumberInput
              value={maxPlz}
              onChange={setMaxPlz}
              disabled={disabled || isRunning}
            />
          </Field>

          <Field label="max. Result-Pages / PLZ × Query">
            <NumberInput
              value={maxPages}
              onChange={setMaxPages}
              disabled={disabled || isRunning}
            />
          </Field>

          <Field label="Modus">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={disabled || isRunning}
              />
              Dry-Run (keine Twenty-Pushes)
            </label>
          </Field>

          <Field label="CRM-Verhalten">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={!noMerge}
                onChange={(e) => setNoMerge(!e.target.checked)}
                disabled={disabled || isRunning}
              />
              <span>
                Bestehende Companies <strong>anreichern</strong> statt
                überspringen
                <span className="block text-text-quaternary text-[11px] leading-tight mt-0.5">
                  Default: nur leere Felder werden gefüllt — vorhandene Daten
                  werden nie überschrieben.
                </span>
              </span>
            </label>
          </Field>

          <Field label="LLM">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={noExtract}
                onChange={(e) => setNoExtract(e.target.checked)}
                disabled={disabled || isRunning}
              />
              LLM-Extraktion abschalten (Anthropic-Tokens sparen)
            </label>
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-stroke-1 flex items-center justify-between">
          {submitError ? (
            <span className="text-warning text-sm flex items-center gap-1.5">
              <AlertCircle size={14} />
              {submitError}
            </span>
          ) : (
            <span className="text-text-tertiary text-xs">
              Ein Klick = ein Lauf. Während der Subprozess läuft, ist der
              Button gesperrt.
            </span>
          )}
          <button
            type="button"
            onClick={handleTrigger}
            disabled={disabled || isRunning || submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Läuft...
              </>
            ) : submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Startet...
              </>
            ) : (
              <>
                <Play size={14} />
                Scraper anstoßen
              </>
            )}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1 flex items-center justify-between">
          <h2 className="text-text-primary text-base font-semibold">
            Letzter / aktueller Lauf
          </h2>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            className="text-text-tertiary hover:text-text-primary text-xs inline-flex items-center gap-1"
            disabled={disabled}
          >
            <RefreshCw size={12} />
            Aktualisieren
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} disabled={disabled} />
            {isRunning && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${stalled ? "border-warning/40 bg-warning/10 text-warning" : "border-info/30 bg-info/5 text-info"}`}
                title={
                  stalled
                    ? "Über 60 Sekunden ohne neue Log-Ausgabe — der Job könnte hängen, oder die aktuelle Phase ist langsam (z.B. LLM, Google-Maps-Quota)."
                    : "Letzte Log-Aktivität"
                }
              >
                <Activity size={12} />
                {liveStats?.sinceLogSec != null
                  ? `Heartbeat: vor ${fmtDurationSeconds(liveStats.sinceLogSec)}`
                  : "Heartbeat: —"}
              </span>
            )}
            {isRunning && phase.phase && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-stroke-1 bg-bg-base text-text-secondary text-xs">
                Phase:&nbsp;
                <strong className="text-text-primary">{phase.phase}</strong>
                {phase.detail && (
                  <span className="text-text-tertiary tabular-nums ml-1">
                    {phase.detail}
                  </span>
                )}
              </span>
            )}
            {isRunning && liveStats?.elapsedSec != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-stroke-1 bg-bg-base text-text-tertiary text-xs">
                Laufzeit:&nbsp;
                <span className="tabular-nums text-text-secondary">
                  {fmtDurationSeconds(liveStats.elapsedSec)}
                </span>
              </span>
            )}
          </div>
          {status?.params && (
            <KV label="Parameter" value={JSON.stringify(status.params)} />
          )}
          {status?.started_at && (
            <KV label="Gestartet" value={status.started_at} />
          )}
          {status?.finished_at && (
            <KV label="Fertig" value={status.finished_at} />
          )}
          {typeof status?.exit_code === "number" && (
            <KV label="Exit-Code" value={String(status.exit_code)} />
          )}
          <div>
            <div className="text-text-tertiary text-xs uppercase tracking-wide mb-1.5 flex items-center justify-between">
              <span>Log (live, autoscroll)</span>
              {typeof status?.log_size === "number" && (
                <span className="tabular-nums text-text-quaternary normal-case font-normal">
                  {(status.log_size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <pre
              ref={logRef}
              className="bg-bg-base border border-stroke-1 rounded-md p-3 text-xs text-text-secondary max-h-96 overflow-auto whitespace-pre-wrap"
            >
              {status?.log_tail?.trim() || "(noch keine Ausgabe)"}
            </pre>
            {stalled && (
              <p className="mt-1.5 text-[11px] text-warning leading-snug">
                Hinweis: über {STALL_WARN_S} s keine neue Zeile.
                Wahrscheinlich entweder Google-Maps-Wartezeit, LLM-Anfrage
                (Anthropic) oder die Twenty-API antwortet langsam. Falls hier
                zu lange nichts passiert, lohnt sich `docker logs scraper-runner`
                auf dem Host.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-text-tertiary text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 disabled:opacity-50"
    />
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <span className="text-text-tertiary uppercase text-[11px] tracking-wide pt-0.5">
        {label}
      </span>
      <span className="text-text-secondary break-all">{value}</span>
    </div>
  );
}

function StatusBadge({
  status,
  disabled,
}: {
  status: Status | null;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Badge tone="muted" icon={<Clock size={12} />}>
        Runner nicht konfiguriert
      </Badge>
    );
  }
  if (!status) {
    return (
      <Badge tone="muted" icon={<Loader2 size={12} className="animate-spin" />}>
        Lade Status …
      </Badge>
    );
  }
  if (status.reachable === false) {
    return (
      <Badge tone="error" icon={<AlertCircle size={12} />}>
        Runner nicht erreichbar — {status.error}
      </Badge>
    );
  }
  switch (status.state) {
    case "running":
      return (
        <Badge tone="info" icon={<Loader2 size={12} className="animate-spin" />}>
          Aktuell läuft ein Scraper-Job
        </Badge>
      );
    case "done":
      return (
        <Badge tone="success" icon={<CheckCircle2 size={12} />}>
          Letzter Lauf erfolgreich abgeschlossen
        </Badge>
      );
    case "error":
      return (
        <Badge tone="error" icon={<AlertCircle size={12} />}>
          Letzter Lauf mit Fehler beendet (exit{" "}
          {status.exit_code ?? "?"})
        </Badge>
      );
    default:
      return (
        <Badge tone="muted" icon={<Clock size={12} />}>
          Bereit. Noch kein Lauf in dieser Container-Lifetime.
        </Badge>
      );
  }
}

function Badge({
  tone,
  icon,
  children,
}: {
  tone: "info" | "success" | "error" | "muted";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const map: Record<string, string> = {
    info: "border-info/30 bg-info/5 text-info",
    success: "border-success/30 bg-success/5 text-success",
    error: "border-warning/30 bg-warning/5 text-warning",
    muted: "border-stroke-1 bg-bg-base text-text-tertiary",
  };
  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${map[tone]}`}
    >
      {icon}
      {children}
    </div>
  );
}
