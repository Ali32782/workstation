"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Radar,
  Loader2,
  AlertTriangle,
  Activity,
  Pause,
  ArrowRight,
  Clock,
} from "lucide-react";

type ScraperStatus = {
  state?: string;
  reachable?: boolean;
  phase?: string;
  startedAt?: string;
  finishedAt?: string;
  lastHeartbeat?: string;
  resultsCount?: number;
  newCompanies?: number;
  newPeople?: number;
  error?: string;
};

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

export function ScraperRunCard({ accent }: { accent: string }) {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/scraper/status", { cache: "no-store" });
        if (!alive) return;
        if (r.status === 403 || r.status === 401) {
          setForbidden(true);
          return;
        }
        if (r.ok) setStatus((await r.json()) as ScraperStatus);
      } catch {
        // keep last status
      } finally {
        if (alive) {
          const next = status?.state === "running" ? 8_000 : 30_000;
          timer = setTimeout(tick, next);
        }
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [status?.state]);

  if (forbidden) return null;
  if (!status) return null;
  if (status.reachable === false) {
    return (
      <Link
        href="/admin/onboarding/scraper"
        className="block rounded-lg border border-stroke-1 bg-bg-elevated px-4 py-3 hover:border-stroke-2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className="w-9 h-9 rounded flex items-center justify-center shrink-0"
            style={{ background: `${accent}18` }}
          >
            <Radar size={16} style={{ color: accent }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary">
              Lead-Scraper
            </p>
            <p className="text-[11px] text-text-tertiary">
              Runner nicht erreichbar — zur Konfiguration
            </p>
          </div>
          <ArrowRight size={14} className="text-text-tertiary" />
        </div>
      </Link>
    );
  }

  const state = status.state ?? "idle";
  const isRunning = state === "running" || state === "queued";
  const isError = state === "error";
  const stalled =
    isRunning &&
    !!status.lastHeartbeat &&
    Date.now() - new Date(status.lastHeartbeat).getTime() > 90_000;

  let Icon: typeof Radar;
  let color: string;
  let title: string;
  let subtitle: string;
  if (isRunning) {
    Icon = stalled ? Pause : Loader2;
    color = stalled ? "var(--color-warning)" : "var(--color-info)";
    title = stalled ? "Scraper stockt" : "Scraper läuft";
    subtitle = status.phase
      ? `${status.phase}${status.resultsCount != null ? ` · ${status.resultsCount} Treffer bisher` : ""}`
      : "Pipeline läuft …";
  } else if (isError) {
    Icon = AlertTriangle;
    color = "var(--color-danger)";
    title = "Letzter Lauf: Fehler";
    subtitle = status.error ?? "Details im Scraper-Panel ansehen";
  } else {
    Icon = Activity;
    color = "var(--color-success)";
    title = "Letzter Scraper-Lauf";
    const parts: string[] = [];
    if (status.finishedAt) parts.push(relativeTime(status.finishedAt));
    if (status.newCompanies != null) parts.push(`+${status.newCompanies} Firmen`);
    if (status.newPeople != null) parts.push(`+${status.newPeople} Kontakte`);
    if (status.resultsCount != null && parts.length === 0)
      parts.push(`${status.resultsCount} Treffer`);
    subtitle = parts.length > 0 ? parts.join(" · ") : "Bereit für nächsten Lauf";
  }

  return (
    <Link
      href="/admin/onboarding/scraper"
      className="block rounded-lg border border-stroke-1 bg-bg-elevated px-4 py-3 hover:border-stroke-2 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded flex items-center justify-center shrink-0"
          style={{ background: `${color === "var(--color-info)" ? accent : color}18`, color }}
        >
          <Icon size={16} className={isRunning && !stalled ? "animate-spin" : ""} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-text-primary truncate">
              {title}
            </p>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{ background: `${color}1f`, color }}
            >
              {state}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary truncate flex items-center gap-1.5">
            <Clock size={10} className="shrink-0" />
            {subtitle}
            {status.startedAt && isRunning && (
              <>
                {" "}· seit {relativeTime(status.startedAt)}
              </>
            )}
          </p>
        </div>
        <ArrowRight size={14} className="text-text-tertiary" />
      </div>
    </Link>
  );
}
