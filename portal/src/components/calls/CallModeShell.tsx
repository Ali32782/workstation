"use client";

import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  Users,
  X,
} from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { useT } from "@/components/LocaleProvider";
import type { CallSummary } from "@/lib/calls/types";
import { JitsiEmbed } from "./JitsiEmbed";
import { contextIcon, contextLabel } from "./shared";

/**
 * Single-pane call mode. Replaces the entire three-pane layout while a
 * call is active and embedded so the user can focus on the conversation.
 *
 * Renders just a slim header (back button, subject, context, participant
 * stack, leave/pop-out controls) and a full-bleed Jitsi iframe.
 */
export function CallModeShell({
  call,
  meName,
  meEmail,
  accent,
  onLeave,
  onEnd,
}: {
  call: CallSummary;
  meName: string;
  meEmail: string;
  accent: string;
  /** "Zurück zur Liste" — hides the embed but doesn't end the call. */
  onLeave: () => void;
  /** Ends the call for everyone. */
  onEnd: () => void;
}) {
  const t = useT();
  const activeParticipants = call.participants.filter((p) => !p.leftAt);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#11151a] text-text-primary text-[13px]">
      <header
        className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px]"
          title={t("calls.shell.backTooltip")}
        >
          <ArrowLeft size={13} />
          {t("calls.meeting.backToList")}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary leading-none mb-0.5">
            <span>{contextIcon(call.context)}</span>
            <span className="truncate">{contextLabel(call.context, t)}</span>
            <span className="text-text-quaternary">·</span>
            <span className="truncate">{call.createdByName}</span>
          </div>
          <h1 className="text-[12.5px] font-semibold leading-tight truncate">
            {call.subject}
          </h1>
        </div>

        {activeParticipants.length > 0 && (
          <div
            className="hidden sm:flex items-center gap-1.5 text-text-tertiary"
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
        )}

        <a
          href={call.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
          title={t("calls.meeting.openNewTab")}
        >
          <Maximize2 size={12} />
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(call.joinUrl);
          }}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
          title={t("calls.meeting.copyInvite")}
        >
          <ExternalLink size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(t("calls.confirm.endForEveryone"))) onEnd();
          }}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px]"
          title={t("calls.detail.endCall")}
        >
          <X size={12} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <JitsiEmbed
          joinUrl={call.joinUrl}
          roomName={call.roomName}
          displayName={meName}
          email={meEmail}
          subject={call.subject}
        />
      </div>
    </div>
  );
}
