"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  StickyNote,
  Plus,
  Upload,
  RefreshCw,
  Loader2,
  Folder,
  Clock,
  Search,
  ExternalLink,
} from "lucide-react";
import type { CloudEntry, CloudList } from "@/lib/cloud/types";
import type { WorkspaceId } from "@/lib/workspaces";
import { CollaboraPanel } from "./CollaboraPanel";

const QUICK_ACTIONS: {
  kind: "doc" | "sheet" | "slides" | "text";
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
}[] = [
  {
    kind: "doc",
    label: "Neues Dokument",
    description: "Word-kompatibel (.docx)",
    icon: FileText,
    color: "#1d4ed8",
  },
  {
    kind: "sheet",
    label: "Neue Tabelle",
    description: "Excel-kompatibel (.xlsx)",
    icon: FileSpreadsheet,
    color: "#16a34a",
  },
  {
    kind: "slides",
    label: "Neue Präsentation",
    description: "PowerPoint-kompatibel (.pptx)",
    icon: Presentation,
    color: "#dc2626",
  },
  {
    kind: "text",
    label: "Neue Notiz",
    description: "Markdown-Datei (.md)",
    icon: StickyNote,
    color: "#7c3aed",
  },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function isOfficeFile(name: string): boolean {
  return /\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|md|rtf|csv)$/i.test(name);
}

function iconFor(name: string): { Icon: typeof FileText; color: string } {
  if (/\.(docx?|odt|rtf)$/i.test(name)) return { Icon: FileText, color: "#1d4ed8" };
  if (/\.(xlsx?|ods|csv)$/i.test(name)) return { Icon: FileSpreadsheet, color: "#16a34a" };
  if (/\.(pptx?|odp)$/i.test(name)) return { Icon: Presentation, color: "#dc2626" };
  if (/\.(txt|md)$/i.test(name)) return { Icon: StickyNote, color: "#7c3aed" };
  return { Icon: FileText, color: "#64748b" };
}

const ROOT_DIR = "/Documents";

