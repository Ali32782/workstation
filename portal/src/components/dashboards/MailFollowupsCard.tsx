"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MailQuestion,
  ArrowUpRight,
  Loader2,
  Clock,
  Send,
} from "lucide-react";
import { useT } from "@/components/LocaleProvider";

/**
 * "Worauf wartest du noch eine Antwort?"  Cross-references SENT mails
 * older than 5 days against INBOX replies (matched on Message-ID +
 * In-Reply-To/References, never subject) and surfaces the top 5
 * still-pending threads.
 *
 * The fetch is *intentionally* lazy: hidden behind a "Laden"-Button
 * because the IMAP fan-out costs ~1 s and most users open the
 * dashboard many times per day. Pre-fetching every page-load would
 * make every dashboard hit slower for a feature you only consult
 * during your end-of-day triage.
 */

type Followup = {
  uid: number;
  messageId: string;
  subject: string;
  to: Array<{ name?: string; address: string }>;
  sentAt: string;
  daysSinceSent: number;
  folder: string;
};

const DEFAULT_DAYS = 5;

export function MailFollowupsCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const t = useT();
  const [items, setItems] = useState<Followup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);

  const load = async (forDays: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/mail/followups?days=${forDays}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        items?: Followup[];
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setItems(j.items ?? []);
      setDays(forDays);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Auto-load once with default days. Background to keep dashboard snappy.
  useEffect(() => {
    void load(DEFAULT_DAYS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-xl border border-stroke-1 bg-bg-elevated px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <MailQuestion size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">
            {t("dash.followups.title")}
          </h2>
          <p className="text-text-tertiary text-[11px]">
            {busy
              ? t("dash.followups.busy")
              : items === null
                ? t("dash.followups.ready")
                : items.length === 0
                  ? t("dash.followups.empty").replace("{days}", String(days))
                  : t(
                      items.length === 1
                        ? "dash.followups.summaryOne"
                        : "dash.followups.summaryMany",
                    )
                      .replace("{n}", String(items.length))
                      .replace("{days}", String(days))}
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => void load(Number(e.target.value))}
          disabled={busy}
          className="text-[11px] bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5"
          title={t("dash.followups.thresholdTitle")}
        >
          <option value={3}>3d</option>
          <option value={5}>5d</option>
          <option value={7}>7d</option>
          <option value={14}>14d</option>
        </select>
        <Link
          href={`/${workspaceId}/mail`}
          className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          {t("dash.followups.mailLink")} <ArrowUpRight size={11} />
        </Link>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-text-tertiary text-[12px]">
          <Loader2 size={12} className="animate-spin" />
          {t("dash.followups.comparing")}
        </div>
      ) : error ? (
        <p className="text-[12px] text-amber-300">{error}</p>
      ) : !items || items.length === 0 ? (
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          {t("dash.followups.allClear").replace("{days}", String(days))}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-1">
          {items.slice(0, 5).map((it) => {
            const recipient = it.to[0];
            const recipientLabel =
              recipient?.name ?? recipient?.address ?? "—";
            const tone =
              it.daysSinceSent >= 14
                ? "text-red-400"
                : it.daysSinceSent >= 10
                  ? "text-amber-400"
                  : "text-text-tertiary";
            return (
              <li
                key={it.uid + it.messageId}
                className="py-2 flex items-start gap-2.5 first:pt-0 last:pb-0"
              >
                <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/${workspaceId}/mail?folder=${encodeURIComponent(it.folder)}&uid=${it.uid}`}
                    className="text-[12.5px] text-text-primary hover:text-info truncate block leading-tight"
                    title={it.subject}
                  >
                    {it.subject}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-tertiary truncate">
                    <Send size={9} />
                    <span className="truncate">
                      {t("dash.followups.recipientPrefix").replace(
                        "{recipient}",
                        recipientLabel,
                      )}
                    </span>
                    <span className="opacity-60">·</span>
                    <span className={`${tone} inline-flex items-center gap-0.5 tabular-nums`}>
                      <Clock size={9} />
                      {it.daysSinceSent}d
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
