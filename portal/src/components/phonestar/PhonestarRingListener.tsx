"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PhoneIncoming, X } from "lucide-react";
import type { PhonestarRingEventRecord } from "@/lib/phonestar/ring-types";
import type { WorkspaceId } from "@/lib/workspaces";

const STORAGE_KEY = "corelab-phonestar-ring-seen";
const POLL_MS = 6_000;
const CHANNEL = "corelab-phonestar-ring";
const DISMISS_MS = 14_000;
const CLAIM_PREFIX = "corelab-phonestar-toast:";
const CLAIM_TTL_MS = 180_000;

function tryClaimToast(id: number): boolean {
  if (typeof window === "undefined") return true;
  try {
    const k = CLAIM_PREFIX + id;
    const now = Date.now();
    const prev = localStorage.getItem(k);
    if (prev) {
      const t = Number(prev);
      if (Number.isFinite(t) && now - t < CLAIM_TTL_MS) return false;
    }
    localStorage.setItem(k, String(now));
    window.setTimeout(() => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }, CLAIM_TTL_MS);
    return true;
  } catch {
    return true;
  }
}

type Toast = {
  key: string;
  event: PhonestarRingEventRecord;
};

export function PhonestarRingListener({
  workspaceId,
}: {
  workspaceId: WorkspaceId;
}) {
  const [stack, setStack] = useState<Toast[]>([]);
  const maxSeenRef = useRef(0);

  const pushToast = useCallback((ev: PhonestarRingEventRecord) => {
    const key = `${ev.id}`;
    setStack((prev) => {
      if (prev.some((t) => t.key === key)) return prev;
      return [...prev, { key, event: ev }];
    });

    if (typeof window === "undefined") return;
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ type: "seen", id: ev.id });
      ch.close();
    } catch {
      /* ignore */
    }

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      const body =
        ev.action === "article_deduped_inbound"
          ? `Erneuter Anruf von ${ev.caller} · Ticket #${ev.ticketNumber ?? ev.ticketId}`
          : `Neuer Anruf von ${ev.caller} · Ticket #${ev.ticketNumber ?? ev.ticketId}`;
      try {
        new Notification("Phonestar · Eingehend", {
          body,
          tag: `phonestar-${ev.id}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n) && n > 0) maxSeenRef.current = n;
    } catch {
      /* ignore */
    }
  }, []);

  const persistSeen = useCallback((id: number) => {
    if (id <= maxSeenRef.current) return;
    maxSeenRef.current = id;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (e: MessageEvent) => {
        const d = e.data as { type?: string; id?: number };
        if (d?.type === "seen" && typeof d.id === "number") {
          persistSeen(d.id);
        }
      };
    } catch {
      ch = null;
    }
    return () => {
      ch?.close();
    };
  }, [persistSeen]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const since = maxSeenRef.current;
        const r = await fetch(
          `/api/comms/phonestar-ring?ws=${encodeURIComponent(workspaceId)}&since=${since}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as {
          enabled?: boolean;
          events?: PhonestarRingEventRecord[];
        };
        if (cancelled || !j.enabled || !Array.isArray(j.events)) return;

        let high = since;
        const dismissTicketIds = new Set<number>();
        const ringCandidates: PhonestarRingEventRecord[] = [];
        for (const ev of j.events) {
          if (ev.id > high) high = ev.id;
          if (ev.action === "inbound_ring_dismiss") {
            dismissTicketIds.add(ev.ticketId);
            continue;
          }
          if (
            ev.action === "ticket_created_inbound" ||
            ev.action === "article_deduped_inbound"
          ) {
            ringCandidates.push(ev);
          }
        }
        if (dismissTicketIds.size > 0) {
          setStack((cur) =>
            cur.filter((t) => !dismissTicketIds.has(t.event.ticketId)),
          );
        }
        for (const ev of ringCandidates) {
          if (tryClaimToast(ev.id)) pushToast(ev);
        }
        if (high > since) persistSeen(high);
      } catch {
        /* ignore */
      }
    };

    void tick();
    interval = setInterval(() => void tick(), POLL_MS);
    const vis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", vis);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [workspaceId, persistSeen, pushToast]);

  useEffect(() => {
    if (stack.length === 0) return;
    const t = window.setTimeout(() => {
      setStack((cur) => cur.slice(1));
    }, DISMISS_MS);
    return () => clearTimeout(t);
  }, [stack]);

  const dismiss = useCallback((key: string) => {
    setStack((cur) => cur.filter((t) => t.key !== key));
  }, []);

  if (stack.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 max-w-[min(100vw-2rem,22rem)] pointer-events-none"
      aria-live="polite"
    >
      {stack.map(({ key, event: ev }) => (
        <div
          key={key}
          className="pointer-events-auto rounded-lg border border-stroke-1 bg-bg-elevated shadow-lg p-3 flex gap-2.5"
        >
          <span
            className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--color-success) 22%, transparent)" }}
          >
            <PhoneIncoming size={18} className="text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-text-primary text-[12px] font-semibold leading-snug">
              {ev.action === "article_deduped_inbound"
                ? "Erneuter Anruf"
                : "Eingehender Anruf"}
            </p>
            <p className="text-text-secondary text-[11px] mt-0.5 leading-snug">
              <span className="tabular-nums">{ev.caller}</span>
              {ev.ticketNumber ? (
                <>
                  {" "}
                  · Ticket #{ev.ticketNumber}
                </>
              ) : (
                <>
                  {" "}
                  · Ticket #{ev.ticketId}
                </>
              )}
            </p>
            <Link
              href={`/${workspaceId}/helpdesk?ticket=${ev.ticketId}`}
              className="inline-block mt-2 text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
            >
              Im Helpdesk öffnen
            </Link>
          </div>
          <button
            type="button"
            onClick={() => dismiss(key)}
            className="shrink-0 p-1 rounded-md text-text-quaternary hover:text-text-primary hover:bg-bg-base"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