export function OfficeHubClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const [recents, setRecents] = useState<CloudEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CloudEntry | null>(null);
  const [filter, setFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(ROOT_DIR)}`,
        { cache: "no-store" },
      );
      if (r.status === 502 || r.status === 404) {
        // Documents-Ordner gibt's evtl. noch nicht — anlegen und nochmal.
        await fetch("/api/cloud/mkdir", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws: workspaceId, path: ROOT_DIR }),
        });
        const r2 = await fetch(
          `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(ROOT_DIR)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as CloudList & { error?: string };
        if (!r2.ok) throw new Error(j2.error ?? `HTTP ${r2.status}`);
        setRecents(
          j2.entries
            .filter((e) => e.type === "file" && isOfficeFile(e.name))
            .sort((a, b) => b.mtime.localeCompare(a.mtime))
            .slice(0, 24),
        );
      } else {
        const j = (await r.json()) as CloudList & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setRecents(
          j.entries
            .filter((e) => e.type === "file" && isOfficeFile(e.name))
            .sort((a, b) => b.mtime.localeCompare(a.mtime))
            .slice(0, 24),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRecents([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!filter.trim()) return recents;
    const q = filter.toLowerCase();
    return recents.filter((e) => e.name.toLowerCase().includes(q));
  }, [recents, filter]);

  const onCreate = useCallback(
    async (kind: "doc" | "sheet" | "slides" | "text") => {
      const def = { doc: "Neues Dokument", sheet: "Neue Tabelle", slides: "Neue Präsentation", text: "Neue Notiz" }[kind];
      const name = prompt("Name der neuen Datei:", def)?.trim();
      if (!name) return;
      setBusy(true);
      try {
        const r = await fetch("/api/cloud/create-doc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws: workspaceId, dir: ROOT_DIR, name, kind }),
        });
        const j = (await r.json()) as { error?: string; path?: string };
        if (!r.ok) {
          alert("Anlegen fehlgeschlagen: " + (j.error ?? r.statusText));
          return;
        }
        await load();
        // Direkt im Editor öffnen, sobald PROPFIND die fileid kennt.
        // Kurzer Re-fetch für die fileid:
        const r2 = await fetch(
          `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(ROOT_DIR)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as CloudList;
        const created = j2.entries.find((e) => e.path === j.path);
        if (created && created.fileId != null) setEditor(created);
      } finally {
        setBusy(false);
      }
    },
    [load, workspaceId],
  );

  const onUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fd = new FormData();
      for (const f of Array.from(files)) {
        if (f.size > 0) fd.append("files", f, f.name);
      }
      setBusy(true);
      try {
        const r = await fetch(
          `/api/cloud/upload?ws=${workspaceId}&dir=${encodeURIComponent(ROOT_DIR)}`,
          { method: "POST", body: fd },
        );
        const j = (await r.json()) as { errors?: { name: string; error: string }[] };
        if (j.errors && j.errors.length > 0) {
          alert("Fehler beim Upload:\n" + j.errors.map((e) => `${e.name}: ${e.error}`).join("\n"));
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load, workspaceId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-5 py-3 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div
          className="w-9 h-9 rounded flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <FileText size={18} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">Office</h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · Dokumente, Tabellen, Präsentationen — bearbeitet im integrierten Editor
          </p>
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="In Dokumenten suchen…"
            className="bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2.5 py-1.5 w-[220px] text-[12px] outline-none focus:border-stroke-2"
          />
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-stroke-2 text-[12px] disabled:opacity-50"
          title="Datei hochladen"
        >
          <Upload size={13} /> Hochladen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void onUpload(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Neu laden"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── Quick Actions ───────────────────────────────────── */}
        <section className="px-5 pt-5">
          <h2 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-semibold mb-2">
            Neu erstellen
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {QUICK_ACTIONS.map((qa) => {
              const Icon = qa.icon;
              return (
                <button
                  key={qa.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => onCreate(qa.kind)}
                  className="group text-left rounded-lg border border-stroke-1 bg-bg-elevated hover:border-stroke-2 hover:bg-bg-overlay px-3 py-3 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                      style={{ background: `${qa.color}1f` }}
                    >
                      <Icon size={17} style={{ color: qa.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-text-primary truncate">
                        {qa.label}
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        {qa.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Recents ─────────────────────────────────────────── */}
        <section className="px-5 pt-5 pb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-semibold flex items-center gap-1">
              <Clock size={11} />
              Zuletzt geändert in <span className="font-mono normal-case">{ROOT_DIR}</span>
            </h2>
            {busy && <Loader2 size={13} className="spin text-text-tertiary" />}
          </div>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-3 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {!error && loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 spin" style={{ color: accent }} />
            </div>
          )}

          {!error && !loading && visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-stroke-1 bg-bg-elevated/40 p-8 text-center text-text-tertiary text-[12px]">
              <Folder size={22} className="mx-auto mb-2 text-text-quaternary" />
              Noch keine Office-Dateien hier. Lege oben eine an oder lade etwas hoch.
            </div>
          )}

          {!error && !loading && visible.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {visible.map((e) => {
                const { Icon, color } = iconFor(e.name);
                const editable = isOfficeFile(e.name) && e.fileId != null;
                return (
                  <button
                    key={e.path}
                    type="button"
                    onClick={() => editable && setEditor(e)}
                    className="group text-left rounded-lg border border-stroke-1 bg-bg-elevated hover:border-stroke-2 hover:bg-bg-overlay px-3 py-3 transition-colors"
                    title={e.path}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                        style={{ background: `${color}1f` }}
                      >
                        <Icon size={17} style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-text-primary truncate">
                          {e.name}
                        </p>
                        <p className="text-[10.5px] text-text-tertiary mt-0.5 flex items-center gap-1.5">
                          <span>{relativeTime(e.mtime)}</span>
                          <span className="text-text-quaternary">·</span>
                          <span className="tabular-nums">{formatBytes(e.size)}</span>
                        </p>
                      </div>
                      <ExternalLink
                        size={11}
                        className="text-text-quaternary opacity-0 group-hover:opacity-100 mt-0.5"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editor && editor.fileId != null && (
        <CollaboraPanel
          workspaceId={workspaceId}
          fileId={editor.fileId}
          name={editor.name}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
