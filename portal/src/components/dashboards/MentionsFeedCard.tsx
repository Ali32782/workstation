"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AtSign,
  ArrowUpRight,
  Hash,
  Lock,
  MessageSquare,
  Loader2,
  RefreshCw,
} from "lucide-react";

/**
 * Cross-channel "@mentions for you" card on the Daily-Home dashboard.
 *
 * Right now this is chat-only (Rocket.Chat subscriptions with
 * `userMentions > 0`). We auto-load on mount and refresh every 90 s
 * because mention counts in chat can update silently when a colleague
 * pings you while the dashboard is open. We use `cache: "no-store"` to
 * sidestep Next.js's data-cache, which would otherwise pin the first
 * snapshot for the rest of the session.
 *
 * If the user has zero mentions we render a friendly empty state rather
 * than hiding the card — "you're caught up" is a useful signal too.
 */

type MentionRoom = {
  roomId: string;
  type: "c" | "p" | "d";
  name: string;
  userMentions: number;
  groupMentions: number;
  unread: number;
  workspace: string | null;
  lastUpdate: string | null;
};

const REFRESH_INTERVAL_MS = 90_000;

export function MentionsFeedCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const [items, setItems] = useState<MentionRoom[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/comms/mentions?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as {
        items?: MentionRoom[];
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setItems(j.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Hide entirely when the chat backend isn't configured for this user.
  // We can't tell that apart from a transient 502 without a status-code
  // signal, so we use the heuristic "first load failed *and* error
  // string mentions chat-provisioning". Keeps the card from being a
  // permanent yellow box on workspaces that don't have RC wired in.
  if (error && /chat-provisioning|unauthenticated/.test(error) && !items) {
    return null;
  }

  const totalMentions =
    items?.reduce((acc, it) => acc + it.userMentions + it.groupMentions, 0) ?? 0;

  return (
    <section className="rounded-xl border border-stroke-1 bg-bg-elevated px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <AtSign size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">
            Erwähnungen für dich
          </h2>
          <p className="text-text-tertiary text-[11px]">
            {busy && !items
              ? "Lade Chat-Erwähnungen …"
              : items === null
                ? "Bereit"
                : items.length === 0
                  ? "Keine offenen @-Erwähnungen"
                  : `${totalMentions} Erwähnung${totalMentions === 1 ? "" : "en"} in ${items.length} Raum${items.length === 1 ? "" : "en"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="text-text-tertiary hover:text-text-primary disabled:opacity-50"
          title="Aktualisieren"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
        </button>
        <Link
          href={`/${workspaceId}/chat`}
          className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          Chat <ArrowUpRight size={11} />
        </Link>
      </div>

      {error && !items ? (
        <p className="text-[12px] text-amber-300">{error}</p>
      ) : !items || items.length === 0 ? (
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          Du hast aktuell keine offenen Erwähnungen. Wenn dich jemand mit
          @{`<dein-name>`} pingt, taucht es hier auf — auch wenn du im
          Chat selbst nicht eingeloggt bist.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-1">
          {items.slice(0, 6).map((it) => {
            const Icon =
              it.type === "d"
                ? MessageSquare
                : it.type === "p"
                  ? Lock
                  : Hash;
            const total = it.userMentions + it.groupMentions;
            return (
              <li
                key={it.roomId}
                className="py-2 flex items-start gap-2.5 first:pt-0 last:pb-0"
              >
                <span
                  className="mt-1 shrink-0 inline-flex items-center justify-center rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-300 tabular-nums"
                  title={`${it.userMentions} direkte · ${it.groupMentions} Gruppen-Erwähnungen`}
                >
                  {total}
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/${workspaceId}/chat?room=${encodeURIComponent(it.roomId)}`}
                    className="text-[12.5px] text-text-primary hover:text-info truncate block leading-tight inline-flex items-center gap-1"
                    title={it.name}
                  >
                    <Icon size={11} className="text-text-tertiary" />
                    <span className="truncate">{it.name}</span>
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-tertiary truncate">
                    {it.unread > 0 && (
                      <>
                        <span>{it.unread} ungelesen</span>
                        <span className="opacity-60">·</span>
                      </>
                    )}
                    {it.userMentions > 0 && (
                      <span className="text-amber-300">
                        {it.userMentions}× direkt
                      </span>
                    )}
                    {it.groupMentions > 0 && (
                      <>
                        {it.userMentions > 0 && <span className="opacity-60">·</span>}
                        <span className="text-text-tertiary">
                          {it.groupMentions}× @here
                        </span>
                      </>
                    )}
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
