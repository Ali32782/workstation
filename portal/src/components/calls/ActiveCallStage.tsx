"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { useT } from "@/components/LocaleProvider";
import type { CallSummary } from "@/lib/calls/types";
import { JitsiEmbed } from "./JitsiEmbed";
import { MeetingChrome } from "./MeetingChrome";
import { contextIcon, contextLabel } from "./shared";

export type CallStageLayout = "fullscreen" | "pip";

/**
 * Laufender Portal-Call: ein gemounteter {@link JitsiEmbed}, Wechsel
 * Vollbild ↔ PiP ohne Teardown (Teams-„Zur Liste mit Miniatur“).
 */
export function ActiveCallStage({
  call,
  meName,
  meEmail,
  accent,
  layout,
  onLayoutChange,
  onEndForEveryone,
}: {
  call: CallSummary;
  meName: string;
  meEmail: string;
  accent: string;
  layout: CallStageLayout;
  onLayoutChange: (l: CallStageLayout) => void;
  onEndForEveryone: () => void;
}) {
  const t = useT();
  const [connQ, setConnQ] = useState<number | null>(null);
  const activeParticipants = call.participants.filter((p) => !p.leftAt);
  const pip = layout === "pip";

  const meta = !pip ? (
    <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary leading-none mb-0.5">
      <span>{contextIcon(call.context)}</span>
      <span className="truncate">{contextLabel(call.context, t)}</span>
      <span className="text-text-quaternary">·</span>
      <span className="truncate">{call.createdByName}</span>
    </div>
  ) : null;

  const participants =
    activeParticipants.length > 0 ? (
      <div
        className="flex items-center gap-1.5 text-text-tertiary"
        title={t("calls.stage.activeParticipantsTitle").replace(
          "{count}",
          String(activeParticipants.length),
        )}
      >
        <Users size={12} />
        <AvatarStack
          members={activeParticipants.map((p) => ({
            name: p.displayName,
            email: p.email,
          }))}
          size={20}
          max={4}
        />
      </div>
    ) : null;

  return (
    <div
      className={
        pip
          ? "fixed z-[90] flex flex-col overflow-hidden rounded-xl border border-stroke-1 bg-bg-chrome shadow-2xl touch-manipulation bottom-[max(5.5rem,env(safe-area-inset-bottom,0px))] right-3 w-[min(calc(100vw-1.5rem),380px)] h-[min(38vh,280px)] max-h-[320px] md:bottom-6 md:right-5"
          : "fixed inset-0 z-[90] flex flex-col bg-[#11151a] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
      }
      role="region"
      aria-label={t("calls.stage.ariaActiveCall")}
    >
      <MeetingChrome
        visual="calls"
        compact={pip}
        accent={pip ? undefined : accent}
        title={call.subject}
        subtitle={
          pip
            ? t("calls.stage.pipSubtitleActive").replace(
                "{count}",
                String(activeParticipants.length),
              )
            : undefined
        }
        meta={meta}
        participants={participants}
        connQ={connQ}
        joinUrl={call.joinUrl}
        popOut
        copyLink
        onListBack={pip ? undefined : () => onLayoutChange("pip")}
        onExpand={pip ? () => onLayoutChange("fullscreen") : undefined}
        expandVisible={pip}
        onMinimize={pip ? undefined : () => onLayoutChange("pip")}
        onHangUp={onEndForEveryone}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#11151a]">
        <JitsiEmbed
          joinUrl={call.joinUrl}
          roomName={call.roomName}
          displayName={meName}
          email={meEmail}
          subject={call.subject}
          onConnectionQuality={setConnQ}
          preferTileView
          preflight
          prejoinPage
          appLabel="Portal · Team-Call"
        />
      </div>
    </div>
  );
}
