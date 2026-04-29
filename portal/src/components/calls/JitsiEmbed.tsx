"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const jitsiScriptByOrigin = new Map<string, Promise<void>>();

function loadJitsiExternalApi(origin: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (
    (window as unknown as { JitsiMeetExternalAPI?: unknown })
      .JitsiMeetExternalAPI
  ) {
    return Promise.resolve();
  }
  const cached = jitsiScriptByOrigin.get(origin);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${origin}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      jitsiScriptByOrigin.delete(origin);
      reject(new Error("Jitsi external_api.js konnte nicht geladen werden"));
    };
    document.head.appendChild(s);
  });
  jitsiScriptByOrigin.set(origin, p);
  return p;
}

type JitsiApi = { dispose: () => void };

type JitsiApiWithCommands = JitsiApi & {
  executeCommand?: (cmd: string, ...args: unknown[]) => void;
};

/**
 * Memoised so the embed never tears down on parent re-renders. The inner
 * effect already guards the hard re-init to actual room/url changes; the
 * `memo` here just stops the JSX tree from re-rendering when only sibling
 * state (e.g. participant list) updates.
 */
export const JitsiEmbed = memo(function JitsiEmbed({
  joinUrl,
  roomName,
  displayName,
  email,
  subject,
}: {
  joinUrl: string;
  roomName: string;
  displayName: string;
  email: string;
  subject: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApiWithCommands | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "iframe" | "error"
  >("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Stash the latest "soft" props (display name, email, subject) in a ref so
  // we can re-apply them via Jitsi commands when they change without tearing
  // down the embed and re-prompting the user for camera/mic permissions.
  const softRef = useRef({ displayName, email, subject });
  useEffect(() => {
    softRef.current = { displayName, email, subject };
    const api = apiRef.current;
    if (!api?.executeCommand) return;
    try {
      if (subject) api.executeCommand("subject", subject);
      if (displayName) api.executeCommand("displayName", displayName);
      if (email) api.executeCommand("email", email);
    } catch {
      // ignore — non-critical update
    }
  }, [displayName, email, subject]);

  // Hard re-init only when we actually need to change rooms.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    setStatus("loading");
    setErrMsg(null);
    let url: URL;
    try {
      url = new URL(joinUrl);
    } catch {
      setStatus("error");
      setErrMsg("Ungültige Call-URL");
      return;
    }
    const origin = url.origin;
    const domain = url.hostname;

    const run = async () => {
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
        if (!ctor) throw new Error("JitsiMeetExternalAPI nicht verfügbar");
        apiRef.current?.dispose();
        el.innerHTML = "";
        if (cancelled || !hostRef.current) return;
        const soft = softRef.current;
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
            prejoinConfig: { enabled: false },
          },
          interfaceConfigOverwrite: {
            APP_NAME: "Portal Calls",
            NATIVE_APP_NAME: "Portal",
            PROVIDER_NAME: "Portal",
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DEFAULT_BACKGROUND: "#11151a",
          },
        });
        apiRef.current = api;
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("iframe");
        el.innerHTML = "";
        const ifr = document.createElement("iframe");
        ifr.src = joinUrl;
        ifr.className = "w-full h-full min-h-[280px] border-0";
        ifr.title = "Video-Call";
        ifr.allow =
          "camera *; microphone *; display-capture *; clipboard-write *; autoplay; fullscreen; web-share";
        ifr.setAttribute("allowFullScreen", "");
        el.appendChild(ifr);
        setErrMsg(
          e instanceof Error
            ? `External-API: ${e.message} — Fallback Iframe.`
            : "External-API fehlgeschlagen — Iframe-Fallback.",
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
      try {
        apiRef.current?.dispose();
      } catch {
        // ignore
      }
      apiRef.current = null;
      if (el) el.innerHTML = "";
    };
    // joinUrl + roomName are the *only* identity-changing inputs. Display
    // name, email and subject are applied via the live API in the effect
    // above, so we deliberately exclude them from the deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinUrl, roomName]);

  return (
    <div className="flex-1 min-h-0 relative">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-chrome/90 z-10">
          <Loader2 className="w-6 h-6 spin text-text-tertiary" />
        </div>
      )}
      {errMsg && status !== "loading" && (
        <p className="absolute top-2 left-2 right-2 z-10 text-[10px] text-text-tertiary bg-bg-base/80 rounded px-2 py-1">
          {errMsg}
        </p>
      )}
      <div
        ref={hostRef}
        className="w-full h-full min-h-[320px] [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
      />
    </div>
  );
});
