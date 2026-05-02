"use client";

import { memo, useCallback } from "react";
import { AvatarStack } from "@/components/ui/Avatar";
import { shortTime } from "@/components/ui/datetime";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";
import type { CallSummary } from "@/lib/calls/types";
import { contextIcon, fmtDuration } from "./shared";

/**
 * `CallRow` re-renders only when its own `call` reference, its `selected`
 * flag, or the stable `onSelect` callback change — keyed by `call.id`
 * from the parent. This prevents the entire list from thrashing when
 * the 60s poll mutates an unrelated row.
 */
export const CallRow = memo(function CallRow({
  call,
  selected,
  onSelect,
}: {
  call: CallSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const localeFmt = localeTag(locale);
  const active = !call.endedAt;
  const activeParticipants = call.participants.filter((p) => !p.leftAt);
  const ctxIcon = contextIcon(call.context);
  const handleClick = useCallback(
    () => onSelect(call.id),
    [onSelect, call.id],
  );
  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full text-left px-3 py-2 border-b border-stroke-1/60 ${
          selected ? "bg-bg-overlay" : "hover:bg-bg-overlay/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              active ? "bg-emerald-400 animate-pulse" : "bg-text-quaternary"
            }`}
            title={active ? t("calls.active") : t("calls.detail.ended")}
          />
          <span className="text-text-tertiary">{ctxIcon}</span>
          <span className="flex-1 text-[12.5px] font-medium truncate">
            {call.subject}
          </span>
          <span className="text-[10.5px] text-text-tertiary tabular-nums">
            {shortTime(call.startedAt, localeFmt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10.5px] text-text-tertiary">
          <span className="truncate">
            {call.createdByName}
            {call.context.kind !== "adhoc" &&
              call.context.label &&
              ` · ${call.context.label}`}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            {activeParticipants.length > 0 && active && (
              <AvatarStack
                members={activeParticipants.map((p) => ({
                  name: p.displayName,
                  email: p.email,
                }))}
                size={16}
                max={3}
              />
            )}
            {!active && call.durationSeconds != null && (
              <span className="font-mono">
                {fmtDuration(call.durationSeconds)}
              </span>
            )}
          </span>
        </div>
      </button>
    </li>
  );
});
