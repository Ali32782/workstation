"use client";

/**
 * Stable, hash-based avatar with initials. Used by helpdesk + CRM lists,
 * conversation threads, sidebars, etc.  No avatar image required —
 * deterministic from the input string so the same person always gets the
 * same color, like Linear/GitHub.
 *
 * Background palette is intentionally muted (10% opacity tints) so
 * avatars never fight with the surrounding UI.
 */

const PALETTE: { bg: string; fg: string }[] = [
  { bg: "rgba(59,130,246,0.18)", fg: "#3b82f6" }, // blue
  { bg: "rgba(168,85,247,0.18)", fg: "#a855f7" }, // purple
  { bg: "rgba(16,185,129,0.18)", fg: "#10b981" }, // emerald
  { bg: "rgba(234,179,8,0.18)", fg: "#eab308" }, // amber
  { bg: "rgba(239,68,68,0.18)", fg: "#ef4444" }, // red
  { bg: "rgba(14,165,233,0.18)", fg: "#0ea5e9" }, // sky
  { bg: "rgba(20,184,166,0.18)", fg: "#14b8a6" }, // teal
  { bg: "rgba(249,115,22,0.18)", fg: "#f97316" }, // orange
  { bg: "rgba(236,72,153,0.18)", fg: "#ec4899" }, // pink
  { bg: "rgba(124,58,237,0.18)", fg: "#7c3aed" }, // violet
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

export function colorsFor(seed: string): { bg: string; fg: string } {
  return PALETTE[hash(seed || "?") % PALETTE.length];
}

export function Avatar({
  name,
  email,
  size = 28,
  src,
  ring = false,
  title,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  src?: string | null;
  ring?: boolean;
  title?: string;
}) {
  const seed = (email ?? name ?? "?").toLowerCase();
  const initials = initialsFor(name ?? email);
  const colors = colorsFor(seed);
  const fontSize = Math.max(9, Math.round(size * 0.4));

  if (src) {
    return (
      <span
        className={`inline-block shrink-0 rounded-full overflow-hidden ${
          ring ? "ring-2 ring-bg-base" : ""
        }`}
        style={{ width: size, height: size }}
        title={title ?? name ?? email ?? undefined}
      >
        <img
          src={src}
          alt={name ?? email ?? "Avatar"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full font-semibold ${
        ring ? "ring-2 ring-bg-base" : ""
      }`}
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.fg,
        fontSize,
        lineHeight: 1,
      }}
      title={title ?? name ?? email ?? undefined}
    >
      {initials}
    </span>
  );
}

/**
 * Compact horizontal stack of avatars with a "+N more" overflow chip.
 */
export function AvatarStack({
  members,
  size = 22,
  max = 3,
}: {
  members: { name?: string | null; email?: string | null; src?: string | null }[];
  size?: number;
  max?: number;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((m, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size / 3 }}>
          <Avatar
            name={m.name}
            email={m.email}
            src={m.src}
            size={size}
            ring
          />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-bg-overlay text-text-tertiary font-semibold ring-2 ring-bg-base"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(9, Math.round(size * 0.36)),
            marginLeft: -size / 3,
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
