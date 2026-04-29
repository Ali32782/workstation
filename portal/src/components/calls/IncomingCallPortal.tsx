"use client";

import Link from "next/link";
import { Bell, MessageSquare, Phone, PhoneMissed } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CallSummary } from "@/lib/calls/types";
import type { IncomingChatRingDto } from "@/lib/comms/call-ring-types";
import type { WorkspaceId } from "@/lib/workspaces";

/** Hidden + idle: weniger Last. Sichtbar oder klingelnd: schneller nachziehen. */
const POLL_IDLE_MS = 14_000;
const POLL_VISIBLE_MS = 6_000;
const POLL_RINGING_MS = 3_500;

const BROADCAST_CHANNEL = "corelab-portal-incoming-call";
const NOTIFY_CLAIM_PREFIX = "corelab-portal-call-notify:";
const NOTIFY_CLAIM_TTL_MS = 120_000;

const STORAGE_KEY_PREFIX = "portal-incoming-dismissed:";

type UnifiedRow =
  | {
      kind: "portal";
      dismissKey: string;
      notifyKey: string;
      sortAt: string;
      call: CallSummary;
    }
  | {
      kind: "chat";
      dismissKey: string;
      notifyKey: string;
      sortAt: string;
      chat: IncomingChatRingDto;
    };

function tryClaimNotification(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const k = NOTIFY_CLAIM_PREFIX + key;
    const now = Date.now();
    const prev = localStorage.getItem(k);
    if (prev) {
      const t = Number(prev);
      if (Number.isFinite(t) && now - t < NOTIFY_CLAIM_TTL_MS) return false;
    }
    localStorage.setItem(k, String(now));
    window.setTimeout(() => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    }, NOTIFY_CLAIM_TTL_MS);
    return true;
  } catch {
    return true;
  }
}

function dismissedKey(workspaceId: string): string {
  return `${STORAGE_KEY_PREFIX}${workspaceId}`;
}

function loadDismissed(workspaceId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(dismissedKey(workspaceId));
    if (!raw) return new Set();
    const j = JSON.parse(raw) as string[];
    return new Set(Array.isArray(j) ? j : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(workspaceId: string, ids: Set<string>): void {
  try {
    sessionStorage.setItem(
      dismissedKey(workspaceId),
      JSON.stringify([...ids]),
    );
  } catch {
    /* noop */
  }
}

function useIncomingRing(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduced) {
      return;
    }
    try {
      const Win = window as unknown as {
        webkitAudioContext?: typeof AudioContext;
        AudioContext: typeof AudioContext;
      };
      const C = Win.AudioContext ?? Win.webkitAudioContext;
      if (!C) return;
      ctxRef.current = new C();

      const beepOnce = () => {
        const ctx = ctxRef.current;
        if (!ctx || ctx.state === "closed") return;
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0.11, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.36);
      };

      const tick = () => {
        void beepOnce();
        window.setTimeout(() => void beepOnce(), 220);
      };
      tick();
      intervalRef.current = setInterval(tick, 2200);

      return () => {
        if (intervalRef.current != null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
      };
    } catch {
      return;
    }
  }, [enabled]);
}

