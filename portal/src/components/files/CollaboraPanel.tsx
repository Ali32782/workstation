"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Loader2, FileText } from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Collabora Online editor opener.
 *
 * Hitting `/apps/richdocuments/index?fileId=…` directly fails with
 * "CSRF check failed" whenever the browser still has stale NC `nc_token`
 * cookies from a previous session — NC's `Session::loginWithCookie` aborts
 * before the OIDC redirect ever happens. We therefore hand the browser to
 * a same-origin portal route (`/api/files/safe-open`) that quickly purges
 * the stale cookies via a hidden iframe → `/index.php/logout` round-trip,
 * then navigates to the user_oidc login flow which always emits a clean
 * 303 to Keycloak and bounces back into NC with a fresh session.
 *
 * Embedding in an iframe is still gated behind an explicit user action:
 * third-party cookie policies (SameSite on `__Host-nc_*`) often block the
 * NC session in iframe context on the first round-trip, so a new tab is
 * the safe default.
 */

function buildOpenUrl(workspaceId: WorkspaceId, fileId: number): string {
  const params = new URLSearchParams({
    ws: workspaceId,
    fileId: String(fileId),
  });
  return `/api/files/safe-open?${params.toString()}`;
}

export function CollaboraPanel({
  workspaceId,
  fileId,
  name,
  onClose,
}: {
  workspaceId: WorkspaceId;
  fileId: number;
  name: string;
  onClose: () => void;
}) {
  const url = buildOpenUrl(workspaceId, fileId);
  const popupRef = useRef<Window | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (embedded) return;
    if (popupRef.current && !popupRef.current.closed) return;
    popupRef.current = window.open(url, "_blank", "noopener,noreferrer");
  }, [url, embedded]);

  return (
    <div className="fixed inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-bg-chrome border border-stroke-1 rounded-lg shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">
        <header className="shrink-0 h-11 px-4 flex items-center gap-2 border-b border-stroke-1 bg-bg-elevated">
          <FileText size={14} className="text-text-tertiary" />
          <span className="text-sm font-semibold text-text-primary truncate flex-1">
            {name}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded-md text-xs flex items-center gap-1.5 hover:bg-bg-overlay text-text-secondary hover:text-text-primary"
            title="Editor in neuem Tab öffnen"
          >
            <ExternalLink size={13} />
            Neuer Tab
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Schließen"
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex-1 min-h-0 relative bg-white">
          {!embedded && (
            <div className="absolute inset-0 flex items-center justify-center p-8 bg-bg-base">
              <div className="max-w-md text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-accent-primary/15 flex items-center justify-center">
                  <FileText className="w-7 h-7 text-accent-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-text-primary">
                    Editor wird in neuem Tab geöffnet
                  </h2>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Beim ersten Öffnen meldet Nextcloud Sie automatisch über
                    Keycloak an — danach bleiben Sie für alle weiteren Dokumente
                    eingeloggt.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-accent-primary text-white text-sm font-medium hover:bg-accent-primary-hover"
                  >
                    <ExternalLink size={15} />
                    Editor öffnen
                  </a>
                  <button
                    type="button"
                    onClick={() => setEmbedded(true)}
                    className="text-xs text-text-tertiary hover:text-text-primary"
                  >
                    oder hier einbetten (nach erstem Login möglich)
                  </button>
                </div>
              </div>
            </div>
          )}
          {embedded && (
            <>
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/80">
                  <Loader2 className="w-7 h-7 spin text-text-tertiary" />
                </div>
              )}
              <iframe
                title={name}
                src={url}
                className="w-full h-full border-0"
                allow="clipboard-read; clipboard-write; fullscreen"
                allowFullScreen
                onLoad={() => setIframeLoading(false)}
                referrerPolicy="no-referrer-when-downgrade"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
