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
  ShieldAlert,
  ShieldCheck,
  Database,
  ArrowRight,
  Lock,
  Stethoscope,
  Trophy,
  HeartPulse,
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

type PreflightDetail = { required: boolean; set: boolean; hint?: string };
type Preflight = {
  ok: boolean;
  reachable?: boolean;
  missing: string[];
  present: string[];
  details: Record<string, PreflightDetail>;
  error?: string;
  checked_at?: string;
  profile?: string;
};

type CacheCantonRow = {
  canton: string;
  total: number;
  pushed: number;
  unpushed: number;
};

type CacheProfileRow = {
  profile: string;
  total: number;
  pushed: number;
  unpushed: number;
};

type CacheSummary = {
  total: number;
  pushed: number;
  unpushed: number;
  by_canton: CacheCantonRow[];
  by_profile?: CacheProfileRow[];
  profile?: string | null;
  reachable?: boolean;
  error?: string;
};

type SpecialtyMeta = {
  key: string;
  label: string;
  enabled_by_default: boolean;
};

type ProfileMeta = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  one_shot: boolean;
  default_canton: string | null;
  locked_canton: string | null;
  crm_workspace: string;
  tenant_tag: string;
  industry_label: string;
  extract_with_llm: boolean;
  detect_booking: boolean;
  specialties: SpecialtyMeta[];
};

type ProfileStatus = {
  key: string;
  label: string;
  one_shot: boolean;
  locked: boolean;
  first_run_at: string | null;
  last_run_at: string | null;
  last_force_at: string | null;
  run_count: number;
  last_status: string | null;
};

