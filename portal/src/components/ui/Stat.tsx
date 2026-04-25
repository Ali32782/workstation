type Tone = "info" | "warning" | "success" | "danger";

const TONE_COLORS: Record<Tone, string> = {
  info: "var(--color-info)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
};

export function Stat({
  value,
  label,
  tone = "info",
}: {
  value: string;
  label: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-md border border-stroke-1 bg-bg-elevated p-3 flex flex-col gap-0.5">
      <span
        className="text-2xl font-bold leading-none"
        style={{ color: TONE_COLORS[tone] }}
      >
        {value}
      </span>
      <span className="text-text-tertiary text-xs">{label}</span>
    </div>
  );
}
