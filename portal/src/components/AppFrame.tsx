"use client";

import { useState, useMemo } from "react";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { resolveWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { useLocale } from "@/components/LocaleProvider";

export function AppFrame({
  appId,
  name,
  description,
  url,
  accent,
}: {
  appId: string;
  name: string;
  description: string;
  url: string;
  accent: string;
}) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const Icon = useMemo(() => {
    const ids: WorkspaceId[] = ["corehub", "medtheris", "kineo"];
    for (const id of ids) {
      const ws = resolveWorkspace(id);
      const match = ws.apps.find((a) => a.id === appId);
      if (match) return match.icon;
    }
    return ExternalLink;
  }, [appId]);

  /** Jitsi/Meet needs volle Browserechte — ein strenges `sandbox` blockiert getUserMedia. */
  const isJitsiMeet = useMemo(() => {
    try {
      return /(^|\.)meet\./.test(new URL(url, "https://placeholder.local").hostname);
    } catch {
      return false;
    }
  }, [url]);

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 px-4 flex items-center gap-3 border-b border-stroke-1 bg-bg-chrome shrink-0">
        <Icon size={15} style={{ color: accent }} />
        <span className="text-text-primary text-sm font-semibold">{name}</span>
        <span className="text-text-tertiary text-xs hidden md:inline">
          {description}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => {
            setReloadKey((k) => k + 1);
            setLoading(true);
            setIframeBlocked(false);
          }}
          className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors"
          title={t("common.reload")}
        >
          <RefreshCw size={14} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors"
          title={t("common.openInNewTab")}
        >
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="flex-1 relative bg-white">
        {loading && !iframeBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-base z-10">
            <Loader2 size={28} className="text-text-tertiary spin" />
          </div>
        )}

        {iframeBlocked ? (
          <IframeBlockedFallback name={name} url={url} accent={accent} />
        ) : (
          <iframe
            key={reloadKey}
            src={url}
            className="w-full h-full border-0"
            onLoad={(e) => {
              setLoading(false);
              try {
                const frame = e.target as HTMLIFrameElement;
                const cw = frame.contentWindow;
                if (cw && cw.location.href === "about:blank") {
                  setIframeBlocked(true);
                }
              } catch {
                /* cross-origin access denied = iframe loaded fine */
              }
            }}
            {...(isJitsiMeet
              ? {
                  allow:
                    "camera; microphone; display-capture; clipboard-write; autoplay; fullscreen; web-share",
                  allowFullScreen: true,
                  referrerPolicy: "no-referrer-when-downgrade" as const,
                }
              : {
                  sandbox:
                    "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals",
                  referrerPolicy: "strict-origin-when-cross-origin" as const,
                })}
          />
        )}
      </div>
    </div>
  );
}

function IframeBlockedFallback({
  name,
  url,
  accent,
}: {
  name: string;
  url: string;
  accent: string;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
      <div className="max-w-md mx-auto px-6 py-8 text-center flex flex-col gap-4">
        <div
          className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: `${accent}20` }}
        >
          <ExternalLink size={20} style={{ color: accent }} />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-text-primary font-semibold">
            {name} kann nicht eingebettet werden
          </h3>
          <p className="text-text-tertiary text-sm">
            Diese App erlaubt kein Iframe-Embedding. Öffne sie in einem neuen Tab.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md text-white text-sm font-medium px-4 py-2 transition-opacity hover:opacity-90"
          style={{ background: accent }}
        >
          <ExternalLink size={14} />
          {name} öffnen
        </a>
        <p className="text-text-quaternary text-xs">{url}</p>
      </div>
    </div>
  );
}
