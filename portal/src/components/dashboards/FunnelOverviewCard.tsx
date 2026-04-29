"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, ArrowUpRight, Loader2 } from "lucide-react";

/**
 * Funnel-Overview Card for the Daily Home dashboard.
 *
 * Joins the live CRM company total with the live Mautic contact count
 * to give a one-glance answer to "how full is my funnel right now?".
 * The numbers are deliberately rough — we trade Sankey-precision for
 * a 200ms render. A full Sankey-Diagramm follows in a later wave when
 * we have stage-progression data.
 *
 * Only renders for workspaces that have Mautic configured (medtheris
 * today). For other workspaces it renders nothing — quietly absent
 * rather than showing a "Mautic not configured" warning that the user
 * can't act on from this page.
 */
export function FunnelOverviewCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const [data, setData] = useState<{
    crmCompanies: number;
    mauticTotal: number;
    matchedDomains: number;
  } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId !== "medtheris") {
      setBusy(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        // Two parallel calls: one against the CRM list to get the
        // total company count we know about, one against the Mautic
        // status endpoint we just shipped to get the bucket map.
        const [companiesRes, statusRes] = await Promise.all([
          fetch(`/api/crm/companies?ws=${workspaceId}&limit=1`, {
            cache: "no-store",
          }),
          fetch(`/api/crm/companies/mautic-status?ws=${workspaceId}`, {
            cache: "no-store",
          }),
        ]);
        if (!alive) return;
        const cj = (await companiesRes.json()) as {
          items?: unknown[];
          totalCount?: number;
          total?: number;
        };
        const sj = (await statusRes.json()) as {
          buckets?: Record<string, number>;
          total?: number;
        };
        const crmCompanies =
          typeof cj.totalCount === "number"
            ? cj.totalCount
            : typeof cj.total === "number"
              ? cj.total
              : (cj.items?.length ?? 0);
        const matchedDomains = Object.keys(sj.buckets ?? {}).length;
        const mauticTotal = sj.total ?? 0;
        setData({ crmCompanies, mauticTotal, matchedDomains });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  if (workspaceId !== "medtheris") return null;

  return (
    <section className="rounded-xl border border-stroke-1 bg-bg-elevated px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Megaphone size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">Funnel</h2>
          <p className="text-text-tertiary text-[11px]">
            CRM × Mautic — Live-Snapshot
          </p>
        </div>
        <Link
          href={`/${workspaceId}/marketing`}
          className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          Mautic <ArrowUpRight size={11} />
        </Link>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-text-tertiary text-[12px]">
          <Loader2 size={12} className="spin" />
          Lade Funnel-Stand …
        </div>
      ) : error ? (
        <p className="text-[12px] text-amber-300">{error}</p>
      ) : data ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="CRM-Firmen"
            value={data.crmCompanies}
            hint="im Twenty-CRM"
            tone="text-emerald-300"
          />
          <Stat
            label="In Funnel"
            value={data.matchedDomains}
            hint="Domains in Mautic"
            tone="text-fuchsia-300"
          />
          <Stat
            label="Mautic-Kontakte"
            value={data.mauticTotal}
            hint="Total in Mautic"
            tone="text-sky-300"
          />
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-stroke-1 bg-bg-base px-3 py-2">
      <div className={`text-[20px] font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className="text-[10px] text-text-quaternary mt-0.5">{hint}</div>
    </div>
  );
}
