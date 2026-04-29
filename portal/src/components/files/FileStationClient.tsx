"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Folder,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  File as FileIcon,
  Presentation,
  StickyNote,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  RefreshCw,
  Loader2,
  Search,
  Home,
  X,
  ChevronDown,
  ExternalLink,
  Plus,
  PanelRight,
} from "lucide-react";
import type { CloudEntry, CloudList } from "@/lib/cloud/types";
import {
  collaboraSafeOpenUrl,
  opensInCollabora,
  opensInPortalOfficeEditor,
  primaryFileOpenLabel,
} from "@/lib/office/open-mode";
import type { WorkspaceId } from "@/lib/workspaces";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  if (diff < 86400 * 7) return `vor ${Math.floor(diff / 86400)} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function iconForFile(name: string, isDir: boolean): typeof FileIcon {
  if (isDir) return Folder;
  if (/\.(docx?|odt|rtf|txt|md)$/i.test(name)) return FileText;
  if (/\.(xlsx?|ods|csv|tsv)$/i.test(name)) return FileSpreadsheet;
  if (/\.(png|jpe?g|gif|webp|svg|bmp|heic)$/i.test(name)) return FileImage;
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(name)) return FileVideo;
  if (/\.(mp3|wav|m4a|flac|ogg)$/i.test(name)) return FileAudio;
  if (/\.(zip|tar|gz|7z|rar)$/i.test(name)) return FileArchive;
  return FileIcon;
}

function iconColor(entry: CloudEntry, accent: string): string {
  if (entry.type === "folder") return accent;
  if (/\.(docx?|odt|rtf|txt|md)$/i.test(entry.name)) return "#1d4ed8";
  if (/\.(xlsx?|ods|csv)$/i.test(entry.name)) return "#16a34a";
  if (/\.(pptx?|odp)$/i.test(entry.name)) return "#dc2626";
  if (/\.(pdf)$/i.test(entry.name)) return "#b91c1c";
  return "#64748b";
}

function joinPath(dir: string, name: string): string {
  return (dir.endsWith("/") ? dir : dir + "/") + name;
}

export function FileStationClient({
  workspaceId,
  workspaceName,
  accent,
  /** Server may pass `/files?q=…` to pre-fill cloud filename search */
  initialGlobalSearchQuery,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  initialGlobalSearchQuery?: string | null;
}) {
  const [cwd, setCwd] = useState("/");
  const [data, setData] = useState<CloudList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const q0 = initialGlobalSearchQuery?.trim() ?? "";
  const [filter, setFilter] = useState(q0.length >= 2 ? q0 : "");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(() => q0.length >= 2);
  const [searchHits, setSearchHits] = useState<CloudEntry[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showNewMenu) return;
    const close = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [showNewMenu]);
  const [detailOpen, setDetailOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("files:detail-open") !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("files:detail-open", detailOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [detailOpen]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(path)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as CloudList & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData(j);
        setCwd(j.cwd);
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void load("/");
  }, [load]);

  const visibleEntries = useMemo(() => {
    if (globalSearch && searchHits) return searchHits;
    if (!data) return [];
    if (!filter.trim()) return data.entries;
    const q = filter.toLowerCase();
    return data.entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [data, filter, globalSearch, searchHits]);

  // Workspace-wide filename search (NC SEARCH method).  We debounce
  // to 350 ms — typical Nextcloud SEARCH responses come back in
  // 80-300 ms over Tailscale, so much shorter just spams the network
  // while the user is mid-type.
  useEffect(() => {
    if (!globalSearch) {
      setSearchHits(null);
      setSearchError(null);
      return;
    }
    const q = filter.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchError(null);
      setSearchBusy(false);
      return;
    }
    let cancelled = false;
    setSearchBusy(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/cloud/search?ws=${workspaceId}&q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as {
          hits?: CloudEntry[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setSearchError(j.error ?? `HTTP ${r.status}`);
          setSearchHits([]);
        } else {
          setSearchHits(j.hits ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setSearchError(e instanceof Error ? e.message : String(e));
          setSearchHits([]);
        }
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filter, globalSearch, workspaceId]);

  const breadcrumbs = useMemo(() => {
    const parts = cwd.split("/").filter(Boolean);
    let acc = "";
    return [
      { label: "Meine Ablage", path: "/" },
      ...parts.map((p) => {
        acc += "/" + p;
        return { label: p, path: acc };
      }),
    ];
  }, [cwd]);

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
          `/api/cloud/upload?ws=${workspaceId}&dir=${encodeURIComponent(cwd)}`,
          { method: "POST", body: fd },
        );
        const j = (await r.json()) as { uploaded?: unknown[]; errors?: { name: string; error: string }[] };
        if (j.errors && j.errors.length > 0) {
          alert("Fehler beim Upload:\n" + j.errors.map((e) => `${e.name}: ${e.error}`).join("\n"));
        }
        await load(cwd);
      } finally {
        setBusy(false);
      }
    },
    [cwd, load, workspaceId],
  );

  const onCreateDoc = useCallback(
    async (kind: "doc" | "sheet" | "slides" | "text") => {
      const def = {
        doc: "Neues Dokument",
        sheet: "Neue Tabelle",
        slides: "Neue Präsentation",
        text: "Neue Notiz",
      }[kind];
      const name = prompt("Name der neuen Datei:", def)?.trim();
      if (!name) return;
      setBusy(true);
      try {
        const r = await fetch("/api/cloud/create-doc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws: workspaceId, dir: cwd, name, kind }),
        });
        const j = (await r.json()) as { error?: string; path?: string };
        if (!r.ok) {
          alert("Anlegen fehlgeschlagen: " + (j.error ?? r.statusText));
          return;
        }
        await load(cwd);
        const base = j.path?.split("/").pop() ?? "";
        if (!j.path || !base) return;
        if (kind === "slides") {
          const r2 = await fetch(
            `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(cwd)}`,
            { cache: "no-store" },
          );
          const j2 = (await r2.json()) as CloudList;
          const created = j2.entries.find((e) => e.path === j.path);
          if (created?.fileId != null) {
            window.open(
              collaboraSafeOpenUrl(workspaceId, created.fileId),
              "_blank",
              "noopener,noreferrer",
            );
          } else {
            alert(
              "Präsentation angelegt; Datei-ID noch nicht verfügbar — bitte Ordner neu laden und die Datei öffnen.",
            );
          }
          return;
        }
        if (opensInPortalOfficeEditor(base)) {
          window.open(
            `/${workspaceId}/office?path=${encodeURIComponent(j.path)}`,
            "_blank",
            "noopener,noreferrer",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [cwd, load, workspaceId],
  );

  const onMkdir = useCallback(async () => {
    const name = prompt("Name des neuen Ordners:")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cloud/mkdir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ws: workspaceId, path: joinPath(cwd, name) }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        alert("Ordner anlegen fehlgeschlagen: " + (j.error ?? r.statusText));
      }
      await load(cwd);
    } finally {
      setBusy(false);
    }
  }, [cwd, load, workspaceId]);

  const onDelete = useCallback(
    async (entry: CloudEntry) => {
      if (!confirm(`„${entry.name}“ wirklich löschen?`)) return;
      setBusy(true);
      try {
        const r = await fetch("/api/cloud/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws: workspaceId, path: entry.path }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          alert("Löschen fehlgeschlagen: " + (j.error ?? r.statusText));
        }
        await load(cwd);
      } finally {
        setBusy(false);
      }
    },
    [cwd, load, workspaceId],
  );

  const onActivate = useCallback(
    (entry: CloudEntry) => {
      if (entry.type === "folder") {
        void load(entry.path);
        return;
      }
      if (opensInPortalOfficeEditor(entry.name)) {
        window.open(
          `/${workspaceId}/office?path=${encodeURIComponent(entry.path)}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (opensInCollabora(entry.name, entry.fileId)) {
        window.open(
          collaboraSafeOpenUrl(workspaceId, entry.fileId!),
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      window.open(
        `/api/cloud/download?ws=${workspaceId}&path=${encodeURIComponent(entry.path)}&inline=1`,
        "_blank",
      );
    },
    [load, workspaceId],
  );

  const selectedEntry =
    selected != null ? data?.entries.find((e) => e.path === selected) ?? null : null;

  return (
    <div className="flex h-full min-h-0 bg-bg-base text-text-primary text-[13px]">
      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-stroke-1">
        <header
          className="shrink-0 px-4 py-2.5 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
          style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
        >
          <div
            className="w-8 h-8 rounded flex items-center justify-center shrink-0"
            style={{ background: `${accent}18` }}
          >
            <Folder size={16} style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold leading-tight">Datei-Station</h1>
            <p className="text-[10.5px] text-text-tertiary truncate">
              {workspaceName} · in der Cloud gespeichert
            </p>
          </div>

          <div className="flex items-center gap-1">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
              />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={
                  globalSearch
                    ? "Workspace-weit suchen…"
                    : "In Ordner suchen…"
                }
                className="bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2.5 py-1.5 w-[220px] text-[12px] outline-none focus:border-stroke-2"
              />
              {searchBusy && globalSearch && (
                <Loader2
                  size={11}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary animate-spin"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setGlobalSearch((v) => !v);
                if (!globalSearch && filter.trim().length === 0) {
                  // Hint via empty-state when toggle flips on.
                  setSearchHits([]);
                }
              }}
              title={
                globalSearch
                  ? "Wieder nur in diesem Ordner suchen"
                  : "Workspace-weit suchen (alle Ordner)"
              }
              className={`px-2 py-1.5 rounded-md text-[11px] border ${
                globalSearch
                  ? "bg-info/15 border-info/40 text-info"
                  : "border-stroke-1 text-text-tertiary hover:bg-bg-overlay"
              }`}
            >
              alle Ordner
            </button>
          </div>

          <div ref={newMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowNewMenu((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white text-[12px] disabled:opacity-50"
              style={{ background: accent }}
              title="Neue Datei oder Ordner anlegen"
            >
              <Plus size={13} /> Neu
              <ChevronDown size={11} className="opacity-80" />
            </button>
            {showNewMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 w-60 rounded-md border border-stroke-1 bg-bg-elevated shadow-xl py-1 text-[12.5px]">
                <NewMenuItem
                  icon={<FileText size={14} style={{ color: "#1d4ed8" }} />}
                  label="Dokument (.docx)"
                  hint="Word-kompatibel"
                  onClick={() => {
                    setShowNewMenu(false);
                    void onCreateDoc("doc");
                  }}
                />
                <NewMenuItem
                  icon={<FileSpreadsheet size={14} style={{ color: "#16a34a" }} />}
                  label="Tabelle (.xlsx)"
                  hint="Excel-kompatibel"
                  onClick={() => {
                    setShowNewMenu(false);
                    void onCreateDoc("sheet");
                  }}
                />
                <NewMenuItem
                  icon={<Presentation size={14} style={{ color: "#dc2626" }} />}
                  label="Präsentation (.pptx)"
                  hint="PowerPoint-kompatibel"
                  onClick={() => {
                    setShowNewMenu(false);
                    void onCreateDoc("slides");
                  }}
                />
                <NewMenuItem
                  icon={<StickyNote size={14} style={{ color: "#7c3aed" }} />}
                  label="Notiz (.md)"
                  hint="Markdown"
                  onClick={() => {
                    setShowNewMenu(false);
                    void onCreateDoc("text");
                  }}
                />
                <div className="my-1 border-t border-stroke-1" />
                <NewMenuItem
                  icon={<FolderPlus size={14} className="text-text-tertiary" />}
                  label="Ordner"
                  hint="im aktuellen Verzeichnis"
                  onClick={() => {
                    setShowNewMenu(false);
                    void onMkdir();
                  }}
                />
                <NewMenuItem
                  icon={<Upload size={14} className="text-text-tertiary" />}
                  label="Datei hochladen"
                  hint="von diesem Gerät"
                  onClick={() => {
                    setShowNewMenu(false);
                    fileInputRef.current?.click();
                  }}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-50"
            style={{ background: accent }}
            title="Dateien hochladen"
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
            onClick={() => void load(cwd)}
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Neu laden"
          >
            <RefreshCw size={14} />
          </button>

          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className={`p-1.5 rounded-md hidden xl:inline-flex ${
              detailOpen
                ? "bg-bg-overlay text-text-primary"
                : "hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            }`}
            title={detailOpen ? "Detailbereich ausblenden" : "Detailbereich einblenden"}
            aria-pressed={detailOpen}
          >
            <PanelRight size={14} />
          </button>
        </header>

        <div className="shrink-0 px-4 py-1.5 border-b border-stroke-1 bg-bg-elevated flex items-center gap-1 overflow-x-auto whitespace-nowrap text-[11.5px]">
          {breadcrumbs.map((bc, i) => (
            <span key={bc.path} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void load(bc.path)}
                className={`px-1.5 py-0.5 rounded hover:bg-bg-overlay ${
                  i === breadcrumbs.length - 1
                    ? "text-text-primary font-medium"
                    : "text-text-tertiary"
                }`}
              >
                {i === 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Home size={11} />
                    {bc.label}
                  </span>
                ) : (
                  bc.label
                )}
              </button>
              {i < breadcrumbs.length - 1 && (
                <ChevronRight size={11} className="text-text-quaternary" />
              )}
            </span>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/70">
              <Loader2 className="w-6 h-6 spin" style={{ color: accent }} />
            </div>
          )}
          {error && !loading && (
            <div className="p-6 max-w-xl">
              <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-3 whitespace-pre-wrap">
                {error}
              </div>
            </div>
          )}
          {!error && (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-bg-chrome z-[1] text-[10.5px] uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="text-left font-medium px-4 py-2 w-[55%]">Name</th>
                  <th className="text-left font-medium px-2 py-2">Geändert</th>
                  <th className="text-right font-medium px-2 py-2">Größe</th>
                  <th className="px-2 py-2 w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center text-text-tertiary px-4 py-12 text-[12px]"
                    >
                      {globalSearch
                        ? searchError
                          ? `Suche fehlgeschlagen: ${searchError}`
                          : filter.trim().length < 2
                            ? "Tippe mindestens 2 Zeichen für die Workspace-weite Suche."
                            : searchBusy
                              ? "Suche läuft…"
                              : `Keine Treffer für „${filter}".`
                        : "Dieser Ordner ist leer."}
                    </td>
                  </tr>
                )}
                {visibleEntries.map((e) => {
                  const Icon = iconForFile(e.name, e.type === "folder");
                  const isSel = e.path === selected;
                  const parentPath = e.path
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                    .replace(/^$/, "/");
                  return (
                    <tr
                      key={e.path}
                      onClick={() => setSelected(e.path)}
                      onDoubleClick={() => onActivate(e)}
                      className={`group cursor-pointer border-b border-stroke-1/60 ${
                        isSel ? "bg-bg-overlay" : "hover:bg-bg-elevated"
                      }`}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon size={16} style={{ color: iconColor(e, accent) }} />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onActivate(e);
                              }}
                              className="text-text-primary hover:underline truncate text-left block"
                            >
                              {e.name}
                            </button>
                            {globalSearch && parentPath && parentPath !== "/" && (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setGlobalSearch(false);
                                  setFilter("");
                                  void load(parentPath);
                                  setSelected(e.path);
                                }}
                                className="text-[10.5px] text-text-tertiary hover:text-info truncate block text-left"
                                title={`Im Ordner „${parentPath}" öffnen`}
                              >
                                {parentPath}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-text-tertiary text-[11.5px]">
                        {relativeTime(e.mtime)}
                      </td>
                      <td className="px-2 py-2 text-right text-text-tertiary tabular-nums text-[11.5px]">
                        {e.type === "folder" ? "—" : formatBytes(e.size)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="opacity-[0.52] group-hover:opacity-100 flex items-center gap-0.5 justify-end transition-opacity">
                          {e.type === "file" && (
                            <a
                              href={`/api/cloud/download?ws=${workspaceId}&path=${encodeURIComponent(e.path)}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="p-1 rounded hover:bg-bg-chrome text-text-tertiary hover:text-text-primary"
                              title="Herunterladen"
                            >
                              <Download size={12} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void onDelete(e);
                            }}
                            className="p-1 rounded hover:bg-bg-chrome text-text-tertiary hover:text-red-500"
                            title="Löschen"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail rail ─────────────────────────────────────────── */}
      {detailOpen && (
        <aside className="hidden xl:flex w-[280px] shrink-0 bg-bg-chrome flex-col">
          <DetailRail
            entry={selectedEntry}
            accent={accent}
            workspaceId={workspaceId}
            onOpen={onActivate}
            onDelete={onDelete}
          />
        </aside>
      )}

    </div>
  );
}

function DetailRail({
  entry,
  accent,
  workspaceId,
  onOpen,
  onDelete,
}: {
  entry: CloudEntry | null;
  accent: string;
  workspaceId: WorkspaceId;
  onOpen: (e: CloudEntry) => void;
  onDelete: (e: CloudEntry) => void;
}) {
  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6 text-text-quaternary text-[12px]">
        Wähle eine Datei oder einen Ordner, um Details zu sehen.
      </div>
    );
  }
  const Icon = iconForFile(entry.name, entry.type === "folder");
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="px-4 py-3 border-b border-stroke-1">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded flex items-center justify-center shrink-0"
            style={{ background: `${accent}18` }}
          >
            <Icon size={20} style={{ color: iconColor(entry, accent) }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[13px] text-text-primary leading-tight break-all">
              {entry.name}
            </p>
            <p className="text-[10.5px] text-text-tertiary mt-0.5">
              {entry.type === "folder" ? "Ordner" : entry.contentType ?? "Datei"}
            </p>
          </div>
        </div>
      </header>
      <dl className="px-4 py-3 grid grid-cols-2 gap-y-2 text-[11.5px] border-b border-stroke-1">
        <dt className="text-text-tertiary">Größe</dt>
        <dd className="text-text-secondary text-right tabular-nums">
          {entry.type === "folder" ? "—" : formatBytes(entry.size)}
        </dd>
        <dt className="text-text-tertiary">Geändert</dt>
        <dd className="text-text-secondary text-right">{relativeTime(entry.mtime)}</dd>
        <dt className="text-text-tertiary">Pfad</dt>
        <dd className="text-text-secondary text-right break-all font-mono text-[10px]">
          {entry.path}
        </dd>
      </dl>
      <div className="px-4 py-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onOpen(entry)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md text-white text-[12px] font-medium px-3 py-2"
          style={{ background: accent }}
        >
          <ExternalLink size={13} />
          {primaryFileOpenLabel(
            entry.name,
            entry.fileId,
            entry.type === "folder",
          )}
        </button>
        {entry.type === "file" && (
          <a
            href={`/api/cloud/download?ws=${workspaceId}&path=${encodeURIComponent(entry.path)}`}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-stroke-2 text-[12px] px-3 py-2"
          >
            <Download size={13} />
            Herunterladen
          </a>
        )}
        <button
          type="button"
          onClick={() => onDelete(entry)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-red-500/40 hover:text-red-500 text-[12px] px-3 py-2"
        >
          <Trash2 size={13} />
          Löschen
        </button>
      </div>
    </div>
  );
}

function NewMenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-bg-overlay flex items-center gap-2.5"
    >
      <span className="w-6 h-6 rounded flex items-center justify-center bg-bg-base">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text-primary truncate">{label}</span>
        {hint && (
          <span className="block text-[10.5px] text-text-tertiary truncate">{hint}</span>
        )}
      </span>
    </button>
  );
}
