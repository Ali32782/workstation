import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getPulseForCurrentUser, flattenStats, type PulseStat } from "@/lib/pulse";
import { localeTag, tFor, type Locale } from "@/lib/i18n/messages";

const TONE_COLORS: Record<PulseStat["tone"], string> = {
  info: "var(--color-info)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  neutral: "var(--color-text-secondary)",
};

const SKELETON_KEYS = ["mail", "tasks", "chat", "feed"];

export function LivePulse({
  workspace,
  workspaceName,
  locale,
}: {
  workspace: string;
  /** Optional label, e.g. "MedTheris" — keeps the pulse block scoped to the tenant. */
  workspaceName?: string;
  locale: Locale;
}) {
  const title = workspaceName
    ? tFor(locale, "pulse.titleWithWorkspace").replace("{name}", workspaceName)
    : tFor(locale, "pulse.titleDefault");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-text-primary font-semibold text-sm">{title}</h2>
      </div>
      <Suspense fallback={<PulseSkeleton />}>
        <PulseGrid workspace={workspace} locale={locale} />
      </Suspense>
    </div>
  );
}

async function PulseGrid({ workspace, locale }: { workspace: string; locale: Locale }) {
  const snapshot = await getPulseForCurrentUser(workspace, locale);
  const stats = flattenStats(snapshot);
  const tag = localeTag(locale);
  const generated = new Date(snapshot.generatedAt).toLocaleTimeString(tag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map((s) => (
          <PulseTile key={s.key} stat={s} />
        ))}
      </div>
      <span className="text-text-tertiary text-[11px] -mt-1">
        {tFor(locale, "pulse.updated").replace("{time}", generated)}
      </span>
    </>
  );
}

function PulseSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {SKELETON_KEYS.map((k) => (
        <div
          key={k}
          className="rounded-md border border-stroke-1 bg-bg-elevated p-3 flex flex-col gap-1.5 animate-pulse"
        >
          <div className="h-7 w-12 rounded bg-stroke-1" />
          <div className="h-3 w-20 rounded bg-stroke-1" />
          <div className="h-2.5 w-28 rounded bg-stroke-1 opacity-60" />
        </div>
      ))}
    </div>
  );
}

function PulseTile({ stat }: { stat: PulseStat }) {
  const inner = (
    <div className="rounded-md border border-stroke-1 bg-bg-elevated p-3 flex flex-col gap-0.5 group hover:border-stroke-2 transition-colors">
      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold leading-none"
          style={{ color: TONE_COLORS[stat.tone] }}
        >
          {stat.value}
        </span>
        {stat.href && (
          <ArrowUpRight
            size={14}
            className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
          />
        )}
      </div>
      <span className="text-text-secondary text-xs font-medium">{stat.label}</span>
      {stat.hint && (
        <span className="text-text-tertiary text-[11px] leading-tight mt-0.5">
          {stat.hint}
        </span>
      )}
    </div>
  );
  if (!stat.href) return inner;
  return (
    <Link href={stat.href} target={stat.href.startsWith("/api/") ? "_blank" : undefined}>
      {inner}
    </Link>
  );
}
