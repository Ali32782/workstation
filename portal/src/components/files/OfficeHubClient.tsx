"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  PenLine,
} from "lucide-react";
import type { CloudEntry, CloudList } from "@/lib/cloud/types";
import { opensInPortalOfficeEditor } from "@/lib/office/open-mode";
import type { WorkspaceId } from "@/lib/workspaces";
import { CollaboraPanel } from "./CollaboraPanel";
import { ProposalGeneratorDialog } from "@/components/office/ProposalGeneratorDialog";
import { useLocale, useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";
import { cloudRelative } from "@/lib/i18n/cloud-relative";

const QUICK_ACTIONS: {
  kind: "doc" | "sheet" | "slides" | "text";
  labelKey: keyof Messages;
  descriptionKey: keyof Messages;
  icon: typeof FileText;
  color: string;
}[] = [
  {
    kind: "doc",
    labelKey: "files.newDocument",
    descriptionKey: "office.compat.word",
    icon: FileText,
    color: "#1d4ed8",
  },
  {
    kind: "sheet",
    labelKey: "files.newSpreadsheet",
    descriptionKey: "office.compat.excel",
    icon: FileSpreadsheet,
    color: "#16a34a",
  },
  {
    kind: "slides",
    labelKey: "files.newPresentation",
    descriptionKey: "office.compat.ppt",
    icon: Presentation,
    color: "#dc2626",
  },
  {
    kind: "text",
    labelKey: "files.newNote",
    descriptionKey: "office.compat.md",
    icon: StickyNote,
    color: "#7c3aed",
  },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function isOfficeFile(name: string): boolean {
  return /\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|md|rtf|csv|tsv)$/i.test(name);
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
  /** Deep-link from CRM Company Hub — offers Sign with same `externalId` prefix. */
  crmLinkCompanyId = null,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  crmLinkCompanyId?: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [recents, setRecents] = useState<CloudEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CloudEntry | null>(null);
  const [filter, setFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proposalOpen, setProposalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const pickRecents = (list: CloudList) =>
      list.entries
        .filter((e) => e.type === "file" && isOfficeFile(e.name))
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .slice(0, 24);
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
        setRecents(pickRecents(j2));
      } else {
        const j = (await r.json()) as CloudList & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setRecents(pickRecents(j));
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
      const def = {
        doc: t("files.newDocument"),
        sheet: t("files.newSpreadsheet"),
        slides: t("files.newPresentation"),
        text: t("files.newNote"),
      }[kind];
      const name = prompt(t("office.prompt.filename"), def)?.trim();
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
          alert(t("office.alert.create") + (j.error ?? r.statusText));
          return;
        }
        await load();
        // Word/Excel/Markdown: native portal editor (kein Nextcloud-Tab).
        if (kind !== "slides" && j.path) {
          router.push(
            `/${workspaceId}/office?path=${encodeURIComponent(j.path)}`,
          );
          return;
        }
        // Präsentationen: OpenOffice-Editor in Nextcloud (braucht fileId).
        const r2 = await fetch(
          `/api/cloud/list?ws=${workspaceId}&path=${encodeURIComponent(ROOT_DIR)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as CloudList;
        const created = j2.entries.find((e) => e.path === j.path);
        if (created && created.fileId != null) {
          setEditor(created);
        } else {
          alert(t("office.alert.presentationId"));
        }
      } finally {
        setBusy(false);
      }
    },
    [load, router, workspaceId, t],
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
          alert(
            t("office.alert.upload") +
              j.errors.map((e) => `${e.name}: ${e.error}`).join("\n"),
          );
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load, workspaceId, t],
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
          <h1 className="text-sm font-semibold leading-tight">{t("nav.office")}</h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {t("office.tagline").replace("{workspace}", workspaceName)}
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
            placeholder={t("office.search.placeholder")}
            className="bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2.5 py-1.5 w-[220px] text-[12px] outline-none focus:border-stroke-2"
          />
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-stroke-2 text-[12px] disabled:opacity-50"
          title={t("files.upload.tooltip")}
        >
          <Upload size={13} /> {t("office.upload")}
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
          title={t("office.reload")}
        >
          <RefreshCw size={14} />
        </button>
      </header>

      {crmLinkCompanyId?.trim() && (
        <div className="shrink-0 mx-5 mt-3 rounded-lg border border-stroke-1 bg-bg-elevated px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span className="inline-flex items-center gap-1.5 text-text-tertiary">
            <PenLine size={12} style={{ color: accent }} />
            {t("office.crmContext")}
          </span>
          <Link
            href={`/${workspaceId}/crm/company/${encodeURIComponent(crmLinkCompanyId.trim())}`}
            className="text-info hover:underline"
          >
            {t("office.link.companyHub")}
          </Link>
          <span className="text-text-quaternary">·</span>
          <Link
            href={`/${workspaceId}/sign?crmCompany=${encodeURIComponent(crmLinkCompanyId.trim())}`}
            className="text-info hover:underline"
          >
            {t("office.link.sign")}
          </Link>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── Quick Actions (prominent CTA) ───────────────────── */}
        <section className="px-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{ background: `${accent}22` }}
              >
                <Plus size={13} style={{ color: accent }} />
              </span>
              <h2 className="text-[13px] font-semibold text-text-primary">
                {t("office.section.new")}
              </h2>
            </div>
            <span className="text-[10.5px] text-text-tertiary">
              {t("office.hint.portalEditor")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map((qa) => {
              const Icon = qa.icon;
              return (
                <button
                  key={qa.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => onCreate(qa.kind)}
                  className="group text-left rounded-xl border-2 px-4 py-4 transition-all disabled:opacity-50 hover:shadow-md hover:-translate-y-0.5"
                  style={{
                    borderColor: `${qa.color}33`,
                    background: `linear-gradient(135deg, ${qa.color}0d 0%, transparent 60%)`,
                  }}
                  title={t("office.createTitle").replace("{label}", t(qa.labelKey))}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                      style={{ background: `${qa.color}26` }}
                    >
                      <Icon size={20} style={{ color: qa.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-primary truncate">
                        {t(qa.labelKey)}
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        {t(qa.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => setProposalOpen(true)}
            className="mt-4 w-full text-left rounded-xl border-2 border-dashed px-4 py-3 transition-all hover:shadow-md disabled:opacity-50"
            style={{
              borderColor: `${accent}44`,
              background: `linear-gradient(135deg, ${accent}08 0%, transparent 55%)`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${accent}22` }}
              >
                <PenLine size={20} style={{ color: accent }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary">
                  {t("office.proposal.title")}
                </p>
                <p className="text-[10.5px] text-text-tertiary">
                  {t("office.proposal.subtitle")}
                </p>
              </div>
            </div>
          </button>
        </section>

        {/* ── Recents ─────────────────────────────────────────── */}
        <section className="px-5 pt-5 pb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-semibold flex items-center gap-1 flex-wrap">
              <Clock size={11} />
              {(() => {
                const [before, after = ""] = t("office.recents").split("{dir}");
                return (
                  <>
                    {before}
                    <span className="font-mono normal-case">{ROOT_DIR}</span>
                    {after}
                  </>
                );
              })()}
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
              {t("office.empty")}
            </div>
          )}

          {!error && !loading && visible.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {visible.map((e) => {
                const { Icon, color } = iconFor(e.name);
                const native = opensInPortalOfficeEditor(e.name);
                const collabora =
                  isOfficeFile(e.name) && e.fileId != null && !native;
                return (
                  <button
                    key={e.path}
                    type="button"
                    onClick={() => {
                      if (native) {
                        router.push(
                          `/${workspaceId}/office?path=${encodeURIComponent(e.path)}`,
                        );
                        return;
                      }
                      if (collabora) setEditor(e);
                    }}
                    className="group text-left rounded-lg border border-stroke-1 bg-bg-elevated hover:border-stroke-2 hover:bg-bg-overlay px-3 py-3 transition-colors disabled:opacity-45"
                    disabled={!native && !collabora}
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
                          <span>{cloudRelative(e.mtime, locale, t)}</span>
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

      {proposalOpen && (
        <ProposalGeneratorDialog
          workspaceId={workspaceId}
          accent={accent}
          onClose={() => setProposalOpen(false)}
        />
      )}

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
