"use client";

import { ArrowRight, Loader2, PhoneCall, X } from "lucide-react";
import type { CallContext } from "@/lib/calls/types";
import { useT } from "@/components/LocaleProvider";
import { contextIcon, contextLabel } from "./shared";

export function ComposerModal({
  subject,
  onSubjectChange,
  context,
  onContextChange,
  onCancel,
  onStart,
  submitting,
  accent,
}: {
  subject: string;
  onSubjectChange: (s: string) => void;
  context: CallContext;
  onContextChange: (c: CallContext) => void;
  onCancel: () => void;
  onStart: () => void;
  submitting: boolean;
  accent: string;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={onCancel}
    >
      <div
        className="w-[440px] bg-bg-base border border-stroke-1 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <PhoneCall size={14} style={{ color: accent }} />
          <h3 className="text-[13px] font-semibold flex-1">
            {t("calls.composer.title")}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1 block">
              {t("calls.composer.subject")}
            </label>
            <input
              autoFocus
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder={t("calls.composer.subjectPlaceholder")}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md px-3 py-2 text-[12.5px] outline-none focus:border-stroke-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") onStart();
              }}
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1 block">
              {t("calls.composer.contextLabel")}
            </label>
            <div className="rounded-md bg-bg-elevated border border-stroke-1 px-3 py-2 text-[11.5px] text-text-secondary inline-flex items-center gap-2">
              {contextIcon(context)}
              <span>{contextLabel(context, t)}</span>
              {context.kind !== "adhoc" && (
                <button
                  type="button"
                  onClick={() => onContextChange({ kind: "adhoc" })}
                  className="ml-2 text-text-tertiary hover:text-text-primary"
                  title={t("calls.composer.unlinkTitle")}
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-text-quaternary">
              {t("calls.composer.contextHint")}
            </p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium disabled:opacity-50"
              style={{ background: accent }}
            >
              {submitting ? (
                <Loader2 size={11} className="spin" />
              ) : (
                <ArrowRight size={11} />
              )}
              {t("calls.composer.start")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
