"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import {
  PREFLIGHT_MESSAGES,
  type PreflightFailure,
} from "./usePreflight";

/**
 * Friendly modal shown when the device pre-flight (`getUserMedia` probe)
 * fails. Replaces the browser's silent permission popup so the user
 * actually understands *why* the call won't start.
 */
export function PreflightDeniedModal({
  reason,
  probing,
  onRetry,
  onClose,
  accent,
}: {
  reason: PreflightFailure;
  probing: boolean;
  onRetry: () => void;
  onClose: () => void;
  accent: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-[440px] bg-bg-base border border-stroke-1 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <h3 className="text-[13px] font-semibold flex-1">
            Mikrofon/Kamera nicht verfügbar
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            {PREFLIGHT_MESSAGES[reason]}
          </p>
          {reason === "denied" && (
            <ol className="text-[11.5px] text-text-tertiary list-decimal pl-4 space-y-1">
              <li>
                Klick auf das <span className="font-medium">Schloss-Icon</span>{" "}
                links neben der URL.
              </li>
              <li>
                Setze <span className="font-medium">Mikrofon</span> und{" "}
                <span className="font-medium">Kamera</span> auf{" "}
                <span className="font-medium">Zulassen</span>.
              </li>
              <li>Lade die Seite neu, danach „Erneut prüfen" anklicken.</li>
            </ol>
          )}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={probing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium disabled:opacity-60"
              style={{ background: accent }}
            >
              <RefreshCw size={11} className={probing ? "spin" : undefined} />
              Erneut prüfen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
