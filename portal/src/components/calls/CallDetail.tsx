"use client";

import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Maximize2,
  PhoneCall,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { shortTime } from "@/components/ui/datetime";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";
import type { CallContext, CallSummary } from "@/lib/calls/types";
import { contextIcon, contextLabel, fmtDuration } from "./shared";

/**
 * Detail pane for a selected call. The header carries the metadata,
 * the Beitreten action and the leave/end controls; the body is a single
 * scrollable column with Teilnehmer / Kontext / Raum sections.
 *
 * We deliberately do not render a "Bereit für den Call" placeholder or a
 * second join button — joining lives in the header alone, and the body
 * stays a clean detail view. The actual `JitsiEmbed` lives in
 * `ActiveCallStage` once the parent starts embedding.
 */
export function CallDetail({
  call,
  onStartEmbed,
  onEnd,
  accent,
  preflightProbing,
}: {
  call: CallSummary;
  /** Trigger join: parent runs preflight + switches to call-mode. */
  onStartEmbed: () => void;
  onEnd: (everyone: boolean) => void;
  accent: string;
  /** True while parent's media probe is running — disables the join btn. */
  preflightProbing?: boolean;
}) {
  const { locale } = useLocale();
  const t = useT();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const active = !call.endedAt;

  return (
    <>
      <header
        className="shrink-0 px-4 py-3 border-b border-stroke-1 bg-bg-chrome"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary mb-1">
              <span className="text-text-tertiary">
                {contextIcon(call.context)}
              </span>
              <span>{contextLabel(call.context, t)}</span>
              <span>
                ·{" "}
                {new Date(call.startedAt).toLocaleString(localeFmt)}
              </span>
              {!active && call.durationSeconds != null && (
                <span className="font-mono">
                  · {t("calls.detail.durationLabel")}{" "}
                  {fmtDuration(call.durationSeconds)}
                </span>
              )}
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary truncate">
              {call.subject}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {t("calls.detail.startedBy").replace(
                "{name}",
                call.createdByName,
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <>
                <button
                  type="button"
                  onClick={onStartEmbed}
                  disabled={preflightProbing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-60"
                  style={{ background: accent }}
                >
                  {preflightProbing ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <PhoneCall size={13} />
                  )}
                  {t("calls.detail.join")}
                </button>
                <a
                  href={call.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
                  title={t("calls.detail.openNewTab")}
                >
                  <Maximize2 size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    onEnd(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px]"
                  title={t("calls.detail.endCall")}
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-elevated border border-stroke-1 text-[10.5px] text-text-tertiary">
                <CheckCircle2 size={11} className="text-emerald-500" />
                {t("calls.detail.ended")}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto bg-bg-base">
        <div className="max-w-[640px] mx-auto px-5 py-5 space-y-5">
          {!active && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-[12px]">
              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              <span className="text-text-secondary">
                {t("calls.detail.endedWithDuration").replace(
                  "{duration}",
                  call.durationSeconds
                    ? fmtDuration(call.durationSeconds)
                    : "—",
                )}
              </span>
            </div>
          )}

          <Section title={t("calls.detail.section.participants")}>
            <ul className="space-y-2">
              {call.participants.map((p) => (
                <li
                  key={p.email + p.joinedAt}
                  className="flex items-center gap-2.5 py-1"
                >
                  <Avatar name={p.displayName} email={p.email} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium truncate">
                      {p.displayName}
                    </p>
                    <p className="text-[10.5px] text-text-tertiary truncate">
                      {p.email}
                    </p>
                  </div>
                  {!p.leftAt && active ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-400"
                      title={t("calls.detail.online")}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {t("calls.detail.online")}
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-text-tertiary tabular-nums">
                      {p.leftAt
                        ? `${shortTime(p.joinedAt, localeFmt)}–${shortTime(p.leftAt, localeFmt)}`
                        : shortTime(p.joinedAt, localeFmt)}
                    </span>
                  )}
                </li>
              ))}
              {call.participants.length === 0 && (
                <li className="text-[11.5px] text-text-tertiary">
                  {t("calls.detail.noParticipantsYet")}
                </li>
              )}
            </ul>
          </Section>

          <Section title={t("calls.detail.section.context")}>
            <ContextDisplay context={call.context} />
          </Section>

          <Section title={t("calls.detail.section.room")}>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-[11px] font-mono text-text-tertiary truncate bg-bg-elevated border border-stroke-1 rounded px-2 py-1.5">
                {call.roomName}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(call.joinUrl);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px] shrink-0"
                title={t("calls.detail.copyInviteTitle")}
              >
                <ExternalLink size={11} />
                {t("calls.detail.copyLink")}
              </button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function ContextDisplay({ context }: { context: CallContext }) {
  const t = useT();
  if (context.kind === "adhoc") {
    return (
      <p className="text-[11.5px] text-text-tertiary">
        {t("calls.detail.adhocNoLink")}
      </p>
    );
  }
  return (
    <div className="text-[11.5px] text-text-secondary inline-flex items-center gap-1.5">
      {contextIcon(context)}
      <span>{contextLabel(context, t)}</span>
    </div>
  );
}
