type Kind = "ok" | "info" | "warn" | "err";

const KIND_COLORS: Record<Kind, string> = {
  ok: "var(--color-success)",
  info: "var(--color-info)",
  warn: "var(--color-warning)",
  err: "var(--color-danger)",
};

export function FeedItem({
  time,
  who,
  what,
  kind = "info",
}: {
  time: string;
  who: string;
  what: string;
  kind?: Kind;
  accent?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md border border-stroke-1 bg-bg-elevated">
      <span
        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
        style={{ background: KIND_COLORS[kind] }}
      />
      <span className="text-text-quaternary text-xs font-mono mt-0.5 shrink-0">
        {time}
      </span>
      <div className="flex-1 min-w-0 flex flex-col leading-snug">
        <span className="text-text-primary text-sm">{what}</span>
        <span className="text-text-tertiary text-xs">{who}</span>
      </div>
    </div>
  );
}
