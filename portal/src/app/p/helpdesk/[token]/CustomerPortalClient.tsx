"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TicketDetail } from "@/lib/helpdesk/types";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

/**
 * Read-only, customer-facing view for a single ticket. Loads from the
 * public `/api/p/helpdesk/[token]` endpoint and lets the customer post
 * a non-internal reply via `/api/p/helpdesk/[token]/reply`.
 *
 * Server-rendered initial snapshot is passed in via props so the page
 * is meaningful before JS hydrates; afterwards the client re-fetches
 * every 30s so the customer sees agent replies live.
 */
export function CustomerPortalClient({
  token,
  ticket: initialTicket,
  expiresAt,
  workspace,
}: {
  token: string;
  ticket: TicketDetail;
  expiresAt: number;
  workspace: string;
}) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const [ticket, setTicket] = useState<TicketDetail>(initialTicket);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`/api/p/helpdesk/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.ticket) setTicket(j.ticket);
    } catch {
      /* polling failure is non-fatal */
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // Live-refresh every 30s so the customer sees agent replies without
  // having to reload the page.
  useEffect(() => {
    const t = setInterval(() => void refetch(), 30_000);
    return () => clearInterval(t);
  }, [refetch]);

  const send = useCallback(async () => {
    const text = reply.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(
        `/api/p/helpdesk/${encodeURIComponent(token)}/reply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setReply("");
      setInfo(t("portal.helpdeskPublic.replySent"));
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [reply, token, refetch, t]);

  const ticketHeader = useMemo(() => {
    return {
      number: ticket.number,
      title: ticket.title,
      state: ticket.stateName,
      priority: ticket.priorityName,
      created: new Date(ticket.createdAt).toLocaleString(localeFmt),
      updated: new Date(ticket.updatedAt).toLocaleString(localeFmt),
    };
  }, [ticket, localeFmt]);

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <header className="rounded-lg border border-stroke-1 bg-bg-elevated p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] uppercase tracking-wide text-text-quaternary">
                {workspace} · Ticket #{ticketHeader.number}
              </p>
              <h1 className="text-[16px] sm:text-[18px] font-semibold mt-0.5 leading-snug break-words">
                {ticketHeader.title}
              </h1>
              <p className="text-[12px] text-text-tertiary mt-1.5">
                {t("portal.helpdeskPublic.statusPrefix")}{" "}
                <span className="text-text-secondary">{ticketHeader.state}</span>
                {ticketHeader.priority && (
                  <>
                    {" "}
                    · {t("portal.helpdeskPublic.priorityPrefix")}{" "}
                    <span className="text-text-secondary">
                      {ticketHeader.priority}
                    </span>
                  </>
                )}
              </p>
              <p className="text-[11px] text-text-quaternary mt-0.5">
                {t("portal.helpdeskPublic.metaOpenedUpdated")
                  .replace("{opened}", ticketHeader.created)
                  .replace("{updated}", ticketHeader.updated)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={refreshing}
              className="text-[11px] px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary disabled:opacity-60"
              title={t("portal.helpdeskPublic.refreshTitle")}
            >
              {refreshing
                ? t("portal.helpdeskPublic.refreshing")
                : t("portal.helpdeskPublic.refresh")}
            </button>
          </div>
        </header>

        <section className="space-y-2.5">
          {ticket.articles.length === 0 ? (
            <p className="text-[12px] text-text-tertiary px-1">
              {t("portal.helpdeskPublic.noArticles")}
            </p>
          ) : (
            ticket.articles.map((a) => (
              <ArticleBubble key={a.id} article={a} />
            ))
          )}
        </section>

        <section className="rounded-lg border border-stroke-1 bg-bg-elevated p-4 sm:p-5">
          <h2 className="text-[12.5px] font-semibold mb-2">
            {t("portal.helpdeskPublic.replyHeading")}
          </h2>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("portal.helpdeskPublic.replyPlaceholder")}
            rows={6}
            className="w-full bg-bg-base border border-stroke-1 rounded-md px-3 py-2 text-[13px] outline-none focus:border-stroke-2 leading-relaxed resize-y"
            maxLength={32 * 1024}
          />
          {error && (
            <p className="text-[12px] text-red-400 mt-2 whitespace-pre-wrap">
              {error}
            </p>
          )}
          {info && !error && (
            <p className="text-[12px] text-emerald-400 mt-2">{info}</p>
          )}
          <div className="flex items-center justify-between gap-2 mt-3">
            <p className="text-[10.5px] text-text-quaternary">
              {t("portal.helpdeskPublic.linkExpires")}{" "}
              {new Date(expiresAt * 1000).toLocaleDateString(localeFmt)}
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={submitting || !reply.trim()}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-[12.5px] font-medium hover:bg-blue-500 disabled:opacity-60"
            >
              {submitting
                ? t("portal.helpdeskPublic.sending")
                : t("portal.helpdeskPublic.sendReply")}
            </button>
          </div>
        </section>

        <footer className="pt-2 text-center text-[10.5px] text-text-quaternary">
          {t("portal.helpdeskPublic.footerMagicLink")}
        </footer>
      </div>
    </main>
  );
}

function ArticleBubble({ article }: { article: TicketDetail["articles"][number] }) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const isCustomer = article.senderName === "Customer";
  return (
    <article
      className={`rounded-lg border p-3 sm:p-4 ${
        isCustomer
          ? "border-stroke-1 bg-bg-elevated"
          : "border-blue-500/30 bg-blue-500/5"
      }`}
    >
      <header className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[11.5px] font-semibold">
          {article.fromName ||
            article.senderName ||
            t("portal.helpdeskPublic.unknownAuthor")}
          <span className="ml-2 text-[10px] uppercase tracking-wide text-text-quaternary">
            {article.senderName}
          </span>
        </div>
        <time
          className="text-[10.5px] text-text-quaternary tabular-nums"
          dateTime={article.createdAt}
        >
          {new Date(article.createdAt).toLocaleString(localeFmt)}
        </time>
      </header>
      <div
        className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed break-words"
        // bodyHtml comes from Zammad already sanitised in our normaliseArticle path
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />
    </article>
  );
}
