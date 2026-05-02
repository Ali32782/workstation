/**
 * Shared Jitsi embedding helpers (External API loader, room parsing, media
 * preflight). Used by Calls and Chat so behaviour stays in sync.
 */

import type { PreflightFailure } from "@/components/calls/usePreflight";

export const JITSI_IFRAME_ALLOW =
  "camera *; microphone *; display-capture *; clipboard-write *; autoplay; fullscreen; web-share";

const scriptByOrigin = new Map<string, Promise<void>>();

export function loadJitsiExternalApi(origin: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (
    (window as unknown as { JitsiMeetExternalAPI?: unknown })
      .JitsiMeetExternalAPI
  ) {
    return Promise.resolve();
  }
  const cached = scriptByOrigin.get(origin);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${origin}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptByOrigin.delete(origin);
      reject(new Error("Jitsi external_api.js konnte nicht geladen werden"));
    };
    document.head.appendChild(s);
  });
  scriptByOrigin.set(origin, p);
  return p;
}

/** Path segment(s) for Jitsi room, e.g. corehub-ali-a1b2c3d4 */
export function jitsiRoomFromInviteLink(href: string): {
  domain: string;
  room: string;
  origin: string;
} {
  const u = new URL(href);
  const parts = u.pathname.split("/").filter(Boolean);
  const room = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!room) {
    throw new Error("Jitsi-Link enthält keinen Raum (Pfad leer).");
  }
  return { domain: u.hostname, room, origin: u.origin };
}

function mapMediaError(e: unknown): PreflightFailure {
  const name =
    e && typeof e === "object" && "name" in e
      ? String((e as { name?: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-device";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    default:
      return "unknown";
  }
}

/**
 * Mic required; camera best-effort. Camera denied → still ok for audio/video
 * toggle inside Jitsi. Matches Chat `CallPanel` behaviour.
 */
export async function probeMediaPermission(): Promise<
  | { ok: true; cameraOk: boolean }
  | { ok: false; reason: PreflightFailure }
> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unsupported" };
  }
  if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
    return { ok: false, reason: "insecure" };
  }
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== "function") {
    return { ok: false, reason: "unsupported" };
  }

  let micState: PermissionState | null = null;
  let camState: PermissionState | null = null;
  try {
    const perms = (
      navigator as unknown as {
        permissions?: {
          query?: (q: { name: string }) => Promise<PermissionStatus>;
        };
      }
    ).permissions;
    if (perms?.query) {
      const [mic, cam] = await Promise.all([
        perms.query({ name: "microphone" }).catch(() => null),
        perms.query({ name: "camera" }).catch(() => null),
      ]);
      micState = mic?.state ?? null;
      camState = cam?.state ?? null;
    }
  } catch {
    /* Permissions API missing */
  }

  if (micState === "denied") return { ok: false, reason: "denied" };
  if (micState === "granted") {
    return { ok: true, cameraOk: camState !== "denied" };
  }

  try {
    const stream = await md.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    });
    return { ok: true, cameraOk: true };
  } catch (firstErr) {
    try {
      const audioStream = await md.getUserMedia({ audio: true, video: false });
      audioStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
      return { ok: true, cameraOk: false };
    } catch (e) {
      void firstErr;
      return { ok: false, reason: mapMediaError(e) };
    }
  }
}

/** Pre-join mic + RTT hint (best-effort; never throws). */
export async function quickQualityProbe(
  origin: string,
  onTick?: (peak: number) => void,
): Promise<{ micPeak: number; networkMs: number | null }> {
  let micPeak = 0;
  let networkMs: number | null = null;

  const netPromise = (async () => {
    try {
      const t0 = performance.now();
      await fetch(`${origin}/`, {
        method: "HEAD",
        cache: "no-store",
        mode: "no-cors",
      });
      networkMs = Math.max(1, Math.round(performance.now() - t0));
    } catch {
      networkMs = null;
    }
  })();

  try {
    const md = navigator.mediaDevices;
    if (md && typeof md.getUserMedia === "function") {
      const stream = await md.getUserMedia({ audio: true, video: false });
      try {
        const Ctx =
          (window as unknown as { AudioContext?: typeof AudioContext })
            .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          src.connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          const start = performance.now();
          while (performance.now() - start < 1100) {
            analyser.getByteTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = Math.abs(buf[i] - 128);
              if (v > peak) peak = v;
            }
            const norm = Math.min(1, peak / 64);
            if (norm > micPeak) micPeak = norm;
            onTick?.(norm);
            await new Promise((r) => setTimeout(r, 80));
          }
          try {
            src.disconnect();
          } catch {
            /* noop */
          }
          try {
            await ctx.close();
          } catch {
            /* noop */
          }
        }
      } finally {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* noop */
          }
        });
      }
    }
  } catch {
    /* best-effort */
  }

  await netPromise;
  return { micPeak, networkMs };
}

export const PENDING_CHAT_MEETING_KEY = "portal:pending-chat-meeting";

export type PendingChatMeeting = {
  joinUrl: string;
  callMedia: "video" | "voice";
  subject: string;
  /** Wenn gesetzt: serverseitigen Klingel-Eintrag nach Annahme entfernen. */
  ringMessageId?: string;
};
