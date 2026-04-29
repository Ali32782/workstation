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
import { Avatar } from "@/components/ui/Avatar";
import { shortTime } from "@/components/ui/datetime";
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
 * `CallModeShell` once the parent flips into call mode.
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
              <span>{contextLabel(call.context)}</span>
              <span>· {new Date(call.startedAt).toLocaleString("de-DE")}</span>
              {!active && call.durationSeconds != null && (
                <span className="font-mono">
                  · Dauer {fmtDuration(call.durationSeconds)}
                </span>
              )}
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary truncate">
              {call.subject}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              gestartet von {call.createdByName}
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
                  Beitreten
                </button>
                <a
                  href={call.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
                  title="In neuem Tab"
                >
                  <Maximize2 size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Call für alle beenden?")) onEnd(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px]"
                  title="Call beenden"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-elevated border border-stroke-1 text-[10.5px] text-text-tertiary">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Beendet
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
                Call beendet · Dauer{" "}
                {call.durationSeconds
                  ? fmtDuration(call.durationSeconds)
                  : "—"}
              </span>
            </div>
          )}

          <Section title="Teilnehmer">
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
                      title="online"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      online
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-text-tertiary tabular-nums">
                      {p.leftAt
                        ? `${shortTime(p.joinedAt)}–${shortTime(p.leftAt)}`
                        : shortTime(p.joinedAt)}
                    </span>
                  )}
                </li>
              ))}
              {call.participants.length === 0 && (
                <li className="text-[11.5px] text-text-tertiary">
                  Noch niemand beigetreten.
                </li>
              )}
            </ul>
          </Section>

          <Section title="Kontext">
            <ContextDisplay context={call.context} />
          </Section>

          <Section title="Raum">
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
                title="Einladungslink kopieren"
              >
                <ExternalLink size={11} />
                Link kopieren
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
  if (context.kind === "adhoc") {
    return (
      <p className="text-[11.5px] text-text-tertiary">
        Spontan-Call ohne Verknüpfung.
      </p>
    );
  }
  return (
    <div className="text-[11.5px] text-text-secondary inline-flex items-center gap-1.5">
      {contextIcon(context)}
      <span>{contextLabel(context)}</span>
    </div>
  );
}
