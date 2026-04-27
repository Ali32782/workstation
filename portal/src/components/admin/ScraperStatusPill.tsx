"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Radar, Loader2, AlertTriangle, Activity, Pause } from "lucide-react";

type ScraperStatus = {
  state?: "idle" | "running" | "queued" | "error" | string;
  reachable?: boolean;
  phase?: string;
  startedAt?: string;
  lastHeartbeat?: string;
  error?: string;
  resultsCount?: number;
};

export function ScraperStatusPill() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/scraper/status", { cache: "no-store" });
        if (!alive) return;
        if (r.ok) {
          const j = (await r.json()) as ScraperStatus;
          setStatus(j);
        }
      } catch {
        if (alive) setStatus({ state: "error", reachable: false });
      } finally {
        if (alive) {
          setLoaded(true);
          // Poll faster while running so a stuck/finished run is visible quickly.
          const next = status?.state === "running" ? 8_000 : 30_000;
          timerRef.current = setTimeout(tick, next);
        }
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status?.state]);

  if (!loaded) return null;
  if (!status || status.reachable === false) {
    // Not configured or unreachable — show a discreet pill that links to the panel
    // so admins can investigate. Hides itself when truly empty.
    return (
      <Link
        href="/admin/onboarding/scraper"
        className="hidden md:inline-flex items-center gap-1.5 rounded-md text-xs font-medium px-2.5 py-1.5 border border-stroke-1 text-text-quaternary hover:text-text-secondary hover:border-stroke-2 transition-colors"
        title={status?.error ?? "Scraper-Runner nicht erreichbar"}
      >
        <Radar size={12} />
        Scraper
      </Link>
    );
  }

  const state = status.state ?? "idle";
  const isRunning = state === "running" || state === "queued";
  const isError = state === "error";

  let Icon: typeof Radar;
  let color: string;
  let label: string;
  if (isRunning) {
    Icon = Loader2;
    color = "var(--color-info)";
    label = state === "queued" ? "Scraper · queued" : "Scraper · läuft";
  } else if (isError) {
    Icon = AlertTriangle;
    color = "var(--color-danger)";
    label = "Scraper · Fehler";
  } else {
    Icon = Activity;
    color = "var(--color-success)";
    label = "Scraper · ok";
  }

  // Detect possible stall: no heartbeat for > 90s while running.
  let stalled = false;
  if (isRunning && status.lastHeartbeat) {
    const hb = new Date(status.lastHeartbeat).getTime();
    if (hb > 0 && Date.now() - hb > 90_000) {
      stalled = true;
      Icon = Pause;
      color = "var(--color-warning)";
      label = "Scraper · stockt";
    }
  }

  return (
    <Link
      href="/admin/onboarding/scraper"
      className="hidden md:inline-flex items-center gap-1.5 rounded-md text-xs font-medium px-2.5 py-1.5 border border-stroke-1 hover:border-stroke-2 transition-colors"
      style={{ color }}
      title={
        status.phase
          ? `${label} — ${status.phase}${status.resultsCount != null ? ` · ${status.resultsCount} Treffer` : ""}`
          : label
      }
    >
      <Icon size={12} className={isRunning && !stalled ? "animate-spin" : ""} />
      <span className="text-text-secondary">{label}</span>
    </Link>
  );
}
