"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PenLine,
  RefreshCw,
  Search,
  Upload,
  ExternalLink,
  Loader2,
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Trash2,
  CornerUpRight,
  FileSignature,
  Calendar,
  AlertCircle,
  AlertTriangle,
  FileType2,
  LayoutGrid,
  MessageSquare,
  X,
  Settings as SettingsIcon,
  Lock,
  Download,
} from "lucide-react";
import { FieldEditor } from "./FieldEditor";
import {
  ThreePaneLayout,
  PaneHeader,
  PaneEmptyState,
} from "@/components/ui/ThreePaneLayout";
import { DetailPane, SidebarSection } from "@/components/ui/DetailPane";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill, type StatusTone } from "@/components/ui/Pills";
import type { WorkspaceId } from "@/lib/workspaces";
import type {
  DocumentDetail,
  DocumentSummary,
  RecipientSummary,
  SignSigningStatus,
  SignStatus,
  SignTotals,
} from "@/lib/sign/types";
import {
  formatSignExternalIdForCompany,
  parseCompanyIdFromSignExternalId,
  signArchivePdfFilename,
  signSalesNextStepDe,
} from "@/lib/sign/sales-flow";
import { useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";

const STATUS_FILTERS: ReadonlyArray<{
  id: SignStatus | "ALL";
  labelKey: keyof Messages;
  fallback: string;
  icon: typeof Inbox;
}> = [
  { id: "ALL", labelKey: "sign.scope.all", fallback: "Alle", icon: Inbox },
  { id: "DRAFT", labelKey: "sign.status.draft", fallback: "Entwürfe", icon: FileSignature },
  { id: "PENDING", labelKey: "sign.status.pending", fallback: "In Signatur", icon: Send },
  { id: "COMPLETED", labelKey: "sign.status.completed", fallback: "Erledigt", icon: CheckCircle2 },
  { id: "REJECTED", labelKey: "sign.status.rejected", fallback: "Abgelehnt", icon: XCircle },
];

function statusLabel(
  s: SignStatus,
  t?: (k: keyof Messages, fallback?: string) => string,
): string {
  switch (s) {
    case "DRAFT":
      return t ? t("sign.status.draft", "Entwurf") : "Entwurf";
    case "PENDING":
      return t ? t("sign.status.pending", "In Signatur") : "In Signatur";
    case "COMPLETED":
      return t ? t("sign.status.completed", "Erledigt") : "Erledigt";
    case "REJECTED":
      return t ? t("sign.status.rejected", "Abgelehnt") : "Abgelehnt";
  }
}

function statusTone(s: SignStatus): StatusTone {
  switch (s) {
    case "DRAFT":
      return "muted";
    case "PENDING":
      return "info";
    case "COMPLETED":
      return "success";
    case "REJECTED":
      return "danger";
  }
}

function signingStatusLabel(s: SignSigningStatus): string {
  switch (s) {
    case "NOT_SIGNED":
      return "Ausstehend";
    case "SIGNED":
      return "Unterzeichnet";
    case "REJECTED":
      return "Abgelehnt";
  }
}

function signingStatusTone(s: SignSigningStatus): StatusTone {
  switch (s) {
    case "NOT_SIGNED":
      return "warn";
    case "SIGNED":
      return "success";
    case "REJECTED":
      return "danger";
  }
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `vor ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SignClient({
  workspaceId,
  workspaceName,
  accent,
  documensoUrl,
  isAdmin = false,
  documensoNativeUiEnabled = false,
  /** If set (e.g. `?crmCompany=` from Company Hub), uploads attach Documenso `externalId` for traceability. */
  signLinkCompanyId = null,
  /** Deep-link from Cmd+K (`?doc=<numeric id>`) — selects document and cleans the query param. */
  openDocumentId = null,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  documensoUrl: string;
  isAdmin?: boolean;
  /** If true, show links into the Documenso web UI (narrow allowlist server-side). */
  documensoNativeUiEnabled?: boolean;
  signLinkCompanyId?: string | null;
  openDocumentId?: number | null;
}) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const t = useT();
  const [filter, setFilter] = useState<SignStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [totals, setTotals] = useState<SignTotals | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Upload-Flow (PDF + Auto-Convert für DOCX/ODT/etc.)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  /** false = default: portal-private listing; true = everyone in workspace sees in Sign. */
  const [uploadListingForTeam, setUploadListingForTeam] = useState(false);

  const uploadExternalId = useMemo(
    () =>
      signLinkCompanyId?.trim()
        ? formatSignExternalIdForCompany(signLinkCompanyId.trim())
        : null,
    [signLinkCompanyId],
  );

  const apiUrl = useCallback(
    (path: string, params?: Record<string, string | undefined | null>) => {
      const u = new URL(path, window.location.origin);
      u.searchParams.set("ws", workspaceId);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== "") u.searchParams.set(k, v);
        }
      }
      return u.toString();
    },
    [workspaceId],
  );

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(null);
    try {
      const r = await fetch(
        apiUrl("/api/sign/documents", {
          status: filter === "ALL" ? undefined : filter,
          q: search.trim() || undefined,
          totals: "1",
        }),
        { cache: "no-store" },
      );
      const j = await r.json();
      if (r.status === 503 && j.code === "not_configured") {
        setNotConfigured(j.error ?? "Sign ist für diesen Workspace nicht eingerichtet.");
        setDocs([]);
        return;
      }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDocs(j.items ?? []);
      if (j.totals) setTotals(j.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, filter, search]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const r = await fetch(apiUrl(`/api/sign/document/${id}`), {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.document);
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    if (openDocumentId == null || openDocumentId <= 0) return;
    setSelectedId(openDocumentId);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("doc")) return;
    url.searchParams.delete("doc");
    const qs = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      url.pathname + (qs ? "?" + qs : ""),
    );
  }, [openDocumentId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Debounced search refresh
  useEffect(() => {
    const t = setTimeout(() => void loadDocs(), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Compose modal (subject + message) ──────────────────────── */
  const [composeOpen, setComposeOpen] = useState<
    | null
    | {
        kind: "send";
      }
    | {
        kind: "remind";
        recipients?: number[];
      }
  >(null);

  /* ── Mutations ──────────────────────────────────────────────── */

  const performAction = useCallback(
    async (
      action: "send" | "remind" | "repeat",
      recipients?: number[],
      meta?: { subject?: string; message?: string },
    ) => {
      if (!detail) return;
      const actingKey =
        action === "remind" && recipients?.length === 1
          ? `remind:${recipients[0]}`
          : action;
      setActing(actingKey);
      try {
        const payload: Record<string, unknown> = { action };
        if (recipients?.length) payload.recipients = recipients;
        if (meta?.subject?.trim()) payload.subject = meta.subject.trim();
        if (meta?.message?.trim()) payload.message = meta.message.trim();
        const r = await fetch(apiUrl(`/api/sign/document/${detail.id}`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);

        if (action === "repeat" && j.documentId) {
          await loadDocs();
          setSelectedId(j.documentId as number);
          setEditorOpen(true);
        } else {
          await Promise.all([loadDocs(), loadDetail(detail.id)]);
        }
      } catch (e) {
        alert(`Aktion fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      } finally {
        setActing(null);
      }
    },
    [detail, apiUrl, loadDocs, loadDetail],
  );

  const setPortalListingScope = useCallback(
    async (scope: "private" | "team") => {
      if (!detail) return;
      setActing("portalScope");
      try {
        const r = await fetch(apiUrl(`/api/sign/document/${detail.id}`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "setPortalVisibility", scope }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        await Promise.all([loadDocs(), loadDetail(detail.id)]);
      } catch (e) {
        alert(
          `Sichtbarkeit konnte nicht geändert werden: ${
            e instanceof Error ? e.message : e
          }`,
        );
      } finally {
        setActing(null);
      }
    },
    [detail, apiUrl, loadDocs, loadDetail],
  );

  const onDelete = useCallback(async () => {
    if (!detail) return;
    if (!confirm(`„${detail.title}“ wirklich löschen?`)) return;
    setActing("delete");
    try {
      const r = await fetch(apiUrl(`/api/sign/document/${detail.id}`), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setSelectedId(null);
      setDetail(null);
      await loadDocs();
    } catch (e) {
      alert(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setActing(null);
    }
  }, [detail, apiUrl, loadDocs]);

  /* ── Upload (with auto-PDF-conversion for non-PDF files) ─────── */

  const triggerUpload = useCallback(() => {
    setUploadError(null);
    setUploadInfo(null);
    fileInputRef.current?.click();
  }, []);

  const onFileChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = ""; // erlauben, dieselbe Datei nochmal auszuwählen
      if (!f) return;

      setUploadError(null);
      setUploadInfo(null);
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("portalScope", uploadListingForTeam ? "team" : "private");
        if (uploadExternalId) fd.append("externalId", uploadExternalId);
        // Standardtitel = Dateiname ohne Endung; Server fällt darauf zurück.
        const r = await fetch(apiUrl("/api/sign/upload"), {
          method: "POST",
          body: fd,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);

        const docId = j.documentId as number;

        setUploadInfo(
          j.converted
            ? `„${f.name}“ wurde nach PDF konvertiert und hochgeladen. Empfänger und Felder im Editor zuordnen.`
            : `„${f.name}“ wurde hochgeladen. Empfänger und Felder im Editor zuordnen.`,
        );
        await loadDocs();
        setSelectedId(docId);

        setEditorOpen(true);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [apiUrl, loadDocs, uploadListingForTeam, uploadExternalId],
  );

  const documensoOpenUrl = useMemo(() => {
    if (detail?.teamUrl) {
      return `${documensoUrl}/t/${detail.teamUrl}/documents/${detail.id}`;
    }
    if (detail) return `${documensoUrl}/documents/${detail.id}`;
    return `${documensoUrl}/documents`;
  }, [detail, documensoUrl]);

  /* ── Pane 1: Status-Filter ──────────────────────────────────── */
  const primary = (
    <>
      <PaneHeader
        title={t("sign.documents")}
        subtitle={workspaceName}
        accent={accent}
        icon={<PenLine size={14} style={{ color: accent }} />}
        right={
          <>
            <button
              type="button"
              onClick={() => void loadDocs()}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.refresh")}
            >
              <RefreshCw size={13} />
            </button>
            {documensoNativeUiEnabled && (
              <a
                href={`${documensoUrl}/settings/profile`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                title={t("common.settings") + " (Documenso)"}
              >
                <SettingsIcon size={13} />
              </a>
            )}
          </>
        }
      />

      <nav className="flex-1 min-h-0 overflow-auto py-1">
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.id;
          const count =
            f.id === "ALL"
              ? totals
                ? totals.draft + totals.pending + totals.completed + totals.rejected
                : null
              : totals
              ? totals[
                  f.id === "DRAFT"
                    ? "draft"
                    : f.id === "PENDING"
                    ? "pending"
                    : f.id === "COMPLETED"
                    ? "completed"
                    : "rejected"
                ]
              : null;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-bg-overlay/60"
              style={
                active
                  ? {
                      background: `${accent}18`,
                      color: accent,
                      borderLeft: `2px solid ${accent}`,
                      paddingLeft: 10,
                    }
                  : { borderLeft: "2px solid transparent" }
              }
            >
              <f.icon size={13} className={active ? "" : "text-text-tertiary"} />
              <span className="flex-1 font-medium">{t(f.labelKey, f.fallback)}</span>
              {count != null && (
                <span
                  className={`text-[10.5px] tabular-nums ${
                    active ? "" : "text-text-quaternary"
                  }`}
                  style={active ? { color: accent } : undefined}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <details className="shrink-0 border-t border-stroke-1 px-3 py-2 text-[10.5px] text-text-tertiary">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary list-none flex items-center gap-1.5">
          <CornerUpRight size={12} className="shrink-0 opacity-70" />
          Vertriebsablauf (Kurz)
        </summary>
        <ul className="mt-2 space-y-1.5 pl-1 leading-snug border-l border-stroke-1 ml-0.5 pl-3">
          <li>
            <span className="text-text-secondary font-medium">1. Entwurf</span> — PDF
            hochladen (oder aus Office exportieren). Felder &amp; Empfänger im Editor.
          </li>
          <li>
            <span className="text-text-secondary font-medium">2. Zur Unterschrift</span>{" "}
            — senden; Empfänger erhalten Documenso-Mail.
          </li>
          <li>
            <span className="text-text-secondary font-medium">3. Erledigt</span> — PDF
            archivieren (Documenso).
          </li>
        </ul>
      </details>

      {signLinkCompanyId?.trim() && (
        <div className="shrink-0 px-2 py-1.5 mx-1 mb-0.5 rounded-md border border-stroke-1 bg-bg-elevated/80 text-[10.5px] text-text-secondary leading-snug">
          CRM-Verknüpfung aktiv: Upload landet mit Documenso-{" "}
          <code className="text-[10px] text-text-primary">externalId</code>.{" "}
          <Link
            href={`/${workspaceId}/crm/company/${encodeURIComponent(signLinkCompanyId.trim())}`}
            className="text-info hover:underline"
          >
            Zum Company-Hub
          </Link>
        </div>
      )}

      <div className="shrink-0 border-t border-stroke-1 p-2 space-y-1.5">
        <label className="flex items-start gap-2 px-1 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-stroke-2"
            checked={uploadListingForTeam}
            onChange={(e) => setUploadListingForTeam(e.target.checked)}
          />
          <span className="text-[10.5px] text-text-tertiary leading-snug">
            Für das gesamte Team in dieser Sign-Liste sichtbar (sonst Standard:{" "}
            <span className="text-text-secondary">nur für mich</span>)
          </span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.docm,.odt,.ott,.rtf,.txt,.xls,.xlsx,.xlsm,.ods,.csv,.ppt,.pptx,.odp,.png,.jpg,.jpeg"
          onChange={onFileChosen}
        />
        <button
          type="button"
          onClick={triggerUpload}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-white text-[11.5px] font-medium disabled:opacity-60"
          style={{ background: accent }}
          title="PDF, DOCX, ODT, RTF, TXT u.v.m. — Nicht-PDFs werden automatisch konvertiert"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          {uploading ? "Wird hochgeladen…" : "Dokument hochladen"}
        </button>
        {documensoNativeUiEnabled && (
          <a
            href={`${documensoUrl}/documents`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[10.5px]"
          >
            <ExternalLink size={11} />
            In Documenso verwalten
          </a>
        )}
        <p className="text-[10px] text-text-quaternary text-center leading-snug flex items-center justify-center gap-1">
          <FileType2 size={10} />
          Word, ODT &amp; mehr werden automatisch zu PDF
        </p>
        {uploadError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[10.5px] p-2 leading-snug">
            {uploadError}
          </div>
        )}
        {uploadInfo && !uploadError && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10.5px] p-2 leading-snug">
            {uploadInfo}
          </div>
        )}
      </div>
    </>
  );

  /* ── Pane 2: Document list ──────────────────────────────────── */
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  const secondary = (
    <>
      <PaneHeader
        title={(() => {
          const tab = STATUS_FILTERS.find((f) => f.id === filter);
          return tab ? t(tab.labelKey, tab.fallback) : t("sign.documents");
        })()}
        subtitle={`${filteredDocs.length} Dokument${filteredDocs.length === 1 ? "" : "e"}`}
        accent={accent}
      >
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titel suchen…"
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
          />
        </div>
      </PaneHeader>

      {error && (
        <div className="p-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2 whitespace-pre-wrap">
            {error}
          </div>
        </div>
      )}

      {notConfigured ? (
        <div className="p-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[12px] p-3 leading-relaxed">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <strong>Sign noch nicht eingerichtet</strong>
                <p className="mt-1 text-[11.5px] opacity-90">{notConfigured}</p>
                {isAdmin && (
                  <a
                    href={`/admin/onboarding/sign?ws=${encodeURIComponent(workspaceId)}`}
                    className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-medium transition-colors"
                  >
                    Jetzt provisionieren
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : loading && docs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />
        </div>
      ) : filteredDocs.length === 0 ? (
        <PaneEmptyState
          title={search ? "Keine Treffer" : "Noch keine Dokumente"}
          hint={
            search
              ? "Versuche einen anderen Suchbegriff."
              : documensoNativeUiEnabled
                ? "Lege das erste Dokument hier oder in Documenso an."
                : "Lade über die linke Seitenleiste ein Dokument hoch oder warte auf freigegebene Dokumente."
          }
          icon={<FileSignature size={28} />}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {filteredDocs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              selected={d.id === selectedId}
              onClick={() => setSelectedId(d.id)}
              accent={accent}
            />
          ))}
        </div>
      )}
    </>
  );

  /* ── Pane 3: Detail ─────────────────────────────────────────── */

  let detailNode;
  if (notConfigured) {
    detailNode = (
      <PaneEmptyState
        title="Native Sign-Integration"
        hint="Sobald für diesen Workspace ein Documenso-Team konfiguriert ist, erscheinen hier die Dokumente."
        icon={<PenLine size={32} />}
      />
    );
  } else if (!selectedId) {
    detailNode = (
      <PaneEmptyState
        title="Kein Dokument gewählt"
        hint="Wähle links ein Dokument, um Status, Empfänger und Aktionen zu sehen — oder lege ein neues an."
        icon={<FileSignature size={32} />}
      />
    );
  } else if (detailLoading && !detail) {
    detailNode = (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
      </div>
    );
  } else if (detailError) {
    detailNode = (
      <div className="p-4">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-3 whitespace-pre-wrap">
          {detailError}
        </div>
      </div>
    );
  } else if (detail) {
    detailNode = (
      <DocumentDetailView
        doc={detail}
        workspaceId={workspaceId}
        accent={accent}
        documensoOpenUrl={documensoOpenUrl}
        isAdmin={isAdmin}
        acting={acting}
        documensoNativeUiEnabled={documensoNativeUiEnabled}
        onSend={() => void performAction("send")}
        onSendWithMessage={() => setComposeOpen({ kind: "send" })}
        onRemind={() => void performAction("remind")}
        onRemindWithMessage={() => setComposeOpen({ kind: "remind" })}
        onRemindOne={(recipientId) =>
          void performAction("remind", [recipientId])
        }
        onRemindOneWithMessage={(recipientId) =>
          setComposeOpen({ kind: "remind", recipients: [recipientId] })
        }
        onRepeat={() => void performAction("repeat")}
        onDelete={() => void onDelete()}
        onOpenEditor={() => setEditorOpen(true)}
        onSetPortalListingScope={(scope) => void setPortalListingScope(scope)}
      />
    );
  }

  const detailHeader = detail ? (
    <div
      className="flex-1 px-4 py-2.5 flex items-center gap-3 min-w-0"
      style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${accent}18`, color: accent }}
      >
        <PenLine size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[13.5px] font-semibold leading-tight truncate">
          {detail.title}
        </h1>
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary mt-0.5">
          <span>#{detail.id}</span>
          <span>·</span>
          <span>{formatRelative(detail.createdAt)}</span>
          <span>·</span>
          <StatusPill label={statusLabel(detail.status, t)} tone={statusTone(detail.status)} />
        </div>
      </div>
      {documensoNativeUiEnabled && (
        <a
          href={documensoOpenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
        >
          <ExternalLink size={11} />
          In Documenso öffnen
        </a>
      )}
    </div>
  ) : (
    <div
      className="flex-1 px-4 py-2.5 flex items-center gap-2"
      style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
    >
      <PenLine size={14} style={{ color: accent }} />
      <h1 className="text-[12.5px] font-semibold leading-tight">
        Sign ·{" "}
        <span className="text-text-tertiary font-normal">{workspaceName}</span>
      </h1>
      {documensoNativeUiEnabled && (
        <a
          href={`${documensoUrl}/documents`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
        >
          <ExternalLink size={11} />
          In Documenso öffnen
        </a>
      )}
    </div>
  );

  const detailWithHeader = (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome flex">
        {detailHeader}
      </div>
      <div className="flex-1 min-h-0 flex">{detailNode}</div>
    </div>
  );

  return (
    <>
      <ThreePaneLayout
        primary={primary}
        secondary={secondary}
        detail={detailWithHeader}
        storageKey={`sign:${workspaceId}`}
        hasSelection={selectedId != null}
        onMobileBack={() => setSelectedId(null)}
      />
      {editorOpen && detail && (
        <FieldEditor
          workspaceId={workspaceId}
          doc={detail}
          accent={accent}
          onClose={() => {
            setEditorOpen(false);
            void loadDetail(detail.id);
          }}
          onSent={() => {
            setEditorOpen(false);
            void Promise.all([loadDocs(), loadDetail(detail.id)]);
          }}
        />
      )}
      {composeOpen && detail && (
        <ComposeModal
          kind={composeOpen.kind}
          accent={accent}
          docTitle={detail.title}
          recipientLabel={
            composeOpen.kind === "remind"
              ? composeOpen.recipients?.length === 1
                ? detail.recipients.find(
                    (r) => r.id === composeOpen.recipients?.[0],
                  )?.email ?? null
                : null
              : null
          }
          submitting={
            composeOpen.kind === "send"
              ? acting === "send"
              : composeOpen.recipients?.length === 1
                ? acting === `remind:${composeOpen.recipients[0]}`
                : acting === "remind"
          }
          onClose={() => setComposeOpen(null)}
          onSubmit={async ({ subject, message }) => {
            const op = composeOpen;
            setComposeOpen(null);
            if (op.kind === "send") {
              await performAction("send", undefined, { subject, message });
            } else {
              await performAction("remind", op.recipients, { subject, message });
            }
          }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Document list row                              */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * A document is "stalled" when it's been waiting for signatures for a
 * while without any movement. We use 3 days since `updatedAt` as the
 * threshold — Documenso bumps `updatedAt` every time a recipient opens
 * the email or signs, so "no update in 3d" is a reliable proxy for
 * "nobody touched it lately, send a reminder".
 */
const STALL_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

function isStalledPending(doc: DocumentSummary | DocumentDetail): boolean {
  if (doc.status !== "PENDING") return false;
  const ts = new Date(doc.updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts >= STALL_THRESHOLD_MS;
}

function DocumentRow({
  doc,
  selected,
  onClick,
  accent,
}: {
  doc: DocumentSummary;
  selected: boolean;
  onClick: () => void;
  accent: string;
}) {
  const t = useT();
  const signers = doc.recipients.filter((r) => r.role === "SIGNER");
  const signed = signers.filter((r) => r.signingStatus === "SIGNED").length;
  const total = signers.length;
  const pct = total === 0 ? 0 : Math.round((signed / total) * 100);
  const stalled = isStalledPending(doc);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full block text-left px-3 py-2.5 border-b border-stroke-1 hover:bg-bg-overlay/40"
      style={
        selected
          ? {
              background: `${accent}14`,
              borderLeft: `2px solid ${accent}`,
              paddingLeft: 10,
            }
          : { borderLeft: "2px solid transparent" }
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold truncate flex-1">
              {doc.title}
            </span>
            {doc.portalPrivate && (
              <span
                title="In CoreLab nur für dich gelistet"
                aria-label="In CoreLab nur für dich gelistet"
              >
                <Lock
                  size={11}
                  className="text-text-tertiary shrink-0"
                  aria-hidden
                />
              </span>
            )}
            {stalled && (
              <AlertTriangle
                size={11}
                className="text-amber-400 shrink-0"
                aria-label="Liegt seit Tagen unangetastet — eine Erinnerung könnte helfen."
              />
            )}
            <StatusPill label={statusLabel(doc.status, t)} tone={statusTone(doc.status)} />
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-text-tertiary mt-1">
            <Clock size={10} />
            <span>{formatRelative(doc.createdAt)}</span>
            {total > 0 && (
              <>
                <span>·</span>
                <span>
                  {signed}/{total} unterzeichnet
                </span>
              </>
            )}
            {stalled && (
              <>
                <span>·</span>
                <span className="text-amber-400">
                  Letzte Aktivität {formatRelative(doc.updatedAt)}
                </span>
              </>
            )}
          </div>
          {/* Recipient avatars + progress bar */}
          {total > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex -space-x-1">
                {signers.slice(0, 4).map((r) => (
                  <Avatar
                    key={r.id}
                    name={r.name}
                    email={r.email}
                    size={18}
                    ring
                    title={`${r.name} · ${signingStatusLabel(r.signingStatus)}`}
                  />
                ))}
                {signers.length > 4 && (
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-bg-overlay text-text-tertiary font-semibold ring-2 ring-bg-base text-[9px]"
                    style={{ width: 18, height: 18 }}
                  >
                    +{signers.length - 4}
                  </span>
                )}
              </div>
              {doc.status === "PENDING" && total > 0 && (
                <div className="flex-1 h-1 rounded-full bg-bg-overlay overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: accent,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Detail view                                  */
/* ─────────────────────────────────────────────────────────────────────── */

function DocumentDetailView({
  doc,
  workspaceId,
  accent,
  documensoOpenUrl,
  documensoNativeUiEnabled,
  isAdmin,
  acting,
  onSend,
  onSendWithMessage,
  onRemind,
  onRemindWithMessage,
  onRemindOne,
  onRemindOneWithMessage,
  onRepeat,
  onDelete,
  onOpenEditor,
  onSetPortalListingScope,
}: {
  doc: DocumentDetail;
  workspaceId: WorkspaceId;
  accent: string;
  documensoOpenUrl: string;
  documensoNativeUiEnabled: boolean;
  isAdmin: boolean;
  acting: string | null;
  onSend: () => void;
  onSendWithMessage: () => void;
  onRemind: () => void;
  onRemindWithMessage: () => void;
  onRemindOne: (recipientId: number) => void;
  onRemindOneWithMessage: (recipientId: number) => void;
  onRepeat: () => void;
  onDelete: () => void;
  onOpenEditor: () => void;
  onSetPortalListingScope: (scope: "private" | "team") => void;
}) {
  const t = useT();
  const linkedCompanyId = parseCompanyIdFromSignExternalId(doc.externalId);
  const signers = doc.recipients.filter((r) => r.role === "SIGNER");
  const totalSigners = signers.length;
  const signedCount = signers.filter((r) => r.signingStatus === "SIGNED").length;
  const pct = totalSigners === 0 ? 0 : Math.round((signedCount / totalSigners) * 100);

  const main = (
    <div className="px-6 py-5">
      {/* Status bar */}
      <div
        className="rounded-lg p-4 mb-5"
        style={{ background: `${accent}10`, border: `1px solid ${accent}25` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${accent}25`, color: accent }}
          >
            {doc.status === "COMPLETED" ? (
              <CheckCircle2 size={20} />
            ) : doc.status === "PENDING" ? (
              <Send size={18} />
            ) : doc.status === "REJECTED" ? (
              <XCircle size={20} />
            ) : (
              <FileSignature size={18} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold">
              {doc.status === "COMPLETED"
                ? "Alle Empfänger haben unterzeichnet"
                : doc.status === "PENDING"
                ? `${signedCount} von ${totalSigners} Empfängern haben unterzeichnet`
                : doc.status === "REJECTED"
                ? "Mindestens ein Empfänger hat abgelehnt"
                : "Entwurf — noch nicht versendet"}
            </p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Erstellt {formatDate(doc.createdAt)}
              {doc.completedAt
                ? ` · Abgeschlossen ${formatDate(doc.completedAt)}`
                : ""}
            </p>
          </div>
        </div>
        {totalSigners > 0 && doc.status !== "DRAFT" && (
          <div className="mt-3 h-1.5 rounded-full bg-bg-overlay overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        )}
        {isStalledPending(doc) && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11.5px] p-2.5 leading-relaxed">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Dieses Dokument liegt seit {formatRelative(doc.updatedAt)} ohne
              Bewegung. Eine Erinnerung — gerne mit kurzem persönlichem Hinweis —
              hilft erfahrungsgemäß deutlich.
            </span>
          </div>
        )}
        <p className="text-[11px] text-text-secondary mt-3 leading-relaxed border-t border-stroke-1/50 pt-3">
          {signSalesNextStepDe(doc.status)}
        </p>
        {doc.externalId?.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
            <span>
              Portal-Referenz:{" "}
              <code className="text-[10px] text-text-primary">{doc.externalId}</code>
            </span>
            {linkedCompanyId ? (
              <Link
                href={`/${workspaceId}/crm/company/${encodeURIComponent(linkedCompanyId)}`}
                className="text-info hover:underline"
              >
                Company-Hub
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {doc.status === "DRAFT" && (
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
            style={{ background: accent }}
          >
            <LayoutGrid size={12} />
            Felder &amp; Empfänger im Editor
          </button>
        )}
        {doc.status === "DRAFT" && (
          <>
            <button
              type="button"
              onClick={onSend}
              disabled={acting === "send"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium disabled:opacity-60"
              style={{ borderColor: accent, color: accent }}
              title="Sendet die Signatur-Mail mit der Standard-Vorlage des Teams."
            >
              {acting === "send" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              Direkt senden
            </button>
            <button
              type="button"
              onClick={onSendWithMessage}
              disabled={acting === "send"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-60"
              title="Vor dem Senden Betreff und persönliche Nachricht eingeben."
            >
              <MessageSquare size={12} />
              Mit Nachricht…
            </button>
          </>
        )}
        {doc.status === "PENDING" && (
          <>
            <button
              type="button"
              onClick={onRemind}
              disabled={acting === "remind"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-60"
              style={{ background: accent }}
              title="Sendet die Signatur-Mail noch einmal an alle, die noch nicht unterschrieben haben."
            >
              {acting === "remind" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Mail size={12} />
              )}
              Alle erinnern
            </button>
            <button
              type="button"
              onClick={onRemindWithMessage}
              disabled={acting === "remind"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-60"
              title="Erinnerung mit personalisierter Nachricht senden."
            >
              <MessageSquare size={12} />
              Mit Nachricht…
            </button>
          </>
        )}
        {(doc.status === "COMPLETED" || doc.status === "REJECTED") && (
          <>
            {doc.status === "COMPLETED" && (
              <a
                href={`/api/sign/document/${doc.id}/pdf?ws=${encodeURIComponent(workspaceId)}&download=1&filename=${encodeURIComponent(signArchivePdfFilename(doc.title, doc.id))}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-[12px] font-medium text-text-secondary hover:text-text-primary"
                title="Signiertes PDF als Datei speichern (Archiv)"
              >
                <Download size={12} />
                PDF archivieren
              </a>
            )}
            <button
            type="button"
            onClick={onRepeat}
            disabled={acting === "repeat"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
            title="Legt eine neue Entwurfs-Kopie mit denselben Empfängern an. Die signierten Felder müssen im Editor neu gesetzt werden."
          >
            {acting === "repeat" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CornerUpRight size={12} />
            )}
            Erneut versenden
          </button>
          </>
        )}
        {documensoNativeUiEnabled && (
          <a
            href={documensoOpenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary text-[12px]"
          >
            <CornerUpRight size={12} />
            {doc.status === "DRAFT" ? "Entwurf öffnen" : "Detail öffnen"}
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={acting === "delete"}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300 text-[12px] disabled:opacity-60"
        >
          {acting === "delete" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
          Löschen
        </button>
      </div>

      {/* Recipients */}
      <h2 className="text-[11px] uppercase tracking-wide font-semibold text-text-tertiary mb-2">
        Empfänger ({doc.recipients.length})
      </h2>
      {doc.recipients.length === 0 ? (
        <p className="text-[12px] text-text-tertiary">
          Noch keine Empfänger zugewiesen.
        </p>
      ) : (
        <div className="space-y-1.5">
          {[...doc.recipients]
            .sort(
              (a, b) =>
                (a.signingOrder ?? 99) - (b.signingOrder ?? 99) ||
                a.id - b.id,
            )
            .map((r) => (
              <RecipientRow
                key={r.id}
                recipient={r}
                accent={accent}
                canRemind={
                  doc.status === "PENDING" &&
                  r.role === "SIGNER" &&
                  r.signingStatus === "NOT_SIGNED"
                }
                reminding={acting === `remind:${r.id}`}
                onRemind={() => onRemindOne(r.id)}
                onRemindWithMessage={() => onRemindOneWithMessage(r.id)}
              />
            ))}
        </div>
      )}
    </div>
  );

  const rightSidebar = (
    <>
      <SidebarSection title="Status">
        <div className="space-y-2 text-[11.5px]">
          <Field label={t("common.status")}>
            <StatusPill label={statusLabel(doc.status, t)} tone={statusTone(doc.status)} />
          </Field>
          {(doc.uploadedViaPortal || doc.portalPrivate || isAdmin) && (
            <>
              <Field label="Liste (CoreLab)">
                <div className="flex flex-col gap-2 min-w-0">
                  <span className="text-text-secondary">
                    {doc.portalPrivate
                      ? "Nur in deinem Sign-Bereich sichtbar"
                      : "Für alle mit Workspace-Zugang"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={acting === "portalScope"}
                      onClick={() => onSetPortalListingScope("private")}
                      className="px-2 py-1 rounded-md text-[11px] border disabled:opacity-50"
                      style={
                        doc.portalPrivate
                          ? {
                              borderColor: accent,
                              color: accent,
                              background: `${accent}12`,
                            }
                          : {
                              borderColor: "rgba(255,255,255,0.12)",
                              color: undefined,
                            }
                      }
                    >
                      Nur ich
                    </button>
                    <button
                      type="button"
                      disabled={acting === "portalScope"}
                      onClick={() => onSetPortalListingScope("team")}
                      className="px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:border-stroke-2 disabled:opacity-50"
                      style={
                        !doc.portalPrivate
                          ? {
                              borderColor: accent,
                              color: accent,
                              background: `${accent}12`,
                            }
                          : undefined
                      }
                    >
                      Team
                    </button>
                  </div>
                  <p className="text-[10px] text-text-quaternary leading-snug">
                    Betrifft nur die CoreLab-Sign-Liste, nicht die Sichtbarkeit in
                    Documenso selbst.
                  </p>
                </div>
              </Field>
            </>
          )}
          {!doc.uploadedViaPortal && !doc.portalPrivate && !isAdmin && (
            <Field label="Liste (CoreLab)">
              <span className="text-text-tertiary text-[11px] leading-snug">
                Nur für im Portal hochgeladene Dokumente änderbar.
              </span>
            </Field>
          )}
          <Field label="Quelle">
            <span className="text-text-secondary">
              {doc.source === "DOCUMENT"
                ? "Direkter Upload"
                : doc.source === "TEMPLATE"
                ? "Vorlage"
                : "Vorlage (Direct Link)"}
            </span>
          </Field>
          <Field label="Sichtbar">
            <span className="text-text-secondary">
              {doc.visibility === "EVERYONE"
                ? "Team"
                : doc.visibility === "MANAGER_AND_ABOVE"
                ? "Manager+"
                : "Admin"}
            </span>
          </Field>
        </div>
      </SidebarSection>

      <SidebarSection title="Zeitstempel">
        <div className="space-y-2 text-[11.5px]">
          <Field label="Erstellt">
            <span className="text-text-secondary inline-flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(doc.createdAt)}
            </span>
          </Field>
          <Field label="Aktualisiert">
            <span className="text-text-secondary inline-flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(doc.updatedAt)}
            </span>
          </Field>
          {doc.completedAt && (
            <Field label="Abgeschlossen">
              <span className="text-text-secondary inline-flex items-center gap-1">
                <CheckCircle2 size={10} className="text-emerald-400" />
                {formatDate(doc.completedAt)}
              </span>
            </Field>
          )}
        </div>
      </SidebarSection>

      <SidebarSection title="Inhaber">
        <div className="text-[11.5px] text-text-secondary truncate">
          {doc.ownerEmail ?? "—"}
        </div>
      </SidebarSection>

      {totalSigners > 0 && (
        <SidebarSection title="Fortschritt">
          <div className="text-[12px] font-semibold mb-1.5" style={{ color: accent }}>
            {signedCount} / {totalSigners} unterzeichnet
          </div>
          <div className="h-1.5 rounded-full bg-bg-overlay overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        </SidebarSection>
      )}
    </>
  );

  return <DetailPane main={main} rightSidebar={rightSidebar} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-tertiary w-20 shrink-0">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function RecipientRow({
  recipient,
  accent,
  canRemind = false,
  reminding = false,
  onRemind,
  onRemindWithMessage,
}: {
  recipient: RecipientSummary;
  accent: string;
  canRemind?: boolean;
  reminding?: boolean;
  onRemind?: () => void;
  onRemindWithMessage?: () => void;
}) {
  const signed = recipient.signingStatus === "SIGNED";
  const rejected = recipient.signingStatus === "REJECTED";
  const opened = recipient.readStatus === "OPENED";
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-stroke-1 hover:border-stroke-2 bg-bg-elevated/40">
      <Avatar name={recipient.name} email={recipient.email} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold truncate">
            {recipient.name}
          </span>
          {recipient.signingOrder != null && (
            <span
              className="text-[10px] tabular-nums px-1.5 py-[1px] rounded-full"
              style={{ background: `${accent}20`, color: accent }}
              title={`Reihenfolge ${recipient.signingOrder}`}
            >
              #{recipient.signingOrder}
            </span>
          )}
          <span className="text-[10px] text-text-quaternary uppercase tracking-wide">
            {recipient.role}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary mt-0.5">
          <span className="truncate">{recipient.email}</span>
          {opened && !signed && !rejected && (
            <span className="text-text-quaternary">· Geöffnet</span>
          )}
          {recipient.signedAt && (
            <span className="text-text-quaternary">
              · {formatRelative(recipient.signedAt)}
            </span>
          )}
        </div>
        {recipient.rejectionReason && (
          <p className="text-[11px] text-red-400 mt-1 italic">
            „{recipient.rejectionReason}“
          </p>
        )}
      </div>
      {canRemind && onRemind && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRemind}
            disabled={reminding}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary disabled:opacity-60"
            title={`Neue Signatur-Mail an ${recipient.email} verschicken.`}
          >
            {reminding ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Mail size={11} />
            )}
            Erinnern
          </button>
          {onRemindWithMessage && (
            <button
              type="button"
              onClick={onRemindWithMessage}
              disabled={reminding}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary disabled:opacity-60"
              title={`Persönliche Nachricht an ${recipient.email} mitsenden.`}
            >
              <MessageSquare size={11} />
            </button>
          )}
        </div>
      )}
      <StatusPill
        label={signingStatusLabel(recipient.signingStatus)}
        tone={signingStatusTone(recipient.signingStatus)}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Compose modal                                  */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Lightweight modal that captures an optional subject + message before
 * dispatching the send/remind action. Empty fields fall back to
 * Documenso's per-team default email template, so admins only fill in
 * what they actually want to override.
 */
function ComposeModal({
  kind,
  accent,
  docTitle,
  recipientLabel,
  submitting,
  onClose,
  onSubmit,
}: {
  kind: "send" | "remind";
  accent: string;
  docTitle: string;
  recipientLabel: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { subject: string; message: string }) => void | Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const isSend = kind === "send";

  const ctaLabel = isSend ? "Jetzt senden" : "Erinnerung senden";
  const headline = isSend
    ? "Dokument versenden"
    : recipientLabel
      ? `Erinnerung an ${recipientLabel}`
      : "Erinnerung an alle Offenen";
  const intro = isSend
    ? "Optionaler Betreff und persönliche Nachricht — bleibt das Feld leer, schickt Documenso die Standard-Vorlage des Teams."
    : "Wird zusätzlich zur Standard-Erinnerung mitgeschickt.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-stroke-1 bg-bg-base shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center gap-2 px-4 py-3 border-b border-stroke-1"
          style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
        >
          <MessageSquare size={14} style={{ color: accent }} />
          <h2 className="text-[13px] font-semibold flex-1">{headline}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11.5px] text-text-tertiary leading-relaxed">
            {intro}
          </p>
          <div>
            <label className="block text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
              Betreff (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`z. B. „${docTitle}" – bitte unterzeichnen`}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:border-stroke-2"
              maxLength={500}
            />
          </div>
          <div>
            <label className="block text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
              Nachricht (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Hi Vorname, magst du noch kurz drüberschauen? Danke!"
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:border-stroke-2 resize-none leading-relaxed"
              maxLength={4000}
            />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stroke-1 bg-bg-elevated/50">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary text-[12px] disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void onSubmit({ subject, message })}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-60"
            style={{ background: accent }}
          >
            {submitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isSend ? (
              <Send size={12} />
            ) : (
              <Mail size={12} />
            )}
            {ctaLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
