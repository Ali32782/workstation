"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2, Phone } from "lucide-react";
import {
  JITSI_IFRAME_ALLOW,
  jitsiRoomFromInviteLink,
  loadJitsiExternalApi,
  probeMediaPermission,
} from "@/lib/jitsi/client";
import { PREFLIGHT_I18N_KEY } from "@/components/calls/usePreflight";
import type { PreflightFailure } from "@/components/calls/usePreflight";
import { useT } from "@/components/LocaleProvider";

/**
 * HTTPS-JSON für Jitsi Dynamic Branding (euer Logo statt Jitsi). Nur wenn
 * meet.* die URL abruft darf; restliche Emblem-Freistellung: Server
 * `interface_config.js` / Docker-Overlay (siehe .env.example).
 */
const JITSI_BRANDING_DATA_URL =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_JITSI_BRANDING_DATA_URL?.trim() ?? ""
    : "";

type JitsiApi = {
  dispose: () => void;
  getIFrame?: () => HTMLIFrameElement | null;
};

type JitsiApiWithCommands = JitsiApi & {
  executeCommand?: (cmd: string, ...args: unknown[]) => void;
};

/**
 * Memoised so the embed never tears down on parent re-renders. The inner
 * effect guards the hard re-init to actual room/url changes; `memo` stops
 * the JSX tree from re-rendering when only sibling state updates.
 */
