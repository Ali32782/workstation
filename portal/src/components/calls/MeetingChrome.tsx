"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useT } from "@/components/LocaleProvider";

function ConnBadge({
  q,
  titleTpl,
  good,
  ok,
  poor,
}: {
  q: number;
  titleTpl: string;
  good: string;
  ok: string;
  poor: string;
}) {
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full border border-stroke-1 bg-bg-base/60 px-1.5 py-0.5 text-[10px] text-text-tertiary"
      title={titleTpl.replace("{q}", String(q))}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          q >= 70 ? "bg-emerald-400" : q >= 35 ? "bg-amber-400" : "bg-rose-400"
        }`}
        aria-hidden
      />
      {q >= 70 ? good : q >= 35 ? ok : poor}
    </span>
  );
}

export type MeetingChromeVisual = "calls" | "chat";

/**
 * Gemeinsame Meeting-Kopfzeile + Toolbar für Portal-Calls und Chat-Jitsi
 * (Teams-nah: Titel, Qualität, Pop-out, Link kopieren, Minimieren, Verlassen).
 */
export function MeetingChrome({
  visual,
  compact = false,
  /** Calls: Workspace-Akzent für dezente Header-Linie */
  accent,
  /** Chat: Verlaufs-Streifen oben */
  showGradientStrip = false,
  /** Optional: Icon links (z. B. Video/Telefon) */
  leadingIcon,
  title,
  subtitle,
  /** Kleine Meta-Zeile (z. B. CRM-Kontext) */
  meta,
  participants,
  connQ,
  joinUrl,
  popOut = true,
  copyLink = true,
  onCopyLink,
  onMinimize,
  onExpand,
  expandVisible = false,
  /** Zurück zur Liste / Browser — Call läuft weiter (PiP) */
  onListBack,
  listBackLabel,
  onHangUp,
  hangUpTitle,
  /** Wenn gesetzt: confirm() vor onHangUp */
  hangUpConfirm,
  className = "",
}: {
  visual: MeetingChromeVisual;
  compact?: boolean;
  accent?: string;
  showGradientStrip?: boolean;
  leadingIcon?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  participants?: ReactNode;
  connQ?: number | null;
  joinUrl: string;
  popOut?: boolean;
  copyLink?: boolean;
  onCopyLink?: () => void;
  onMinimize?: () => void;
  onExpand?: () => void;
  expandVisible?: boolean;
  onListBack?: () => void;
  listBackLabel?: string;
  onHangUp: () => void;
  hangUpTitle?: string;
  hangUpConfirm?: string;
  className?: string;
}) {
  const t = useT();
  const effectiveListBack = listBackLabel ?? t("calls.meeting.backToList");
  const effectiveHangUp = hangUpTitle ?? t("calls.meeting.leave");

  const pad = compact ? "px-2 py-1.5 gap-1.5" : "px-3 py-2.5 gap-2";
  const btn =
    visual === "calls"
      ? "inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
      : "shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-bg-overlay hover:text-text-primary touch-manipulation";

  const copy = () => {
    if (onCopyLink) onCopyLink();
    else void navigator.clipboard.writeText(joinUrl);
  };

  const hang = () => {
    if (hangUpConfirm && !confirm(hangUpConfirm)) return;
    onHangUp();
  };

  return (
    <div className={`shrink-0 flex flex-col ${className}`}>
      {showGradientStrip && (
        <div
          className="h-1 shrink-0 bg-gradient-to-r from-[#4f52b2] to-[#5b5fc7]"
          aria-hidden
        />
      )}
      <div
        className={`flex min-h-11 shrink-0 items-center border-b border-stroke-1 bg-bg-elevated touch-manipulation ${pad} ${
          visual === "calls" ? "bg-bg-chrome" : ""
        }`}
        style={
          accent
            ? { boxShadow: `inset 0 -1px 0 0 ${accent}33` }
            : undefined
        }
      >
        {onListBack && (
          <button
            type="button"
            onClick={onListBack}
            className={
              visual === "calls"
                ? "inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px] shrink-0"
                : "shrink-0 rounded-md p-1.5 hover:bg-bg-overlay text-text-tertiary"
            }
            title={t("calls.meeting.listBackTooltip").replace(
              "{label}",
              effectiveListBack,
            )}
          >
            <ArrowLeft size={visual === "calls" ? 13 : 16} />
            {visual === "calls" && !compact && (
              <span className="hidden sm:inline">{effectiveListBack}</span>
            )}
          </button>
        )}

        {leadingIcon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#5b5fc7]/20">
            {leadingIcon}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {meta}
          <h2
            className={`truncate font-semibold leading-tight text-text-primary ${
              compact ? "text-[12px]" : "text-[13px]"
            }`}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className={`truncate text-text-tertiary ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
              title={subtitle}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {participants && !compact && (
          <div className="hidden sm:flex shrink-0">{participants}</div>
        )}

        {connQ != null && (
          <ConnBadge
            q={connQ}
            titleTpl={t("calls.conn.qualityTitle")}
            good={t("calls.conn.good")}
            ok={t("calls.conn.ok")}
            poor={t("calls.conn.poor")}
          />
        )}

        {expandVisible && onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className={btn}
            title={t("calls.meeting.maximize")}
          >
            <Maximize2 size={visual === "calls" ? 12 : 15} />
          </button>
        )}

        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            className={btn}
            title={t("calls.meeting.minimize")}
          >
            <Minimize2 size={visual === "calls" ? 12 : 15} />
          </button>
        )}

        {popOut && (
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
            title={t("calls.meeting.openNewTab")}
          >
            <Maximize2 size={visual === "calls" ? 12 : 15} />
          </a>
        )}

        {copyLink && (
          <button
            type="button"
            onClick={copy}
            className={btn}
            title={t("calls.meeting.copyInvite")}
          >
            <ExternalLink size={visual === "calls" ? 12 : 15} />
          </button>
        )}

        <button
          type="button"
          onClick={hang}
          className={
            visual === "calls"
              ? "inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px] shrink-0"
              : "shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-bg-overlay hover:text-text-primary"
          }
          title={effectiveHangUp}
        >
          <X size={visual === "calls" ? 12 : 15} />
        </button>
      </div>
    </div>
  );
}
