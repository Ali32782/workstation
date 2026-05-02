"use client";

import Link from "next/link";
import { Bell, Phone, PhoneMissed, Video, MessageSquare } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { CallSummary } from "@/lib/calls/types";
import type { IncomingChatRingDto } from "@/lib/comms/call-ring-types";
import {
  PENDING_CHAT_MEETING_KEY,
  type PendingChatMeeting,
} from "@/lib/jitsi/client";
import { useIsNarrowScreen } from "@/lib/use-is-narrow-screen";
import type { WorkspaceId } from "@/lib/workspaces";
import { useT } from "@/components/LocaleProvider";

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
  const t = useT();
  const [portalIncoming, setPortalIncoming] = useState<CallSummary[]>([]);
  const [chatIncoming, setChatIncoming] = useState<IncomingChatRingDto[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window !== "undefined" ? loadDismissed(workspaceId) : new Set(),
  );
  const narrow = useIsNarrowScreen();

  const incomingChatRingTitle = useCallback(
    (media: "video" | "voice" | undefined, compact: boolean) => {
      if (compact) {
        return media === "voice"
          ? t("calls.incoming.chatVoiceShort")
          : t("calls.incoming.chatVideoShort");
      }
      return media === "voice"
        ? t("calls.incoming.chatVoiceLong")
        : t("calls.incoming.chatVideoLong");
    },
    [t],
  );

  useEffect(() => {
    setDismissed(loadDismissed(workspaceId));
  }, [workspaceId]);

  const dismissOne = useCallback((dismissKey: string) => {
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
    if (dismissKey.startsWith("c:")) {
      const messageId = dismissKey.slice(2);
      if (messageId) {
        void fetch(
          `/api/comms/call-ring/dismiss?ws=${encodeURIComponent(workspaceId)}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId }),
          },
        ).catch(() => {});
      }
    }
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
  /** Original tab title before any current ring session (avoid overwriting while primary swaps). */
  const savedTabTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!primary) {
      if (savedTabTitleRef.current != null) {
        document.title = savedTabTitleRef.current;
        savedTabTitleRef.current = null;
      }
      return;
    }
    if (savedTabTitleRef.current == null) {
      savedTabTitleRef.current = document.title;
    }
    const hint =
      primary.kind === "portal"
        ? primary.call.createdByName
        : primary.chat.fromLabel;
    document.title = `${t("calls.incoming.tabTitlePrefix")} ${hint} · ${savedTabTitleRef.current}`;
  }, [primary, t]);

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
      primary.kind === "portal"
        ? t("calls.incoming.portalTitle")
        : incomingChatRingTitle(primary.chat.callMedia, narrow);
    const body =
      primary.kind === "portal"
        ? `${primary.call.createdByName} · ${primary.call.subject}`
        : `${primary.chat.fromLabel} · ${primary.chat.roomName}`;
    const n = new Notification(title, {
      tag: `portal-ring-${primary.notifyKey}`,
      body,
    });
    n.onclick = () => {
      dismissOne(primary.dismissKey);
      window.focus();
      if (primary.kind === "portal") {
        window.location.href = `/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`;
      } else {
        try {
          const payload: PendingChatMeeting = {
            joinUrl: primary.chat.joinUrl,
            callMedia:
              primary.chat.callMedia === "voice" ? "voice" : "video",
            subject: primary.chat.roomName,
            ringMessageId: primary.chat.messageId,
          };
          sessionStorage.setItem(
            PENDING_CHAT_MEETING_KEY,
            JSON.stringify(payload),
          );
        } catch {
          /* noop */
        }
        window.location.href = `/${workspaceId}/chat`;
      }
    };
  }, [primary, workspaceId, narrow, dismissOne, t, incomingChatRingTitle]);

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

  if (!primary) return null;

  if (typeof document === "undefined") return null;

  const stackN = visible.length;
  const isPortal = primary.kind === "portal";
  const chatVoice = !isPortal && primary.chat.callMedia === "voice";
  const Icon = isPortal ? Phone : chatVoice ? Phone : Video;
  /** Balken sofort ausblenden, sobald der Anruf wirklich angenommen wird (nicht nur „verwerfen“). */
  const dismissThisRing = () => dismissOne(primary.dismissKey);

  const panel = (
    <div
      className={`fixed inset-x-0 z-[9999] pointer-events-none flex max-h-[calc(100dvh-5rem)] justify-center overflow-y-auto py-1 ${narrow ? "px-2" : "px-3"}`}
      style={{
        top: "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 4.25rem))",
      }}
      role="alert"
      aria-live="assertive"
      aria-labelledby="portal-incoming-call-title"
      aria-describedby="portal-incoming-call-desc"
    >
      <div
        className={`pointer-events-auto flex w-full flex-col border border-stroke-1 bg-bg-elevated/98 backdrop-blur-sm ${
          narrow
            ? "max-w-[min(100%,18.5rem)] gap-1.5 rounded-lg p-2.5"
            : "max-w-lg gap-2 rounded-xl p-4 shadow-2xl"
        }`}
        style={{
          borderColor: `${accent}44`,
          boxShadow: narrow
            ? `0 4px 16px ${accent}14`
            : `0 12px 40px ${accent}28`,
        }}
      >
        <div className={`flex items-start ${narrow ? "gap-2" : "gap-3"}`}>
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg ${
              narrow
                ? "h-9 w-9"
                : "h-12 w-12 animate-pulse rounded-xl"
            }`}
            style={{ background: `${accent}22`, color: accent }}
          >
            <Icon size={narrow ? 17 : 22} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              id="portal-incoming-call-title"
              className={
                narrow
                  ? "text-[10px] font-medium text-text-tertiary"
                  : "text-[11px] font-semibold uppercase tracking-wide text-text-tertiary"
              }
            >
              {isPortal
                ? t("calls.incoming.portalTitle")
                : incomingChatRingTitle(primary.chat.callMedia, narrow)}
              {stackN > 1 ? ` (${stackN})` : ""}
            </p>
            <p
              className={`mt-0.5 truncate font-semibold text-text-primary ${narrow ? "text-[13px]" : "text-[14px]"}`}
            >
              {isPortal ? primary.call.createdByName : primary.chat.fromLabel}
            </p>
            <p
              id="portal-incoming-call-desc"
              className={`truncate text-text-secondary ${narrow ? "text-[11px]" : "text-[12px]"}`}
            >
              {isPortal ? primary.call.subject : primary.chat.roomName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissOne(primary.dismissKey)}
            className={`rounded-md text-text-quaternary hover:bg-bg-overlay hover:text-text-primary ${narrow ? "p-1" : "p-1.5"}`}
            title={t("calls.incoming.dismissTitle")}
          >
            <PhoneMissed size={narrow ? 16 : 18} />
          </button>
        </div>
        <div className={`flex flex-col gap-2 ${narrow ? "pt-0" : "pt-1"} ${narrow ? "" : "flex-wrap sm:flex-row"}`}>
          {isPortal ? (
            <>
              <Link
                href={`/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg font-semibold text-white ${narrow ? "px-3 py-2 text-[12px]" : "min-w-[120px] flex-1 px-3 py-2 text-[13px]"}`}
                style={{ background: accent }}
                onClick={() => dismissThisRing()}
              >
                <Phone size={narrow ? 14 : 15} />
                {t("calls.incoming.accept")}
                {narrow ? "" : t("calls.incoming.acceptHereSuffix")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  dismissThisRing();
                  const u = `/${workspaceId}/calls?join=${encodeURIComponent(primary.call.id)}`;
                  window.open(
                    u,
                    "portal-incoming-call",
                    "popup=yes,width=960,height=720,noopener,noreferrer",
                  );
                }}
                className={
                  narrow
                    ? "text-center text-[11px] font-medium text-text-tertiary hover:text-text-secondary"
                    : "inline-flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-stroke-1 px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-stroke-2 hover:text-text-primary"
                }
              >
                {narrow
                  ? t("calls.incoming.openInWindow")
                  : t("calls.incoming.popupWindow")}
              </button>
            </>
          ) : narrow ? (
            <>
              <button
                type="button"
                onClick={() => {
                  dismissThisRing();
                  const payload: PendingChatMeeting = {
                    joinUrl: primary.chat.joinUrl,
                    callMedia:
                      primary.chat.callMedia === "voice" ? "voice" : "video",
                    subject: primary.chat.roomName,
                    ringMessageId: primary.chat.messageId,
                  };
                  try {
                    sessionStorage.setItem(
                      PENDING_CHAT_MEETING_KEY,
                      JSON.stringify(payload),
                    );
                  } catch {
                    /* quota / private mode */
                  }
                  window.location.href = `/${workspaceId}/chat`;
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white"
                style={{ background: accent }}
              >
                {chatVoice ? <Phone size={14} /> : <Video size={14} />}
                {t("calls.incoming.accept")}
              </button>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-text-tertiary">
                <Link
                  href={`/${workspaceId}/chat`}
                  className="font-medium text-text-secondary hover:text-text-primary hover:underline"
                >
                  {t("calls.incoming.chatOnlyLink")}
                </Link>
                <span className="text-text-quaternary" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => {
                    dismissThisRing();
                    window.open(
                      primary.chat.joinUrl,
                      "portal-chat-jitsi",
                      "popup=yes,width=960,height=720,noopener,noreferrer",
                    );
                  }}
                  className="font-medium text-text-secondary hover:text-text-primary hover:underline"
                >
                  {t("calls.incoming.jitsiLink")}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  dismissThisRing();
                  const payload: PendingChatMeeting = {
                    joinUrl: primary.chat.joinUrl,
                    callMedia:
                      primary.chat.callMedia === "voice" ? "voice" : "video",
                    subject: primary.chat.roomName,
                    ringMessageId: primary.chat.messageId,
                  };
                  try {
                    sessionStorage.setItem(
                      PENDING_CHAT_MEETING_KEY,
                      JSON.stringify(payload),
                    );
                  } catch {
                    /* quota / private mode */
                  }
                  window.location.href = `/${workspaceId}/chat`;
                }}
                className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: accent }}
              >
                {chatVoice ? <Phone size={15} /> : <Video size={15} />}
                {t("calls.incoming.accept")}
                {t("calls.incoming.acceptHereSuffix")}
              </button>
              <Link
                href={`/${workspaceId}/chat`}
                className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-stroke-1 px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-stroke-2 hover:text-text-primary"
              >
                <MessageSquare size={15} />
                {t("calls.incoming.chatOnlyButton")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  dismissThisRing();
                  window.open(
                    primary.chat.joinUrl,
                    "portal-chat-jitsi",
                    "popup=yes,width=960,height=720,noopener,noreferrer",
                  );
                }}
                className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-stroke-1 px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-stroke-2 hover:text-text-primary"
              >
                {t("calls.incoming.jitsiNewWindow")}
              </button>
            </>
          )}
        </div>
        {typeof Notification !== "undefined" &&
          Notification.permission === "default" &&
          !narrow && (
            <button
              type="button"
              onClick={async () => {
                await Notification.requestPermission();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-stroke-2 py-2 text-[11px] text-text-tertiary hover:text-text-secondary"
            >
              <Bell size={14} />
              {t("calls.incoming.allowDesktopNotify")}
            </button>
          )}
        {!narrow && (
          <p className="text-[10px] leading-snug text-text-quaternary">
            {meEmail.length > 0 ? (
              <>{t("calls.incoming.footerSignedInPrefix").replace("{email}", meEmail)}</>
            ) : null}
            {t("calls.incoming.footerHint")}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
