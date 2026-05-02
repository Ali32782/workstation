"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, ArrowUpRight, Loader2, HeadphonesIcon, Mail } from "lucide-react";
import { useT } from "@/components/LocaleProvider";

/**
 * Unified-Inbox card for the Daily Home dashboard.
 *
 * Aggregates the three "anybody waiting on me?" signals into one card so
 * a user opening the portal in the morning can see in 200 ms whether
 * the day starts at zero-inbox or with 17 fires.
 *
 *   Mail unread     — IMAP folder list (sums all inboxes' unread)
 *   Helpdesk open   — Zammad open ticket count from the existing stats route
 *   SLA at risk     — same source, surfaced separately because it's the
 *                     most actionable number on the card
 *
 * Chat unread is deliberately *not* included yet: RocketChat needs a
 * per-user subscription scan that's slower than the other two; we'll
 * add it in a follow-up wave once the API is cached.
 */
export function UnifiedInboxCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const t = useT();
  const [mailUnread, setMailUnread] = useState<number | null>(null);
  const [helpdesk, setHelpdesk] = useState<{
    open: number;
    sla: number;
    notConfigured: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const tasks: Array<Promise<unknown>> = [];

      // Mail — sums unread counts across all inboxes / customs. The
      // route already enforces auth + per-user mailbox resolution.
      tasks.push(
        fetch("/api/mail/folders", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (!alive || !j || !Array.isArray(j.folders)) return;
            const sum = (j.folders as Array<{ role: string; unread: number }>)
              .filter(
                (f) =>
                  f.role === "inbox" ||
                  f.role === "custom" ||
                  f.role === "archive",
              )
              .reduce((acc, f) => acc + (Number(f.unread) || 0), 0);
            setMailUnread(sum);
          })
          .catch(() => {
            if (alive) setMailUnread(null);
          }),
      );

      // Helpdesk — workspace-scoped; route returns 503 when Zammad
      // isn't configured for this workspace, which we treat as a
      // graceful "hide section" rather than an error toast.
      tasks.push(
        fetch(`/api/helpdesk/stats?ws=${workspaceId}`, { cache: "no-store" })
          .then(async (r) => {
            if (!alive) return;
            if (r.status === 503) {
              setHelpdesk({ open: 0, sla: 0, notConfigured: true });
              return;
            }
            if (!r.ok) return;
            const j = (await r.json()) as {
              openCount?: number;
              slaAtRiskCount?: number;
            };
            setHelpdesk({
              open: Number(j.openCount) || 0,
              sla: Number(j.slaAtRiskCount) || 0,
              notConfigured: false,
            });
          })
          .catch(() => {
            if (alive) setHelpdesk({ open: 0, sla: 0, notConfigured: true });
          }),
      );

      await Promise.allSettled(tasks);
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const total =
    (mailUnread ?? 0) + (helpdesk?.notConfigured ? 0 : helpdesk?.open ?? 0);

  return (
    <section className="rounded-xl border border-stroke-1 bg-bg-elevated px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Inbox size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">{t("dash.inbox.title")}</h2>
          <p className="text-text-tertiary text-[11px]">
            {busy
              ? t("dash.inbox.loadingSnapshot")
              : total === 0
                ? t("dash.inbox.allDone")
                : t("dash.inbox.waitingMany").replace("{n}", String(total))}
          </p>
        </div>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-text-tertiary text-[12px]">
          <Loader2 size={12} className="spin" />
          {t("dash.inbox.loading")}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <InboxStat
            label={t("dash.inbox.mailUnread")}
            value={mailUnread}
            href={`/${workspaceId}/mail`}
            Icon={Mail}
            tone="text-sky-300"
            hint={t("dash.inbox.allFoldersHint")}
          />
          {!helpdesk?.notConfigured && (
            <InboxStat
              label={t("dash.inbox.ticketsOpen")}
              value={helpdesk?.open ?? null}
              href={`/${workspaceId}/helpdesk`}
              Icon={HeadphonesIcon}
              tone="text-amber-300"
              hint={
                helpdesk?.sla
                  ? t("dash.inbox.ticketsWithSla").replace("{n}", String(helpdesk.sla))
                  : t("dash.inbox.ticketsNoSla")
              }
            />
          )}
          {helpdesk?.notConfigured && (
            <div className="rounded-lg border border-dashed border-stroke-1 bg-bg-base px-3 py-2 text-[11px] text-text-tertiary leading-snug">
              {t("dash.inbox.helpdeskDisabled")}
            </div>
          )}
          <InboxStat
            label={t("dash.inbox.slaRisk")}
            value={helpdesk?.notConfigured ? null : helpdesk?.sla ?? 0}
            href={`/${workspaceId}/helpdesk?filter=sla`}
            Icon={HeadphonesIcon}
            tone="text-red-300"
            hint={t("dash.inbox.slaRiskHint")}
            mute={helpdesk?.notConfigured}
          />
        </div>
      )}
    </section>
  );
}

function InboxStat({
  label,
  value,
  href,
  Icon,
  tone,
  hint,
  mute,
}: {
  label: string;
  value: number | null;
  href: string;
  Icon: typeof Mail;
  tone: string;
  hint: string;
  mute?: boolean;
}) {
  const display = value === null ? "—" : String(value);
  return (
    <Link
      href={href}
      className={`group rounded-lg border border-stroke-1 bg-bg-base px-3 py-2 transition-colors hover:border-stroke-2 ${
        mute ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <Icon size={12} className="text-text-tertiary" />
        <ArrowUpRight
          size={11}
          className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
      <div className={`text-[20px] font-semibold tabular-nums ${tone}`}>
        {display}
      </div>
      <div className="text-[11px] text-text-secondary truncate">{label}</div>
      <div className="text-[10px] text-text-quaternary mt-0.5 truncate">
        {hint}
      </div>
    </Link>
  );
}
