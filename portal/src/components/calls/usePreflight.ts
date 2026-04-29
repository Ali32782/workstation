"use client";

import { useCallback, useState } from "react";

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: PreflightFailure };

export type PreflightFailure =
  | "unsupported"
  | "denied"
  | "no-device"
  | "in-use"
  | "insecure"
  | "unknown";

export const PREFLIGHT_MESSAGES: Record<PreflightFailure, string> = {
  unsupported:
    "Dein Browser unterstützt keinen Mikrofon/Kamera-Zugriff. Bitte Chrome, Edge oder Firefox verwenden.",
  denied:
    "Mikrofon oder Kamera wurde blockiert. Erlaube den Zugriff in der Adressleiste (Schloss-Icon) und versuch es erneut.",
  "no-device":
    "Es wurde kein Mikrofon/keine Kamera gefunden. Stell sicher, dass ein Headset oder eine Webcam angeschlossen ist.",
  "in-use":
    "Mikrofon/Kamera wird bereits von einer anderen App genutzt (Zoom, Teams, OBS …). Bitte schließe die App und versuch es erneut.",
  insecure:
    "Calls funktionieren nur über HTTPS oder localhost. Wechsle auf eine sichere URL.",
  unknown:
    "Mikrofon/Kamera konnte nicht initialisiert werden. Bitte erneut versuchen.",
};

/**
 * Hook that probes `getUserMedia` *before* the Jitsi iframe shows the
 * browser's permission popup. We do this so we can render a friendly
 * in-app modal explaining why audio/video failed instead of letting Jitsi
 * silently fall back to chat-only mode.
 *
 * The probe immediately stops every track it acquires — we are only
 * interested in the permission grant, not in actually opening the device.
 */
export function usePreflight() {
  const [failure, setFailure] = useState<PreflightFailure | null>(null);
  const [probing, setProbing] = useState(false);

  const reset = useCallback(() => setFailure(null), []);

  const run = useCallback(async (): Promise<PreflightResult> => {
    if (typeof window === "undefined") {
      return { ok: false, reason: "unsupported" };
    }
    if (
      typeof window.isSecureContext === "boolean" &&
      !window.isSecureContext
    ) {
      setFailure("insecure");
      return { ok: false, reason: "insecure" };
    }
    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || typeof md.getUserMedia !== "function") {
      setFailure("unsupported");
      return { ok: false, reason: "unsupported" };
    }
    setProbing(true);
    try {
      const stream = await md.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      setFailure(null);
      return { ok: true };
    } catch (e) {
      const reason = mapMediaError(e);
      setFailure(reason);
      return { ok: false, reason };
    } finally {
      setProbing(false);
    }
  }, []);

  return { failure, probing, run, reset };
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
