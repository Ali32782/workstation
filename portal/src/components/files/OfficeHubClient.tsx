"use client";

import { useCallback, useMemo, useState } from "react";
import {
  FileText,
  RefreshCw,
  ExternalLink,
  Loader2,
  Table2,
  Presentation,
  FolderOpen,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import { getCloudOrigin, getOfficeNav } from "@/lib/workspace-cloud";

const ICONS: Record<string, typeof FileText> = {
  docs: FileText,
  sheets: Table2,
  slides: Presentation,
  all: FolderOpen,
};

export function OfficeHubClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const items = useMemo(() => getOfficeNav(workspaceId), [workspaceId]);
  const [activeId, setActiveId] = useState(() => getOfficeNav(workspaceId)[0]?.id ?? "docs");
  const [iframeUrl, setIframeUrl] = useState(() => getOfficeNav(workspaceId)[0]?.url ?? "");
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  const origin = getCloudOrigin(workspaceId);

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
        className="shrink-0 border-b border-stroke-1 bg-bg-chrome px-4 py-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded flex items-center justify-center shrink-0"
            style={{ background: `${accent}18` }}
          >
            <FileText size={18} style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-text-primary">Office</h1>
            <p className="text-[11px] text-text-tertiary">
              {workspaceName} · Dokumente in Nextcloud (Collabora / OnlyOffice)
            </p>
            <p className="text-[10px] text-text-quaternary mt-1 max-w-2xl leading-relaxed">
              Zum Bearbeiten eine Datei öffnen — der Online-Editor startet in Nextcloud. Ordner
              <span className="font-mono"> Tabellen</span> / <span className="font-mono">Praesentationen</span> anlegen,
              falls noch nicht vorhanden (dann erscheint die Oberfläche trotzdem; Ordner in NC anlegen).
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
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
              title="Aktuelle Ansicht in neuem Tab"
            >
              <ExternalLink size={15} />
            </a>
          </div>
        </div>

        <div
          className="mt-3 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Office-Bereiche"
        >
          {items.map((it) => {
            const Icon = ICONS[it.id] ?? FileText;
            const isOn = it.id === activeId;
            return (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={isOn}
                onClick={() => select(it.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                  isOn
                    ? "text-white border-transparent"
                    : "border-stroke-1 bg-bg-elevated text-text-secondary hover:border-stroke-2 hover:text-text-primary"
                }`}
                style={
                  isOn
                    ? { background: accent, boxShadow: `0 0 0 1px ${accent}` }
                    : undefined
                }
              >
                <Icon size={14} className="opacity-90" />
                {it.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col relative bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/80">
            <Loader2 className="w-7 h-7 spin" style={{ color: accent }} />
          </div>
        )}
        <iframe
          key={key}
          title="Office in Nextcloud"
          src={iframeUrl}
          className="w-full h-full min-h-[400px] border-0 flex-1"
          allow="clipboard-read; clipboard-write; fullscreen; display-capture"
          allowFullScreen
          onLoad={() => setLoading(false)}
          referrerPolicy="no-referrer-when-downgrade"
        />
        <p className="shrink-0 text-[10px] text-text-quaternary px-3 py-1.5 border-t border-stroke-1 bg-bg-elevated">
          Vollständige Nextcloud-Oberfläche:{" "}
          <a
            className="text-text-tertiary hover:text-text-primary underline"
            href={`${origin}/apps/files/files`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {origin.replace(/^https:\/\//, "")}
          </a>
        </p>
      </div>
    </div>
  );
}
