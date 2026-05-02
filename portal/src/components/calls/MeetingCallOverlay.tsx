"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, Video } from "lucide-react";
import { JitsiEmbed } from "@/components/calls/JitsiEmbed";
import { MeetingChrome } from "@/components/calls/MeetingChrome";
import { useT } from "@/components/LocaleProvider";

/**
 * Chat-gestartetes Meeting: gemeinsames {@link MeetingChrome}, Jitsi bleibt
 * beim Minimieren gemountet (PiP-Karte über dem Chat).
 */
export function MeetingCallOverlay({
  joinUrl,
  callMode,
  displayName,
  email,
  subject,
  /** z. B. „Corehub“ — erscheint im Jitsi-App-Namen. */
  workspaceLabel = "Portal",
  onClose,
}: {
  joinUrl: string;
  callMode: "video" | "voice";
  displayName: string;
  email: string;
  subject: string;
  workspaceLabel?: string;
  onClose: () => void;
}) {
  const t = useT();
  const [portalReady, setPortalReady] = useState(false);
  const [connQ, setConnQ] = useState<number | null>(null);
  const [docked, setDocked] = useState(false);

  useEffect(() => setPortalReady(true), []);

  if (!portalReady || typeof document === "undefined") return null;

  const isVoice = callMode === "voice";

  const stage = (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-bg-chrome shadow-2xl md:rounded-xl md:border md:border-stroke-1 ${
        docked ? "h-full max-h-[min(42vh,320px)]" : "h-full"
      }`}
    >
      <MeetingChrome
        visual="chat"
        compact={docked}
        showGradientStrip
        leadingIcon={
          isVoice ? (
            <Phone size={16} className="text-emerald-400" />
          ) : (
            <Video size={16} className="text-[#5b5fc7]" />
          )
        }
        title={
          isVoice ? t("chat.overlay.chromeTitleVoice") : t("chat.overlay.chromeTitleVideo")
        }
        subtitle={subject}
        connQ={connQ}
        joinUrl={joinUrl}
        popOut
        copyLink
        onMinimize={docked ? undefined : () => setDocked(true)}
        onExpand={docked ? () => setDocked(false) : undefined}
        expandVisible={docked}
        onHangUp={onClose}
        hangUpTitle={t("chat.overlay.endCall")}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#11151a]">
        <JitsiEmbed
          joinUrl={joinUrl}
          displayName={
            displayName.trim() || t("chat.overlay.participantFallback")
          }
          email={email.trim()}
          subject={subject}
          mediaMode={callMode}
          preflight
          appLabel={`${workspaceLabel} · ${t("chat.overlay.jitsiAppSuffix")}`}
          onConnectionQuality={setConnQ}
          preferTileView={!isVoice}
        />
      </div>
    </div>
  );

  return createPortal(
    <div
      className={`fixed z-[200] flex flex-col backdrop-blur-[1px] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] ${
        docked
          ? "inset-x-0 bottom-0 justify-end bg-transparent pointer-events-none sm:inset-auto sm:bottom-6 sm:right-6 sm:left-auto sm:top-auto sm:max-w-none"
          : "inset-0 items-stretch justify-end bg-black/80 pointer-events-auto sm:items-center sm:justify-center sm:p-2 md:p-3"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-call-title"
    >
      <div
        className={`mx-auto flex w-full min-h-0 flex-col pointer-events-auto ${
          docked
            ? "max-h-[min(44vh,340px)] w-full max-w-[400px] px-2 pb-2 sm:px-0 sm:pb-0"
            : "h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-0.5rem))] max-h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-0.5rem))] w-full max-w-[min(100vw-1rem,1400px)] shrink-0 sm:flex-none"
        }`}
      >
        <span id="chat-call-title" className="sr-only">
          {isVoice ? t("chat.overlay.chromeTitleVoice") : t("chat.overlay.chromeTitleVideo")}
        </span>
        {stage}
      </div>
    </div>,
    document.body,
  );
}