const ENV_KEY_HINTS: Record<string, string> = {
  GOOGLE_MAPS_API_KEY:
    "Google-Maps-Places-API-Key. /opt/corelab/.env → SCRAPER_GOOGLE_MAPS_API_KEY",
  TWENTY_API_URL:
    "Twenty-CRM-Origin (ohne /api / ohne /graphql). /opt/corelab/.env → SCRAPER_TWENTY_API_URL",
  TWENTY_API_KEY:
    "Twenty-API-Key Medtheris-Workspace (Bearer). /opt/corelab/.env → SCRAPER_TWENTY_API_KEY",
  TWENTY_KINEO_API_KEY:
    "Twenty-API-Key Kineo-Workspace (Bearer) — nur nötig für aerzte/sportvereine. /opt/corelab/.env → SCRAPER_TWENTY_KINEO_API_KEY (oder TWENTY_WORKSPACE_KINEO_TOKEN als Fallback).",
  TENANT_TAG:
    "Optional — Override des Tenant-Tags. Default kommt aus dem Profil.",
  ANTHROPIC_API_KEY:
    "Optional — nur nötig wenn LLM-Extraktion an ist (sk-ant-...). /opt/corelab/.env → SCRAPER_ANTHROPIC_API_KEY",
  ENABLE_SOCIAL_LOOKUP: "Optional — Social-Lookup an/aus (0/1).",
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Best-effort phase detector based on log content. */
function detectPhase(log: string | undefined): {
  phase: string;
  detail?: string;
} {
  if (!log) return { phase: "Initialisierung" };
  const tail = log.slice(-2000);
  if (/Fertig\.\s*CSV:/i.test(tail)) return { phase: "Abgeschlossen" };
  const counter = [...tail.matchAll(/\[(\d+)\/(\d+)\]/g)].pop();
  if (counter) {
    return {
      phase: "Verarbeite Einträge",
      detail: `${counter[1]} / ${counter[2]}`,
    };
  }
  if (/CRM:/.test(tail)) return { phase: "CRM-Push (Twenty)" };
  if (/extractor|extract/i.test(tail))
    return { phase: "Inhalts-Extraktion (LLM)" };
  if (/social_finder|social/i.test(tail)) return { phase: "Social-Lookup" };
  if (/enrich/i.test(tail)) return { phase: "Anreicherung" };
  if (/Verarbeite\s+\d+\s+Einträge/i.test(tail))
    return { phase: "Discovery abgeschlossen" };
  if (/Cache:.*DB/i.test(tail)) return { phase: "Cache geladen" };
  if (/^\s*\.+/m.test(tail) || /Searching|Suche|google/i.test(tail))
    return { phase: "Discovery (Google Maps)" };
  return { phase: "Initialisierung" };
}

function profileIcon(key: string) {
  switch (key) {
    case "physio":
      return <HeartPulse size={14} />;
    case "aerzte":
      return <Stethoscope size={14} />;
    case "sportvereine":
      return <Trophy size={14} />;
    default:
      return <Activity size={14} />;
  }
}

export function ScraperPanel({ disabled }: { disabled: boolean }) {
  // --- profile state -------------------------------------------------
  const [profileKey, setProfileKey] = useState<string>("physio");
  const [profilesMeta, setProfilesMeta] = useState<ProfileMeta[]>([]);
  const [profileStatuses, setProfileStatuses] = useState<ProfileStatus[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<
    Record<string, string[]>
  >({});

  const profile = useMemo<ProfileMeta | undefined>(
    () => profilesMeta.find((p) => p.key === profileKey),
    [profilesMeta, profileKey],
  );
  const profileStatus = useMemo<ProfileStatus | undefined>(
    () => profileStatuses.find((p) => p.key === profileKey),
    [profileStatuses, profileKey],
  );

  // --- form state ----------------------------------------------------
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
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [cache, setCache] = useState<CacheSummary | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cachePushingScope, setCachePushingScope] = useState<string | null>(
    null,
  );
  const pollRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status?.state !== "running") return;
    const t = window.setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000);
    return () => window.clearInterval(t);
  }, [status?.state]);
  const logRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (status?.state === "running") {
      el.scrollTop = el.scrollHeight;
    }
  }, [status?.log_tail, status?.state]);

  // --- fetchers ------------------------------------------------------

  const fetchProfilesMeta = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scraper/profiles", {
        cache: "no-store",
      });
      const j = await r.json();
      const list = (j.profiles ?? []) as ProfileMeta[];
      setProfilesMeta(list);
    } catch {
      setProfilesMeta([]);
    }
  }, []);

  const fetchProfileStatuses = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scraper/profile-status", {
        cache: "no-store",
      });
      const j = await r.json();
      setProfileStatuses((j.profiles ?? []) as ProfileStatus[]);
    } catch {
      setProfileStatuses([]);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scraper/status", { cache: "no-store" });
      const j = (await r.json()) as Status;
      setStatus(j);
    } catch (e) {
      setStatus((prev) => ({
        ...(prev ?? { state: "idle" }),
        reachable: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  const fetchCacheSummary = useCallback(
    async (forProfile: string | null) => {
      setCacheLoading(true);
      try {
        const qs = forProfile
          ? `?profile=${encodeURIComponent(forProfile)}`
          : "";
        const r = await fetch(`/api/admin/scraper/cache-summary${qs}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as CacheSummary;
        setCache(j);
      } catch (e) {
        setCache({
          total: 0,
          pushed: 0,
          unpushed: 0,
          by_canton: [],
          reachable: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setCacheLoading(false);
      }
    },
    [],
  );

  const fetchPreflight = useCallback(
    async (forProfile: string | null) => {
      setPreflightLoading(true);
      try {
        const qs = forProfile
          ? `?profile=${encodeURIComponent(forProfile)}`
          : "";
        const r = await fetch(`/api/admin/scraper/preflight${qs}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as Preflight;
        setPreflight(j);
      } catch (e) {
        setPreflight({
          ok: false,
          reachable: false,
          missing: [],
          present: [],
          details: {},
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setPreflightLoading(false);
      }
    },
    [],
  );

  /** Cache push uses the runner's `--push-cache` flag, scoped to current profile. */
  const handlePushCache = useCallback(
    async (scopeCanton: string | null) => {
      if (cachePushingScope) return;
      const scopeLabel = scopeCanton ?? "alle";
      const confirmMsg = scopeCanton
        ? `Profil ${profileKey}: alle ungepushten Cache-Einträge aus Kanton ${scopeCanton} jetzt ins CRM pushen?`
        : `Profil ${profileKey}: alle ungepushten Cache-Einträge ins CRM pushen?`;
      if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
      setCachePushingScope(scopeLabel);
      try {
        const body: Record<string, unknown> = {
          push_cache: true,
          profile: profileKey,
        };
        if (scopeCanton) body.canton = scopeCanton;
        const r = await fetch("/api/admin/scraper/trigger", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        void fetchStatus();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : String(e));
      } finally {
        setCachePushingScope(null);
      }
    },
    [cachePushingScope, fetchStatus, profileKey],
  );

  // --- mount + profile change effects --------------------------------

  // Initial load: profiles + statuses + global stuff.
  useEffect(() => {
    if (disabled) return;
    void fetchProfilesMeta();
    void fetchProfileStatuses();
    void fetchStatus();
  }, [disabled, fetchProfilesMeta, fetchProfileStatuses, fetchStatus]);

  // When the profile changes (or list arrives), refresh profile-scoped data.
  useEffect(() => {
    if (disabled) return;
    void fetchPreflight(profileKey);
    void fetchCacheSummary(profileKey);
  }, [disabled, profileKey, fetchPreflight, fetchCacheSummary]);

  // When profile metadata becomes available, seed specialty defaults
  // (UI checkboxes) and apply the profile's locked/default canton.
  useEffect(() => {
    if (!profile) return;
    setSelectedSpecialties((prev) => {
      if (prev[profile.key]) return prev;
      const defaults = profile.specialties
        .filter((s) => s.enabled_by_default)
        .map((s) => s.key);
      return { ...prev, [profile.key]: defaults };
    });
    if (profile.locked_canton) {
      setCanton(profile.locked_canton);
    } else if (profile.default_canton && !canton) {
      setCanton(profile.default_canton);
    }
    // We deliberately don't depend on `canton` here — only react when the
    // profile itself changes. Otherwise typing in the canton field would
    // trigger a re-seed loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.key]);

  // After a run finishes, refresh cache + statuses so the UI stays truthy.
  const lastRunFinishedAt = status?.finished_at;
  useEffect(() => {
    if (!lastRunFinishedAt) return;
    if (disabled) return;
    void fetchCacheSummary(profileKey);
    void fetchProfileStatuses();
  }, [
    lastRunFinishedAt,
    disabled,
    profileKey,
    fetchCacheSummary,
    fetchProfileStatuses,
  ]);

  useEffect(() => {
    if (disabled) return;
    const shouldPoll =
      status?.state === "running" || status?.reachable === false;
    if (!shouldPoll) {
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
  }, [status?.state, status?.reachable, fetchStatus, disabled]);

  // --- trigger -------------------------------------------------------

  async function handleTrigger() {
    if (disabled || !profile) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        profile: profileKey,
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
      const specs = selectedSpecialties[profileKey];
      if (specs && specs.length) body.specialties = specs;

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
      void fetchProfileStatuses();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // --- derived state -------------------------------------------------

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

  // One-shot lock blocks live triggers (dry-run still allowed).
  const oneShotLocked =
    profile?.one_shot && profileStatus?.locked && !dryRun;

  const preflightBlocking =
    preflight !== null &&
    preflight.reachable !== false &&
    preflight.ok === false;

  const triggerBlocked =
    disabled ||
    isRunning ||
    submitting ||
    preflightBlocking ||
    oneShotLocked === true;

  const cantonInputDisabled = disabled || isRunning || !!profile?.locked_canton;
  const specialties = profile?.specialties ?? [];

  return (
    <div className="space-y-6">
      <ProfilePicker
        profiles={profilesMeta}
        statuses={profileStatuses}
        selected={profileKey}
        onSelect={(k) => setProfileKey(k)}
        disabled={disabled}
      />

      <PreflightBanner
        preflight={preflight}
        loading={preflightLoading}
        onRefresh={() => void fetchPreflight(profileKey)}
        disabled={disabled}
        profileLabel={profile?.label ?? profileKey}
      />

      {oneShotLocked && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm flex items-start gap-2">
          <Lock size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-text-primary font-medium">
              {profile?.label} ist als one-shot Lauf gesperrt.
            </p>
            <p className="text-text-tertiary text-xs mt-0.5">
              Letzter erfolgreicher Lauf: {fmtDate(profileStatus?.last_run_at)} —{" "}
              {profileStatus?.run_count} Lauf
              {(profileStatus?.run_count ?? 0) === 1 ? "" : "e"} insgesamt.
              Re-Run nur per CLI mit{" "}
              <code>--force-rerun</code> möglich.
              Dry-Run-Modus ist weiterhin erlaubt.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1">
          <h2 className="text-text-primary text-base font-semibold">
            Neuen Scraper-Lauf starten
          </h2>
          <p className="text-text-tertiary text-xs mt-0.5">
            {profile?.description ??
              "Profil wählen — der Rest des Formulars passt sich an."}
          </p>
        </div>

        {specialties.length > 0 && (
          <div className="px-5 pt-4 border-b border-stroke-1 pb-4">
            <SpecialtyPicker
              specialties={specialties}
              selected={selectedSpecialties[profileKey] ?? []}
              onChange={(next) =>
                setSelectedSpecialties((prev) => ({
                  ...prev,
                  [profileKey]: next,
                }))
              }
              disabled={disabled || isRunning}
            />
          </div>
        )}

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

          <Field
            label={
              profile?.locked_canton
                ? `Kanton (gesperrt auf ${profile.locked_canton})`
                : "Kanton / Bundesland"
            }
          >
            <input
              list="canton-list"
              value={canton}
              onChange={(e) => setCanton(e.target.value.toUpperCase())}
              disabled={cantonInputDisabled}
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

          <Field label="Limit (max. Einträge)">
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
                disabled={disabled || isRunning || !profile?.extract_with_llm}
              />
              {profile?.extract_with_llm
                ? "LLM-Extraktion abschalten (Anthropic-Tokens sparen)"
                : "LLM-Extraktion ist für dieses Profil bereits deaktiviert"}
            </label>
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-stroke-1 flex items-center justify-between flex-wrap gap-2">
          {submitError ? (
            <span className="text-warning text-sm flex items-center gap-1.5">
              <AlertCircle size={14} />
              {submitError}
            </span>
          ) : oneShotLocked ? (
            <span className="text-warning text-xs flex items-center gap-1.5">
              <Lock size={14} />
              Live-Trigger gesperrt — Profil ist one-shot.
            </span>
          ) : preflightBlocking ? (
            <span className="text-warning text-xs flex items-center gap-1.5">
              <ShieldAlert size={14} />
              Trigger gesperrt — fehlt: {preflight?.missing.join(", ")}.
            </span>
          ) : (
            <span className="text-text-tertiary text-xs">
              Ein Klick = ein Lauf. Während der Subprozess läuft, ist der Button
              gesperrt.
            </span>
          )}
          <button
            type="button"
            onClick={handleTrigger}
            disabled={triggerBlocked}
            title={
              oneShotLocked
                ? "One-shot Lock — Re-Run nur per CLI mit --force-rerun"
                : preflightBlocking
                  ? `Konfiguration unvollständig: ${preflight?.missing.join(", ")}`
                  : undefined
            }
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

      <CachePanel
        cache={cache}
        loading={cacheLoading}
        onRefresh={() => void fetchCacheSummary(profileKey)}
        onPush={(c) => void handlePushCache(c)}
        pushingScope={cachePushingScope}
        disabled={disabled || isRunning || preflightBlocking}
        disabledReason={
          preflightBlocking
            ? "Konfiguration unvollständig — siehe Banner oben."
            : isRunning
              ? "Ein Lauf läuft gerade — bitte warten."
              : null
        }
        profileKey={profileKey}
        profileLabel={profile?.label ?? profileKey}
      />

      <ScheduleDiffSection
        profileKey={profileKey}
        profileLabel={profile?.label ?? profileKey}
        cache={cache}
        cacheLoading={cacheLoading}
        onRefreshCache={() => void fetchCacheSummary(profileKey)}
        disabled={disabled}
      />

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
                Wahrscheinlich Google-Maps-Wartezeit, LLM-Anfrage (Anthropic)
                oder Twenty antwortet langsam. Falls es zu lange dauert, lohnt
                sich <code>docker logs medtheris-scraper</code> auf dem Host.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfilePicker({
  profiles,
  statuses,
  selected,
  onSelect,
  disabled,
}: {
  profiles: ProfileMeta[];
  statuses: ProfileStatus[];
  selected: string;
  onSelect: (key: string) => void;
  disabled: boolean;
}) {
  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-stroke-1 bg-bg-chrome px-4 py-3 text-xs text-text-tertiary inline-flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        Lade Profile …
      </div>
    );
  }
  return (
    <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
      <div className="px-5 py-3 border-b border-stroke-1">
        <h2 className="text-text-primary text-sm font-semibold">
          Profil wählen
        </h2>
        <p className="text-text-quaternary text-[11px] mt-0.5">
          Welche Vertikale wird gescrapt? Profil bestimmt Discovery-Queries,
          LLM-Prompt, Twenty-Workspace und Tenant-Tag.
        </p>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {profiles.map((p) => {
          const active = p.key === selected;
          const st = statuses.find((s) => s.key === p.key);
          const locked = !!(p.one_shot && st?.locked);
          return (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(p.key)}
              className={`text-left rounded-md border px-3 py-2.5 transition-all flex flex-col gap-1 ${active ? "border-accent bg-accent/5" : "border-stroke-1 bg-bg-base hover:border-stroke-2"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium inline-flex items-center gap-1.5 ${active ? "text-accent" : "text-text-primary"}`}
                >
                  {profileIcon(p.key)}
                  {p.label}
                </span>
                {locked && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                    <Lock size={10} />
                    Gesperrt
                  </span>
                )}
                {p.one_shot && !locked && (
                  <span className="text-[10px] text-text-quaternary uppercase tracking-wide">
                    one-shot
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-tertiary leading-snug line-clamp-3">
                {p.description}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-text-quaternary mt-0.5">
                <span>workspace: {p.crm_workspace}</span>
                {st && st.run_count > 0 && (
                  <span title={st.last_run_at ?? ""}>
                    {st.run_count}× gelaufen, zuletzt{" "}
                    {fmtDate(st.last_run_at)}
                  </span>
                )}
                {st && st.run_count === 0 && <span>noch nie gelaufen</span>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SpecialtyPicker({
  specialties,
  selected,
  onChange,
  disabled,
}: {
  specialties: SpecialtyMeta[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };
  const allActive = specialties.length === selected.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-text-tertiary text-xs uppercase tracking-wide">
          Fachgebiete
        </h3>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            disabled={disabled || allActive}
            onClick={() => onChange(specialties.map((s) => s.key))}
            className="text-text-tertiary hover:text-text-primary disabled:opacity-40"
          >
            alle
          </button>
          <span className="text-text-quaternary">·</span>
          <button
            type="button"
            disabled={disabled || selected.length === 0}
            onClick={() => onChange([])}
            className="text-text-tertiary hover:text-text-primary disabled:opacity-40"
          >
            keine
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
        {specialties.map((s) => {
          const active = selected.includes(s.key);
          return (
            <label
              key={s.key}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${active ? "border-accent bg-accent/5 text-text-primary" : "border-stroke-1 bg-bg-base text-text-secondary hover:border-stroke-2"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={active}
                disabled={disabled}
                onChange={() => toggle(s.key)}
                className="shrink-0"
              />
              <span className="truncate">{s.label}</span>
            </label>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-warning">
          Mindestens ein Fachgebiet auswählen — sonst wird die Discovery
          abgebrochen (keine Such-Queries).
        </p>
      )}
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
      <Badge tone="muted" icon={<Loader2 size={12} className="animate-spin" />}>
        Runner gerade nicht erreichbar — automatischer Reconnect läuft
        {status.error ? ` (${status.error})` : ""}
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
          Letzter Lauf mit Fehler beendet (exit {status.exit_code ?? "?"})
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

function ScheduleDiffSection({
  profileKey,
  profileLabel,
  cache,
  cacheLoading,
  onRefreshCache,
  disabled,
}: {
  profileKey: string;
  profileLabel: string;
  cache: CacheSummary | null;
  cacheLoading: boolean;
  onRefreshCache: () => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const storageKey = `scraper-cache-diff-ref:${profileKey}`;
  const [refSnap, setRefSnap] = useState<CacheSummary | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/scraper/schedule", {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = (await r.json()) as { notes?: string };
        if (typeof j.notes === "string") setNotes(j.notes);
      } catch {
        /* ignore */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setRefSnap(JSON.parse(raw) as CacheSummary);
      else setRefSnap(null);
    } catch {
      setRefSnap(null);
    }
  }, [profileKey, storageKey]);

  const saveNotes = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/scraper/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } finally {
      setSaving(false);
    }
  };

  const captureRef = () => {
    if (!cache || cache.reachable === false) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(cache));
      setRefSnap(cache);
    } catch {
      /* ignore */
    }
  };

  const diffRows = useMemo(() => {
    if (!refSnap?.by_canton || !cache?.by_canton) return [];
    const prev = new Map(refSnap.by_canton.map((r) => [r.canton, r]));
    return cache.by_canton.map((row) => {
      const p = prev.get(row.canton);
      return {
        canton: row.canton,
        dTotal: p ? row.total - p.total : row.total,
        dPush: p ? row.pushed - p.pushed : row.pushed,
        dUn: p ? row.unpushed - p.unpushed : row.unpushed,
      };
    });
  }, [refSnap, cache]);

  return (
    <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
      <div className="px-5 py-4 border-b border-stroke-1">
        <h2 className="text-text-primary text-base font-semibold flex items-center gap-2">
          <Clock size={14} className="text-text-tertiary" />
          Planung &amp; Cache-Diff
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary border border-stroke-1 rounded px-1.5 py-0.5">
            {profileLabel}
          </span>
        </h2>
        <p className="text-text-tertiary text-xs mt-1 max-w-prose">
          Notizen für euren echten Cron (Host). Diff vergleicht die aktuelle
          Cache-Übersicht mit einer Referenz in diesem Browser.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wide text-text-quaternary">
            Betriebs-Notiz (serverseitig)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled || !loaded}
            rows={3}
            placeholder="z. B. Physio ZH — täglich 05:30 UTC"
            className="w-full bg-bg-base border border-stroke-1 rounded-md px-3 py-2 text-sm text-text-primary disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void saveNotes()}
            className="text-xs px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary"
          >
            {saving ? "Speichert…" : "Notiz speichern"}
          </button>
        </div>
        <div className="rounded-md border border-stroke-1 bg-bg-base p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-secondary">
              Cache-Diff
            </span>
            <button
              type="button"
              disabled={
                disabled ||
                cacheLoading ||
                !cache ||
                cache.reachable === false
              }
              onClick={captureRef}
              className="text-[11px] px-2 py-1 rounded border border-stroke-1 hover:border-stroke-2 text-text-tertiary"
            >
              Referenz setzen
            </button>
            <button
              type="button"
              disabled={disabled || cacheLoading}
              onClick={onRefreshCache}
              className="text-[11px] px-2 py-1 rounded border border-stroke-1 hover:border-stroke-2 text-text-tertiary inline-flex items-center gap-1"
            >
              <RefreshCw
                size={11}
                className={cacheLoading ? "animate-spin" : ""}
              />
              Aktualisieren
            </button>
          </div>
          {!refSnap ? (
            <p className="text-text-quaternary text-[11px] italic">
              Noch keine Referenz — „Referenz setzen“ speichert den aktuellen
              Stand aus der Cache-Übersicht.
            </p>
          ) : !cache || cache.by_canton.length === 0 ? (
            <p className="text-text-quaternary text-[11px]">Keine Cache-Zeilen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-text-quaternary border-b border-stroke-1">
                    <th className="py-1 pr-2">Kanton</th>
                    <th className="py-1 pr-2">Δ total</th>
                    <th className="py-1 pr-2">Δ CRM</th>
                    <th className="py-1 pr-2">Δ offen</th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((r) => (
                    <tr key={r.canton} className="border-b border-stroke-1/60">
                      <td className="py-1 pr-2 font-mono">{r.canton}</td>
                      <td className="py-1 pr-2 tabular-nums text-text-secondary">
                        {r.dTotal > 0 ? "+" : ""}
                        {r.dTotal}
                      </td>
                      <td className="py-1 pr-2 tabular-nums text-text-secondary">
                        {r.dPush > 0 ? "+" : ""}
                        {r.dPush}
                      </td>
                      <td className="py-1 pr-2 tabular-nums text-text-secondary">
                        {r.dUn > 0 ? "+" : ""}
                        {r.dUn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CachePanel({
  cache,
  loading,
  onRefresh,
  onPush,
  pushingScope,
  disabled,
  disabledReason,
  profileKey,
  profileLabel,
}: {
  cache: CacheSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onPush: (canton: string | null) => void;
  pushingScope: string | null;
  disabled: boolean;
  disabledReason: string | null;
  profileKey: string;
  profileLabel: string;
}) {
  if (cache === null && loading) return null;
  if (cache === null) return null;
  if (cache.reachable === false) return null;

  const hasUnpushed = cache.unpushed > 0;
  const allBusy = pushingScope === "alle";

  return (
    <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
      <div className="px-5 py-4 border-b border-stroke-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-text-tertiary" />
          <h2 className="text-text-primary text-base font-semibold">
            Lokaler Cache → CRM
          </h2>
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary border border-stroke-1 rounded px-1.5 py-0.5 ml-1">
            {profileLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-text-tertiary tabular-nums">
            {cache.total} im Cache · {cache.pushed} im CRM ·{" "}
            <strong
              className={
                hasUnpushed ? "text-warning" : "text-text-tertiary"
              }
            >
              {cache.unpushed} ungepusht
            </strong>
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Aktualisieren
          </button>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-text-tertiary text-xs leading-snug max-w-prose">
          Einträge, die der Scraper im <em>Dry-Run</em> oder bei einem
          unterbrochenen Lauf gefunden + angereichert hat, landen erst in der
          lokalen SQLite-Cache-DB. Erst beim Klick unten gehen sie nach Twenty
          (CRM) — ohne neue Google-Maps-, Crawl- oder LLM-Kosten. Idempotent:
          doppeltes Klicken erzeugt keine Duplikate.
        </p>

        {cache.by_canton.length === 0 ? (
          <p className="text-text-quaternary text-xs italic">
            Cache ist leer für dieses Profil — starte oben einen ersten
            Scraper-Lauf.
          </p>
        ) : (
          <div className="rounded-md border border-stroke-1 bg-bg-base divide-y divide-stroke-1">
            {cache.by_canton.map((row) => {
              const rowBusy = pushingScope === row.canton || allBusy;
              return (
                <div
                  key={row.canton}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-text-primary text-xs px-2 py-0.5 rounded bg-bg-chrome border border-stroke-1 shrink-0">
                      {row.canton}
                    </span>
                    <span className="tabular-nums text-text-secondary text-xs">
                      {row.total} total
                    </span>
                    <span className="tabular-nums text-text-quaternary text-xs">
                      · {row.pushed} im CRM
                    </span>
                    <span
                      className={`tabular-nums text-xs ${row.unpushed > 0 ? "text-warning" : "text-text-quaternary"}`}
                    >
                      · {row.unpushed} ungepusht
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPush(row.canton)}
                    disabled={disabled || rowBusy || row.unpushed === 0}
                    title={
                      disabled
                        ? (disabledReason ?? undefined)
                        : row.unpushed === 0
                          ? "Alles bereits im CRM"
                          : `Push ${row.unpushed} aus ${row.canton}`
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-stroke-1 bg-bg-chrome text-text-secondary text-xs hover:text-text-primary hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {rowBusy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ArrowRight size={12} />
                    )}
                    {row.unpushed > 0 ? `Push ${row.unpushed}` : "Erledigt"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {cache.by_profile && cache.by_profile.length > 1 && (
          <div className="text-[11px] text-text-quaternary">
            <span className="text-text-tertiary mr-1">Anderes Profil?</span>
            {cache.by_profile
              .filter((p) => p.profile !== profileKey)
              .map((p, i, arr) => (
                <span key={p.profile}>
                  {p.profile}: {p.total} total ({p.unpushed} ungepusht)
                  {i < arr.length - 1 ? " · " : ""}
                </span>
              ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {disabled && disabledReason ? (
            <span className="text-text-tertiary text-xs">{disabledReason}</span>
          ) : hasUnpushed ? (
            <span className="text-text-tertiary text-xs">
              Push schiebt nur ungepushte Einträge hoch — keine Detail-Calls,
              keine LLM-Tokens, keine Web-Crawls.
            </span>
          ) : (
            <span className="text-text-tertiary text-xs">
              Cache ist leer oder vollständig im CRM.
            </span>
          )}
          <button
            type="button"
            onClick={() => onPush(null)}
            disabled={disabled || allBusy || !hasUnpushed}
            title={
              disabled
                ? (disabledReason ?? undefined)
                : !hasUnpushed
                  ? "Nichts zu pushen"
                  : `Push alle ${cache.unpushed} ungepushten Einträge`
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {allBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            {hasUnpushed
              ? `Alle ${cache.unpushed} ins CRM pushen`
              : "Cache leer"}
          </button>
        </div>
      </div>
    </section>
  );
}

function PreflightBanner({
  preflight,
  loading,
  onRefresh,
  disabled,
  profileLabel,
}: {
  preflight: Preflight | null;
  loading: boolean;
  onRefresh: () => void;
  disabled: boolean;
  profileLabel: string;
}) {
  if (disabled) return null;
  if (preflight === null && loading) {
    return (
      <div className="rounded-lg border border-stroke-1 bg-bg-chrome px-4 py-3 text-xs text-text-tertiary inline-flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        Pre-flight für {profileLabel} läuft …
      </div>
    );
  }
  if (preflight === null) return null;

  if (preflight.reachable === false) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-text-primary font-medium">
              Scraper-Runner nicht erreichbar
            </p>
            <p className="text-text-tertiary text-xs mt-0.5">
              {preflight.error ?? "Keine weiteren Details vom Proxy."}
            </p>
            <p className="text-text-tertiary text-xs mt-2">
              Auf dem Host: <code>docker compose ps medtheris-scraper</code> und{" "}
              <code>docker logs medtheris-scraper --tail 50</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="text-text-tertiary hover:text-text-primary text-xs inline-flex items-center gap-1 shrink-0"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Erneut prüfen
          </button>
        </div>
      </div>
    );
  }

  if (preflight.ok) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-2.5 text-xs flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-success">
          <ShieldCheck size={14} />
          {profileLabel}: Konfiguration ok — alle Pflicht-Keys gesetzt.
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="text-text-quaternary">
            {preflight.present.length} required ·{" "}
            {Object.values(preflight.details).filter((d) => !d.required && d.set)
              .length}{" "}
            optional
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            neu prüfen
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className="text-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-medium">
            {profileLabel}: Konfiguration unvollständig — Trigger gesperrt
          </p>
          <p className="text-text-tertiary text-xs mt-0.5">
            Folgende Pflicht-Variablen fehlen im Runner-Container. Setze sie in{" "}
            <code>/opt/corelab/.env</code> und führe{" "}
            <code>docker compose up -d medtheris-scraper</code> aus.
          </p>
          <ul className="mt-2 space-y-1">
            {preflight.missing.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2 text-xs text-text-secondary"
              >
                <span className="font-mono text-warning shrink-0">{key}</span>
                <span className="text-text-tertiary">
                  {ENV_KEY_HINTS[key] ??
                    "Erforderlich — siehe medtheris-scraper README."}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-text-tertiary hover:text-text-primary text-xs inline-flex items-center gap-1 shrink-0"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Erneut prüfen
        </button>
      </div>
    </div>
  );
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
