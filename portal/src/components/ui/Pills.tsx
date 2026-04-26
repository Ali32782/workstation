"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * StatusPill: rounded label whose color is keyed by the status name.
 * The mapping is intentionally fuzzy (substring match) so it works for both
 * Zammad and Plane vocabulary out of the box.
 */
export type StatusTone =
  | "neutral"
  | "info"
  | "warn"
  | "success"
  | "danger"
  | "muted";

const TONE_STYLES: Record<StatusTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", bd: "rgba(148,163,184,0.3)" },
  info: { bg: "rgba(59,130,246,0.18)", fg: "#60a5fa", bd: "rgba(59,130,246,0.3)" },
  warn: { bg: "rgba(234,179,8,0.18)", fg: "#facc15", bd: "rgba(234,179,8,0.3)" },
  success: { bg: "rgba(16,185,129,0.18)", fg: "#34d399", bd: "rgba(16,185,129,0.3)" },
  danger: { bg: "rgba(239,68,68,0.18)", fg: "#f87171", bd: "rgba(239,68,68,0.3)" },
  muted: { bg: "rgba(100,116,139,0.14)", fg: "#94a3b8", bd: "rgba(100,116,139,0.25)" },
};

export function toneForState(name: string | null | undefined): StatusTone {
  const n = (name ?? "").toLowerCase();
  if (!n) return "neutral";
  if (/closed|done|geschlossen|gelöst|geloest|merged/.test(n)) return "success";
  if (/pending|wartet|wartend|on.?hold|hold/.test(n)) return "warn";
  if (/new|neu|open|offen|in.?progress|bearbeit/.test(n)) return "info";
  if (/cancel|abgebroch|reject|ablehn/.test(n)) return "danger";
  return "neutral";
}

export function StatusPill({
  label,
  tone,
  icon,
  size = "sm",
}: {
  label: string;
  tone?: StatusTone;
  icon?: ReactNode;
  size?: "sm" | "md";
}) {
  const t = TONE_STYLES[tone ?? toneForState(label)];
  const padding = size === "md" ? "px-2 py-0.5" : "px-1.5 py-[1px]";
  const fontSize = size === "md" ? "11px" : "10px";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${padding}`}
      style={{
        background: t.bg,
        color: t.fg,
        borderColor: t.bd,
        fontSize,
        lineHeight: 1.2,
      }}
    >
      {icon}
      <span className="truncate max-w-[160px]">{label}</span>
    </span>
  );
}

/**
 * PriorityChip: tiny coloured tag, matches Zammad's 1/2/3 numeric scale
 * but also tolerates Plane's "urgent / high / med / low" wording.
 */
export type PriorityLevel = "urgent" | "high" | "med" | "low" | "none";

const PRIORITY_STYLES: Record<PriorityLevel, { bg: string; fg: string; label: string; bar: string }> = {
  urgent: { bg: "rgba(220,38,38,0.18)", fg: "#fca5a5", label: "Urgent", bar: "#dc2626" },
  high: { bg: "rgba(249,115,22,0.18)", fg: "#fdba74", label: "Hoch", bar: "#f97316" },
  med: { bg: "rgba(234,179,8,0.18)", fg: "#facc15", label: "Mittel", bar: "#eab308" },
  low: { bg: "rgba(100,116,139,0.18)", fg: "#94a3b8", label: "Niedrig", bar: "#64748b" },
  none: { bg: "rgba(100,116,139,0.10)", fg: "#94a3b8", label: "—", bar: "transparent" },
};

export function priorityLevel(name: string | null | undefined): PriorityLevel {
  const n = (name ?? "").toLowerCase().trim();
  if (!n) return "none";
  if (/^3|hoch|high|urgent|wichtig/.test(n)) {
    if (/urgent|sehr/.test(n)) return "urgent";
    return "high";
  }
  if (/^1|niedr|low/.test(n)) return "low";
  if (/^2|normal|med|mittel/.test(n)) return "med";
  if (/^4|urgent/.test(n)) return "urgent";
  return "med";
}

export function PriorityChip({
  name,
  size = "sm",
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
}) {
  const lvl = priorityLevel(name);
  const s = PRIORITY_STYLES[lvl];
  const padding = size === "md" ? "px-2 py-0.5" : "px-1.5 py-[1px]";
  const fontSize = size === "md" ? "11px" : "10px";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${padding}`}
      style={{ background: s.bg, color: s.fg, fontSize, lineHeight: 1.2 }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: s.bar }}
      />
      {s.label}
    </span>
  );
}

export function priorityBarColor(name: string | null | undefined): string {
  return PRIORITY_STYLES[priorityLevel(name)].bar;
}

/** Small full-bleed strip used as the card's left edge. */
export function PriorityBar({
  name,
  style,
}: {
  name: string | null | undefined;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="block w-[3px] h-full self-stretch rounded-sm"
      style={{ background: priorityBarColor(name), ...style }}
    />
  );
}
