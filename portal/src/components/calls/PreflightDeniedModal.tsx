"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import {
  PREFLIGHT_I18N_KEY,
  type PreflightFailure,
} from "./usePreflight";
import { useT } from "@/components/LocaleProvider";

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
  const t = useT();
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
            {t("calls.preflight.title")}
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
            {t(PREFLIGHT_I18N_KEY[reason])}
          </p>
          {reason === "denied" && (
            <ol className="text-[11.5px] text-text-tertiary list-decimal pl-4 space-y-1">
              <li>
                {t("calls.preflight.hint.denied.step1Before")}{" "}
                <span className="font-medium">
                  {t("calls.preflight.hint.denied.step1Icon")}
                </span>{" "}
                {t("calls.preflight.hint.denied.step1After")}
              </li>
              <li>{t("calls.preflight.hint.denied.step2")}</li>
              <li>{t("calls.preflight.hint.denied.step3")}</li>
            </ol>
          )}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={probing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium disabled:opacity-60"
              style={{ background: accent }}
            >
              <RefreshCw size={11} className={probing ? "spin" : undefined} />
              {t("calls.preflight.checkAgain")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
