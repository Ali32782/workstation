"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  PenLine,
  X,
  Loader2,
  Eye,
  Download,
  FolderOpen,
} from "lucide-react";
import {
  CRM_MERGE_SCHEMA_VERSION,
  CRM_MERGE_TOKENS,
} from "@/lib/office/merge-tokens";
import {
  PROPOSAL_PRESETS,
  PROPOSAL_PRESETS_VERSION,
} from "@/lib/office/proposal-presets";
import type { WorkspaceId } from "@/lib/workspaces";
import type { CloudEntry, CloudList } from "@/lib/cloud/types";
import { useLocale } from "@/components/LocaleProvider";

type Company = {
  id: string;
  name: string;
  city?: string | null;
  domain?: string | null;
};

const DOCS = "/Documents";

function isTemplateFile(name: string): boolean {
  return /\.(docx|html|htm)$/i.test(name);
}

export function ProposalGeneratorDialog({
  workspaceId,
  accent,
  onClose,
}: {
  workspaceId: WorkspaceId;
  accent: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [templateMode, setTemplateMode] = useState<"preset" | "cloud">(
    "preset",
  );
  const [presetId, setPresetId] = useState(PROPOSAL_PRESETS[0]!.id);
  const presetHtml = useMemo(() => {
    const p = PROPOSAL_PRESETS.find((x) => x.id === presetId);
    return p?.html ?? "";
  }, [presetId]);

  const [cloudEntries, setCloudEntries] = useState<CloudEntry[] | null>(null);
  const [cloudPath, setCloudPath] = useState<string | null>(null);
  const [cloudName, setCloudName] = useState<string | null>(null);
  const [cloudHtml, setCloudHtml] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudListErr, setCloudListErr] = useState<string | null>(null);
  const [mammothNotes, setMammothNotes] = useState<string[] | null>(null);

  const effectiveTemplateHtml =
    templateMode === "cloud" && cloudHtml != null && cloudHtml.length > 0
      ? cloudHtml
      : presetHtml;

  const templateReady =
    templateMode === "preset" ||
    (templateMode === "cloud" && cloudHtml != null && cloudHtml.length > 0);

  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTokens, setPreviewTokens] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/crm/companies?ws=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as { items?: Company[]; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          setCompanies([]);
          return;
        }
        setCompanies(j.items ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (templateMode !== "cloud") return;
    let cancelled = false;
    setCloudListErr(null);
    void (async () => {
      try {
        const r = await fetch(
          `/api/cloud/list?ws=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(DOCS)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as CloudList & { error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setCloudListErr(j.error ?? `HTTP ${r.status}`);
          setCloudEntries([]);
          return;
        }
        setCloudEntries(
          (j.entries ?? []).filter(
            (e) => e.type === "file" && isTemplateFile(e.name),
          ),
        );
      } catch (e) {
        if (!cancelled)
          setCloudListErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateMode, workspaceId]);

  const loadCloudTemplate = useCallback(
    async (path: string, displayName: string) => {
      setCloudLoading(true);
      setMammothNotes(null);
      setError(null);
      setPreviewHtml(null);
      try {
        const r = await fetch(
          `/api/office/cloud-template?ws=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as {
          html?: string;
          error?: string;
          mammothMessages?: string[];
        };
        if (!r.ok) {
          setCloudHtml(null);
          setCloudPath(null);
          setCloudName(null);
          setError(j.error ?? `HTTP ${r.status}`);
          return;
        }
        setCloudHtml(j.html ?? "");
        setCloudPath(path);
        setCloudName(displayName);
        setMammothNotes(
          j.mammothMessages && j.mammothMessages.length > 0
            ? j.mammothMessages
            : null,
        );
      } catch (e) {
        setCloudHtml(null);
        setCloudPath(null);
        setCloudName(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCloudLoading(false);
      }
    },
    [workspaceId],
  );

  const filtered = useMemo(() => {
    if (!companies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.domain ?? "").toLowerCase().includes(q),
    );
  }, [companies, search]);

  const runPreview = useCallback(async () => {
    if (!companyId) {
      setError(t("office.proposal.error.pickCompany"));
      return;
    }
    if (!templateReady) {
      setError(
        templateMode === "cloud"
          ? t("office.proposal.error.pickCloudTemplate")
          : t("office.proposal.error.noPresetTemplate"),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/office/word-merge?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateHtml: effectiveTemplateHtml,
            scope: "ids",
            companyIds: [companyId],
            preview: true,
            limit: 1,
          }),
        },
      );
      const j = (await r.json()) as {
        previews?: Array<{ html: string }>;
        tokens?: string[];
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      const html = j.previews?.[0]?.html ?? "";
      setPreviewHtml(html);
      setPreviewTokens(j.tokens ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    companyId,
    effectiveTemplateHtml,
    templateMode,
    templateReady,
    workspaceId,
    t,
  ]);

  const downloadDocx = useCallback(async () => {
    if (!companyId) {
      setError(t("office.proposal.error.pickCompany"));
      return;
    }
    if (!templateReady) {
      setError(
        templateMode === "cloud"
          ? t("office.proposal.error.pickCloudTemplate")
          : t("office.proposal.error.noPresetTemplate"),
      );
      return;
    }
    const company = companies?.find((c) => c.id === companyId);
    setBusy(true);
    setError(null);
    try {
      const base =
        `Angebot-${(company?.name ?? "Kunde").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 60)}` ||
        "Angebot";
      const r = await fetch(
        `/api/office/word-merge?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateHtml: effectiveTemplateHtml,
            scope: "ids",
            companyIds: [companyId],
            output: "docx",
            downloadBaseName: base,
            limit: 1,
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      const buf = await r.arrayBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = r.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m?.[1] ?? `${base}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    companies,
    companyId,
    effectiveTemplateHtml,
    templateMode,
    templateReady,
    workspaceId,
    t,
  ]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-lg border border-stroke-1 bg-bg-chrome shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-2.5 border-b border-stroke-1 flex items-center gap-2">
          <PenLine size={14} style={{ color: accent }} />
          <div className="flex-1 min-w-0">
            <h3 className="text-[12.5px] font-semibold">{t("office.proposal.title")}</h3>
            <p className="text-[10px] text-text-tertiary">
              {t("office.proposal.mergeVersionLine")
                .replace("{merge}", String(CRM_MERGE_SCHEMA_VERSION))
                .replace("{preset}", String(PROPOSAL_PRESETS_VERSION))
                .replace(
                  "{suffix}",
                  templateMode === "cloud" && cloudName ? ` · ${cloudName}` : "",
                )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary"
          >
            <X size={13} />
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[240px,1fr] divide-x divide-stroke-1">
          <aside className="p-3 overflow-y-auto flex flex-col gap-3">
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1.5">
                {t("office.proposal.sectionTemplate")}
              </h4>
              <div className="flex flex-col gap-1.5 mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-[11.5px]">
                  <input
                    type="radio"
                    name="tplmode"
                    checked={templateMode === "preset"}
                    onChange={() => {
                      setTemplateMode("preset");
                      setPreviewHtml(null);
                      setMammothNotes(null);
                    }}
                    className="accent-[#5b5fc7]"
                  />
                  {t("office.proposal.templatePresets")}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[11.5px]">
                  <input
                    type="radio"
                    name="tplmode"
                    checked={templateMode === "cloud"}
                    onChange={() => {
                      setTemplateMode("cloud");
                      setPreviewHtml(null);
                      setCloudHtml(null);
                      setCloudPath(null);
                      setCloudName(null);
                      setMammothNotes(null);
                    }}
                    className="accent-[#5b5fc7]"
                  />
                  {t("office.proposal.templateCloudDocs")}
                </label>
              </div>

              {templateMode === "preset" ? (
                <ul className="space-y-1">
                  {PROPOSAL_PRESETS.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-start gap-2 cursor-pointer text-[11.5px]">
                        <input
                          type="radio"
                          name="preset"
                          checked={presetId === p.id}
                          onChange={() => {
                            setPresetId(p.id);
                            setPreviewHtml(null);
                          }}
                          className="mt-0.5 accent-[#5b5fc7]"
                        />
                        <span>{p.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-1">
                  <p className="text-[10px] text-text-tertiary leading-snug flex items-start gap-1">
                    <FolderOpen size={12} className="shrink-0 mt-0.5" />
                    <span>
                      {t("office.proposal.cloudFormatsHint").replace("{docs}", DOCS)}
                    </span>
                  </p>
                  <div className="max-h-[40vh] overflow-y-auto border border-stroke-1 rounded-md text-[11.5px]">
                    {cloudLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-text-tertiary">
                        <Loader2 size={14} className="animate-spin" />
                        {t("office.proposal.loadingTemplateFile")}
                      </div>
                    ) : cloudListErr ? (
                      <p className="p-2 text-red-400 text-[11px]">{cloudListErr}</p>
                    ) : cloudEntries === null ? (
                      <div className="p-3 text-text-tertiary">{t("office.proposal.loadingDocList")}</div>
                    ) : cloudEntries.length === 0 ? (
                      <p className="p-2 text-text-tertiary text-[11px]">
                        {t("office.proposal.noTemplatesInFolder").replace("{docs}", DOCS)}
                      </p>
                    ) : (
                      <ul>
                        {cloudEntries.map((e) => {
                          const active = cloudPath === e.path;
                          return (
                            <li key={e.path}>
                              <button
                                type="button"
                                onClick={() =>
                                  void loadCloudTemplate(e.path, e.name)
                                }
                                className={`w-full text-left px-2 py-1.5 border-b border-stroke-1/50 truncate ${
                                  active ? "bg-info/15" : "hover:bg-bg-overlay"
                                }`}
                              >
                                {e.name}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {cloudPath && (
                    <p className="text-[10px] text-text-tertiary truncate">
                      {t("office.proposal.activeTemplate")} {cloudPath}
                    </p>
                  )}
                  {mammothNotes && (
                    <p className="text-[10px] text-amber-500/90 leading-snug">
                      {t("office.proposal.conversionNote")}{" "}
                      {mammothNotes.join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1">
                {t("office.proposal.sectionVariables")}
              </h4>
              <ul className="text-[10px] text-text-tertiary space-y-0.5 max-h-[22vh] overflow-y-auto">
                {CRM_MERGE_TOKENS.map((tok) => (
                  <li key={tok.token}>
                    <code className="text-info">{`{{${tok.token}}}`}</code> —{" "}
                    {tok.description}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="p-3 flex flex-col min-h-0">
            <div className="mb-2">
              <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1">
                {t("office.proposal.sectionCompany")}
              </h4>
              <input
                type="search"
                placeholder={`${t("common.search")}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-bg-base border border-stroke-1 rounded px-2 py-1.5 text-[12px] outline-none focus:border-stroke-2 mb-2"
              />
              <div className="max-h-[160px] overflow-y-auto border border-stroke-1 rounded-md">
                {companies === null ? (
                  <div className="flex items-center justify-center h-24 text-text-tertiary text-[12px]">
                    {t("office.proposal.loadingCompanies")}
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="p-3 text-[12px] text-text-tertiary">
                    {t("common.noResults")}
                  </p>
                ) : (
                  <ul className="text-[12px]">
                    {filtered.slice(0, 200).map((c) => {
                      const sel = companyId === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCompanyId(c.id);
                              setPreviewHtml(null);
                            }}
                            className={`w-full text-left px-2 py-1.5 border-b border-stroke-1/50 ${
                              sel ? "bg-info/15" : "hover:bg-bg-overlay"
                            }`}
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-text-tertiary text-[11px] ml-1">
                              {c.city ?? ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                disabled={busy || !companyId || !templateReady}
                onClick={() => void runPreview()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-stroke-1 hover:bg-bg-overlay disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Eye size={14} />
                )}
                {busy ? "…" : t("office.proposal.preview")}
              </button>
              <button
                type="button"
                disabled={busy || !companyId || !templateReady}
                onClick={() => void downloadDocx()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white disabled:opacity-50"
                style={{ background: accent }}
              >
                <Download size={14} />
                {t("office.proposal.downloadDocx")}
              </button>
            </div>

            {previewTokens && previewTokens.length > 0 && (
              <p className="text-[10px] text-text-tertiary mb-1">
                {t("office.proposal.tokensFound")} {previewTokens.join(", ")}
              </p>
            )}

            {previewHtml != null && (
              <div className="flex-1 min-h-[120px] overflow-y-auto border border-stroke-1 rounded-md bg-bg-base p-3 text-[12px] prose prose-invert max-w-none office-proposal-preview">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            )}

            <p className="text-[10px] text-text-tertiary mt-2 flex items-center gap-1">
              <FileText size={11} />
              {t("office.proposal.footerMergeZip")}
            </p>
          </main>
        </div>
      </div>

      <style jsx global>{`
        .office-proposal-preview h2 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 0.5em 0;
        }
        .office-proposal-preview p {
          margin: 0.35em 0;
        }
        .office-proposal-preview ul {
          padding-left: 1.2em;
          margin: 0.35em 0;
        }
      `}</style>
    </div>
  );
}