export const JitsiEmbed = memo(function JitsiEmbed({
  joinUrl,
  roomName: roomNameProp,
  displayName,
  email,
  subject,
  mediaMode = "video",
  /** Chat-style probe before iframe (Calls page runs `usePreflight` separately). */
  preflight = false,
  appLabel = "Portal Calls",
  onConnectionQuality,
  /** Gitteransicht statt dominanter Filmstrip (nur sinnvoll bei Video). */
  preferTileView = false,
  /**
   * Geräte-Check vor dem Raum (sinnvoll bei geplanten Portal-Calls).
   * Bei eingehendem Chat-Anruf meist `false`, damit der Beitritt schnell bleibt.
   */
  prejoinPage = false,
}: {
  joinUrl: string;
  roomName?: string;
  displayName: string;
  email: string;
  subject: string;
  mediaMode?: "video" | "voice";
  preflight?: boolean;
  appLabel?: string;
  onConnectionQuality?: (score: number | null) => void;
  preferTileView?: boolean;
  prejoinPage?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApiWithCommands | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "iframe" | "error" | "perm-block"
  >("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [permIssue, setPermIssue] = useState<PreflightFailure | null>(
    null,
  );
  const [permRetry, setPermRetry] = useState(0);
  const t = useT();

  const softRef = useRef({ displayName, email, subject });
  const cqRef = useRef(onConnectionQuality);
  cqRef.current = onConnectionQuality;

  useEffect(() => {
    softRef.current = { displayName, email, subject };
    const api = apiRef.current;
    if (!api?.executeCommand) return;
    try {
      if (subject) api.executeCommand("subject", subject);
      if (displayName) api.executeCommand("displayName", displayName);
      if (email) api.executeCommand("email", email);
    } catch {
      /* non-critical */
    }
  }, [displayName, email, subject]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    setStatus("loading");
    setErrMsg(null);
    setPermIssue(null);

    let url: URL;
    try {
      url = new URL(joinUrl);
    } catch {
      setStatus("error");
      setErrMsg(t("calls.jitsi.invalidUrl"));
      return;
    }
    const origin = url.origin;
    const domain = url.hostname;

    let roomName = roomNameProp?.trim() ?? "";
    if (!roomName) {
      try {
        roomName = jitsiRoomFromInviteLink(joinUrl).room;
      } catch (e) {
        setStatus("error");
        setErrMsg(
          e instanceof Error ? e.message : t("calls.jitsi.invalidUrl"),
        );
        return;
      }
    }

    const run = async () => {
      const isVoice = mediaMode === "voice";
      let startWithVideoMuted = isVoice;

      if (preflight) {
        const perm = await probeMediaPermission();
        if (cancelled) return;
        if (!perm.ok) {
          setPermIssue(perm.reason);
          if (
            perm.reason === "denied" ||
            perm.reason === "no-device" ||
            perm.reason === "insecure"
          ) {
            setStatus("perm-block");
            return;
          }
        } else {
          startWithVideoMuted = isVoice || !perm.cameraOk;
        }
      }

      if (cancelled) return;

      try {
        await loadJitsiExternalApi(origin);
        if (cancelled) return;
        const ctor = (
          window as unknown as {
            JitsiMeetExternalAPI?: new (
              d: string,
              o: Record<string, unknown>,
            ) => JitsiApiWithCommands;
          }
        ).JitsiMeetExternalAPI;
        if (!ctor)
          throw new Error(t("calls.jitsi.externalApiMissing"));
        apiRef.current?.dispose();
        el.innerHTML = "";
        if (cancelled || !hostRef.current) return;
        const soft = softRef.current;
        const nativeShort =
          appLabel.includes("·")
            ? appLabel.split("·")[0]!.trim()
            : appLabel.trim() || "Meeting";
        const api = new ctor(domain, {
          roomName,
          parentNode: hostRef.current,
          width: "100%",
          height: "100%",
          lang: "de",
          userInfo: {
            displayName: soft.displayName,
            email: soft.email,
          },
          configOverwrite: {
            subject: soft.subject,
            disableDeepLinking: true,
            prejoinConfig: { enabled: prejoinPage },
            prejoinPageEnabled: prejoinPage,
            requireDisplayName: false,
            readOnlyName: true,
            startWithAudioMuted: false,
            startWithVideoMuted,
            ...(isVoice ? { startAudioOnly: true } : {}),
            hideDisplayName: false,
            /**
             * Bei eingebetteten 1:1-Calls sonst leere Stage / fehlende Remote-Kacheln
             * (Layer-Suspension + manchmal kaputtes Auto-Tile).
             */
            enableLayerSuspension: false,
            /** Erste n Teilnehmer in hoher Auflösung (Jitsi-Standard). */
            ...(!isVoice ? { maxFullResolutionParticipants: 8 } : {}),
            /** Sanfte Video-Defaults für Besprechungen (Meeting-Server kann überschreiben). */
            ...(!isVoice
              ? {
                  constraints: {
                    video: {
                      height: { ideal: 720, max: 1080 },
                    },
                  },
                }
              : {}),
            /** Keine Analytics/Third-Party-Calls ins Jitsi-Netzwerk (wirkt nur wenn die Instanz es erlaubt). */
            disableThirdPartyRequests: true,
            analytics: { disabled: true },
            enableWelcomePage: false,
            /** Keine „Danke/Leave“-Seite mit fremdem Branding nach Hangup. */
            enableClosePage: false,
            ...(JITSI_BRANDING_DATA_URL
              ? { brandingDataUrl: JITSI_BRANDING_DATA_URL }
              : {}),
          },
          interfaceConfigOverwrite: {
            APP_NAME: appLabel,
            NATIVE_APP_NAME: nativeShort,
            PROVIDER_NAME: nativeShort,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            HIDE_DEEP_LINKING_LOGO: true,
            SHOW_DEEP_LINKING_IMAGE: false,
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            DEFAULT_BACKGROUND: "#11151a",
            ...(preferTileView && !isVoice
              ? {
                  FILM_STRIP_ONLY: false,
                  /** Etwas mehr Kacheln auf großen Displays (Interface-Cap der Instanz). */
                  TILE_VIEW_MAX_COLUMNS: 6,
                }
              : {}),
          },
        });
        apiRef.current = api;

        try {
          const ifr = api.getIFrame?.();
          if (ifr) {
            ifr.setAttribute("allow", JITSI_IFRAME_ALLOW);
            ifr.setAttribute("allowfullscreen", "true");
          }
        } catch {
          /* noop */
        }

        try {
          const apiEv = api as unknown as {
            addListener?: (evt: string, cb: (...args: unknown[]) => void) => void;
          };
          apiEv.addListener?.("connectionQuality", (data) => {
            const d = data as {
              connectionQuality?: number;
              quality?: number;
            };
            if (cancelled) return;
            const c = Number(d?.connectionQuality ?? d?.quality ?? NaN);
            if (Number.isFinite(c)) cqRef.current?.(c);
            else cqRef.current?.(null);
          });
        } catch {
          /* cosmetic */
        }

        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("iframe");
        el.innerHTML = "";
        const ifr = document.createElement("iframe");
        ifr.src = joinUrl;
        ifr.className = "w-full h-full min-h-[280px] border-0";
        ifr.title = "Video-Call";
        ifr.allow = JITSI_IFRAME_ALLOW;
        ifr.setAttribute("allowFullScreen", "");
        el.appendChild(ifr);
        setErrMsg(
          e instanceof Error
            ? t("calls.jitsi.fallbackIframeWithMessage").replace(
                "{message}",
                e.message,
              )
            : t("calls.jitsi.fallbackIframe"),
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
      try {
        apiRef.current?.dispose();
      } catch {
        /* noop */
      }
      apiRef.current = null;
      cqRef.current?.(null);
      if (el) el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cq via ref; soft props via ref + executeCommand effect
  }, [
    joinUrl,
    roomNameProp,
    mediaMode,
    preflight,
    appLabel,
    permRetry,
    preferTileView,
    prejoinPage,
  ]);

  return (
    <div className="relative isolate min-h-0 w-full min-w-0 flex-1 flex flex-col">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-chrome/90 z-10">
          <Loader2 className="w-6 h-6 spin text-text-tertiary" />
        </div>
      )}
      {permIssue && status === "loading" && (
        <div className="absolute top-2 left-2 right-2 z-20 text-[10px] text-amber-200 bg-amber-500/15 rounded px-2 py-1 border border-amber-500/25">
          {t(PREFLIGHT_I18N_KEY[permIssue])}
        </div>
      )}
      {errMsg && status !== "loading" && (
        <p className="absolute top-2 left-2 right-2 z-10 text-[10px] text-text-tertiary bg-bg-base/80 rounded px-2 py-1">
          {errMsg}
        </p>
      )}
      {status === "perm-block" && permIssue && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-chrome/95 p-4">
          <div className="max-w-sm rounded-lg border border-stroke-1 bg-bg-elevated p-4 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
              <Phone size={18} className="text-amber-400" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-text-primary">
              {t("calls.jitsi.grantTitle")}
            </h4>
            <p className="mb-3 text-[12px] leading-relaxed text-text-secondary">
              {t(PREFLIGHT_I18N_KEY[permIssue])}
            </p>
            <p className="mb-3 text-[11px] leading-relaxed text-text-tertiary">
              {t("calls.jitsi.grantHint")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setPermIssue(null);
                  setPermRetry((n) => n + 1);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#5b5fc7]/40 bg-[#5b5fc7]/15 px-3 text-[12px] font-medium text-[#a5a8e6] transition-colors hover:bg-[#5b5fc7]/25"
              >
                <Loader2 size={13} />
                {t("calls.jitsi.retry")}
              </button>
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stroke-1 px-3 text-[12px] text-text-secondary transition-colors hover:bg-bg-overlay"
              >
                {t("calls.jitsi.openInTab")}
              </a>
            </div>
          </div>
        </div>
      )}
      {/*
        Absolute fill: percentage heights inside Jitsi’s iframe chain often
        collapse under flex parents; inset-0 gives a definite box (matches Calls page).
      */}
      <div
        ref={hostRef}
        className="absolute inset-0 min-h-[200px] w-full overflow-hidden [&_iframe]:h-full [&_iframe]:min-h-0 [&_iframe]:w-full [&_iframe]:border-0 [&_iframe]:max-h-none"
      />
    </div>
  );
});