export function IncomingCallPortal({
  workspaceId,
  accent,
  meEmail,
}: {
  workspaceId: WorkspaceId;
  accent: string;
  meEmail: string;
}) {
  const [portalIncoming, setPortalIncoming] = useState<CallSummary[]>([]);
  const [chatIncoming, setChatIncoming] = useState<IncomingChatRingDto[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window !== "undefined" ? loadDismissed(workspaceId) : new Set(),
  );

  useEffect(() => {
    setDismissed(loadDismissed(workspaceId));
  }, [workspaceId]);

  const rows = useMemo((): UnifiedRow[] => {
    const out: UnifiedRow[] = [];
    for (const call of portalIncoming) {
      out.push({
        kind: "portal",
        call,
        sortAt: call.startedAt,
        dismissKey: `p:${call.id}`,
        notifyKey: `p:${call.id}`,
      });
    }
    for (const chat of chatIncoming) {
      out.push({
        kind: "chat",
        chat,
        sortAt: chat.at,
        dismissKey: `c:${chat.messageId}`,
        notifyKey: `c:${chat.messageId}`,
      });
    }
    out.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
    return out;
  }, [portalIncoming, chatIncoming]);

  const visible = useMemo(
    () => rows.filter((r) => !dismissed.has(r.dismissKey)),
    [rows, dismissed],
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const ringKey = useMemo(
    () => visible.map((r) => r.dismissKey).sort().join(","),
    [visible],
  );

  const primary = visible[0] ?? null;
  const ringing = !!(primary && visible.length > 0);

  useIncomingRing(ringing && !!primary);

  const lastBuzzKey = useRef<string | null>(null);
  useEffect(() => {
    if (!primary || lastBuzzKey.current === primary.notifyKey) return;
    lastBuzzKey.current = primary.notifyKey;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof navigator === "undefined" || !navigator.vibrate) return;
    navigator.vibrate?.([120, 70, 120]);
  }, [primary]);

  const lastNotifyKey = useRef<string | null>(null);
  useEffect(() => {
    if (!primary) return;
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    if (lastNotifyKey.current === primary.notifyKey) return;
    if (!tryClaimNotification(primary.notifyKey)) return;
    lastNotifyKey.current = primary.notifyKey;
    const title =
      primary.kind === "portal" ? "Eingehender Portal-Call" : "Video-Anruf (Chat)";
    const body =
      primary.kind === "portal"
        ? `${primary.call.createdByName} · ${primary.call.subject}`
        : `${primary.chat.fromLabel} · ${primary.chat.roomName}`;
    const n = new Notification(title, {
      tag: `portal-ring-${primary.notifyKey}`,
      body,
    });
    n.onclick = () => {
      window.focus();
      if (primary.kind === "portal") {
        window.location.href = `/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`;
      } else {
        window.open(primary.chat.joinUrl, "_blank", "noopener,noreferrer");
      }
    };
  }, [primary, workspaceId]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/comms/incoming-calls?ws=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const j = (await r.json()) as {
        portal?: CallSummary[];
        chat?: IncomingChatRingDto[];
      };
      setPortalIncoming(j.portal ?? []);
      setChatIncoming(j.chat ?? []);
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let inRun = false;
    let runAgain = false;

    const nextDelayMs = (): number => {
      const hidden = document.visibilityState === "hidden";
      const ringingNow = visibleRef.current.length > 0;
      if (ringingNow) return POLL_RINGING_MS;
      if (hidden) return POLL_IDLE_MS;
      return POLL_VISIBLE_MS;
    };

    const run = async () => {
      if (inRun) {
        runAgain = true;
        return;
      }
      inRun = true;
      try {
        do {
          runAgain = false;
          if (cancelled) return;
          await poll();
        } while (runAgain);
      } finally {
        inRun = false;
      }
      if (cancelled) return;
      timer = window.setTimeout(() => void run(), nextDelayMs());
    };

    void run();
    const onVis = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      runAgain = true;
      void run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      cancelled = true;
      runAgain = false;
      if (timer != null) clearTimeout(timer);
    };
  }, [poll, ringKey]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(BROADCAST_CHANNEL);
    } catch {
      return;
    }
    ch.onmessage = (e: MessageEvent) => {
      const d = e.data as {
        type?: string;
        workspaceId?: string;
        callId?: string;
      };
      if (
        d?.type !== "dismiss" ||
        d.workspaceId !== workspaceId ||
        !d.callId
      )
        return;
      setDismissed((prev) => {
        if (prev.has(d.callId!)) return prev;
        const next = new Set(prev);
        next.add(d.callId!);
        saveDismissed(workspaceId, next);
        return next;
      });
    };
    return () => ch.close();
  }, [workspaceId]);

  const dismissOne = useCallback(
    (dismissKey: string) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(dismissKey);
        saveDismissed(workspaceId, next);
        return next;
      });
      try {
        const ch = new BroadcastChannel(BROADCAST_CHANNEL);
        ch.postMessage({ type: "dismiss", workspaceId, callId: dismissKey });
        ch.close();
      } catch {
        /* noop */
      }
    },
    [workspaceId],
  );

  if (!primary) return null;

  const stackN = visible.length;
  const isPortal = primary.kind === "portal";
  const Icon = isPortal ? Phone : MessageSquare;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[300] pointer-events-none flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3">
      <div
        className="pointer-events-auto flex w-full max-w-lg flex-col gap-2 rounded-t-xl border border-stroke-1 bg-bg-elevated/98 p-4 shadow-2xl backdrop-blur-sm"
        style={{
          borderTopColor: `${accent}55`,
          boxShadow: `0 -4px 32px ${accent}22`,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl animate-pulse"
            style={{ background: `${accent}22`, color: accent }}
          >
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              {isPortal ? "Eingehender Portal-Call" : "Video-Anruf (Chat)"}
              {stackN > 1 ? ` (${stackN})` : ""}
            </p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-text-primary">
              {isPortal ? primary.call.createdByName : primary.chat.fromLabel}
            </p>
            <p className="truncate text-[12px] text-text-secondary">
              {isPortal ? primary.call.subject : primary.chat.roomName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissOne(primary.dismissKey)}
            className="rounded-md p-1.5 text-text-quaternary hover:bg-bg-overlay hover:text-text-primary"
            title="Nicht mehr anzeigen"
          >
            <PhoneMissed size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {isPortal ? (
            <>
              <Link
                href={`/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`}
                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: accent }}
              >
                <Phone size={15} />
                Annehmen (hier)
              </Link>
              <button
                type="button"
                onClick={() => {
                  const u = `/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`;
                  window.open(
                    u,
                    "portal-incoming-call",
                    "popup=yes,width=960,height=720,noopener,noreferrer",
                  );
                }}
                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-lg border border-stroke-1 px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-stroke-2 hover:text-text-primary"
              >
                Pop-up-Fenster
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/${workspaceId}/chat`}
                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: accent }}
              >
                <MessageSquare size={15} />
                Zum Chat
              </Link>
              <button
                type="button"
                onClick={() => {
                  window.open(
                    primary.chat.joinUrl,
                    "portal-chat-jitsi",
                    "popup=yes,width=960,height=720,noopener,noreferrer",
                  );
                }}
                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-lg border border-stroke-1 px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-stroke-2 hover:text-text-primary"
              >
                Jitsi (Pop-up)
              </button>
            </>
          )}
        </div>
        {typeof Notification !== "undefined" &&
          Notification.permission === "default" && (
            <button
              type="button"
              onClick={async () => {
                await Notification.requestPermission();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-stroke-2 py-2 text-[11px] text-text-tertiary hover:text-text-secondary"
            >
              <Bell size={14} />
              Desktop-Benachrichtigung erlauben (wenn Tab nicht sichtbar)
            </button>
          )}
        <p className="text-[10px] leading-snug text-text-quaternary">
          {meEmail.length > 0 ? <>Angemeldet als {meEmail}. </> : null}
          Einheitlicher Klingel-Feed für Portal-Calls (Mongo) und Chat-Jitsi
          (kurzlebiger Store; optional Rocket.Chat Webhook für Clients ohne
          Portal). Phonestar/Zammad separat. Mobil: RC-Push. Nächster Schritt:
          Web-Push (Service Worker + VAPID).
        </p>
      </div>
    </div>
  );
}
