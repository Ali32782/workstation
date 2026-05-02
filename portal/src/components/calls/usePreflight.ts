"use client";

import { useCallback, useState } from "react";
import type { Messages } from "@/lib/i18n/messages";

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

/** Map failures to `Messages` keys (translate via `useT`). */
export const PREFLIGHT_I18N_KEY: Record<
  PreflightFailure,
  keyof Messages
> = {
  unsupported: "calls.preflight.unsupported",
  denied: "calls.preflight.denied",
  "no-device": "calls.preflight.noDevice",
  "in-use": "calls.preflight.inUse",
  insecure: "calls.preflight.insecure",
  unknown: "calls.preflight.unknown",
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
