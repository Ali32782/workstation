"use client";

import { useCallback, useMemo, useState } from "react";
import {
  FolderOpen,
  RefreshCw,
  ExternalLink,
  Loader2,
  Share2,
  FileText,
  Home,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import { getFileStationNav } from "@/lib/workspace-cloud";

const ICONS: Record<string, typeof Home> = {
  all: Home,
  documents: FileText,
  shared: Share2,
};

export function FileStationClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const items = useMemo(() => getFileStationNav(workspaceId), [workspaceId]);
  const [activeId, setActiveId] = useState(() => getFileStationNav(workspaceId)[0]?.id ?? "all");
  const [iframeUrl, setIframeUrl] = useState(
    () => getFileStationNav(workspaceId)[0]?.url ?? "",
  );
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  const select = useCallback(
    (id: string) => {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      setActiveId(id);
      setLoading(true);
      setIframeUrl(it.url);
      setKey((k) => k + 1);
    },
    [items],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 h-12 px-4 flex items-center gap-3 border-b border-stroke-1 bg-bg-chrome"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <FolderOpen size={16} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-text-primary leading-tight">
            Datei-Station
          </h1>
          <p className="text-[11px] text-text-tertiary truncate">
            {workspaceName} · Nextcloud
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Neu laden"
        >
          <RefreshCw size={15} />
        </button>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Diese Ansicht in neuem Tab"
        >
          <ExternalLink size={15} />
        </a>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          className="w-[220px] shrink-0 border-r border-stroke-1 bg-bg-elevated flex flex-col py-2"
          aria-label="Datei-Bereiche"
        >
          {items.map((it) => {
            const Icon = ICONS[it.id] ?? FolderOpen;
            const isOn = it.id === activeId;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => select(it.id)}
                className={`mx-1.5 mb-0.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                  isOn
                    ? "bg-bg-overlay text-text-primary border border-stroke-2"
                    : "text-text-secondary hover:bg-bg-overlay border border-transparent"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={15} className="shrink-0 opacity-80" style={{ color: isOn ? accent : undefined }} />
                  <span className="text-[13px] font-medium leading-snug">{it.label}</span>
                </span>
                <span className="block text-[10px] text-text-tertiary mt-0.5 pl-[23px] leading-tight">
                  {it.description}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-white">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/80">
              <Loader2 className="w-7 h-7 spin" style={{ color: accent }} />
            </div>
          )}
          <iframe
            key={key}
            title="Nextcloud"
            src={iframeUrl}
            className="w-full h-full min-h-[400px] border-0"
            allow="clipboard-read; clipboard-write; fullscreen; display-capture"
            allowFullScreen
            onLoad={() => setLoading(false)}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
}
