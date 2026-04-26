"use client";

/**
 * In-portal Documenso field editor.
 *
 *   ┌──────────────┬─────────────────────────────────────┬──────────────┐
 *   │  recipients  │   PDF (pdf.js, click-to-place)       │  field tray │
 *   │  picker      │   - existing fields overlaid         │  (drag in)  │
 *   │  + bulk add  │   - active recipient = colour code  │              │
 *   └──────────────┴─────────────────────────────────────┴──────────────┘
 *
 * Field types match Documenso v2: SIGNATURE, INITIALS, DATE, TEXT.
 * Coordinates are stored as percentages of the rendered page so they
 * survive the server-side PDF re-rendering Documenso does on signing.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import {
  PenLine,
  Calendar as CalendarIcon,
  Type,
  Loader2,
  Send,
  Trash2,
  Plus,
  X,
  AlignStartHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

import type {
  DocumentDetail,
  RecipientSummary,
} from "@/lib/sign/types";

type FieldType = "SIGNATURE" | "INITIALS" | "DATE" | "TEXT";

type EditorField = {
  id: number | null; // null = pending, not yet persisted
  recipientId: number;
  type: FieldType;
  page: number;
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
  label?: string;
};

type DraftRecipient = {
  /** Documenso ID once it exists; null while unsaved. */
  id: number | null;
  email: string;
  name: string;
  role: "SIGNER" | "APPROVER" | "VIEWER" | "CC";
  signingOrder: number | null;
};

const FIELD_PALETTE: Array<{
  type: FieldType;
  label: string;
  hint: string;
  icon: typeof PenLine;
  defaultWidth: number; // % of page width
  defaultHeight: number; // % of page height
}> = [
  {
    type: "SIGNATURE",
    label: "Signatur",
    hint: "Unterschrift des Empfängers",
    icon: PenLine,
    defaultWidth: 30,
    defaultHeight: 6,
  },
  {
    type: "INITIALS",
    label: "Initialen",
    hint: "Kurzkennung an mehreren Stellen",
    icon: AlignStartHorizontal,
    defaultWidth: 8,
    defaultHeight: 4,
  },
  {
    type: "DATE",
    label: "Datum",
    hint: "Wird automatisch beim Unterschreiben gefüllt",
    icon: CalendarIcon,
    defaultWidth: 18,
    defaultHeight: 4,
  },
  {
    type: "TEXT",
    label: "Text",
    hint: "Frei beschreibbares Feld",
    icon: Type,
    defaultWidth: 22,
    defaultHeight: 4,
  },
];

const RECIPIENT_COLORS = [
  "#3b82f6",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

function colorFor(idx: number): string {
  return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length];
}

export function FieldEditor({
  workspaceId,
  doc,
  accent,
  onClose,
  onSent,
}: {
  workspaceId: string;
  doc: DocumentDetail;
  accent: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [recipients, setRecipients] = useState<DraftRecipient[]>(() =>
    (doc.recipients ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: (r.role as DraftRecipient["role"]) ?? "SIGNER",
      signingOrder: r.signingOrder,
    })),
  );
  const [activeRecipIdx, setActiveRecipIdx] = useState(0);
  const [fields, setFields] = useState<EditorField[]>([]);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "recipients" | "fields" | "send">(
    null,
  );
  const [draggingType, setDraggingType] = useState<FieldType | null>(null);

  /* ── PDF loading via pdf.js ──────────────────────────────────────── */

  const apiUrl = useCallback(
    (path: string) =>
      `${path}?ws=${encodeURIComponent(workspaceId)}`,
    [workspaceId],
  );

  // Fetch the PDF bytes via the portal proxy, then hand them to pdf.js.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setPdfError(null);
      try {
        const r = await fetch(apiUrl(`/api/sign/document/${doc.id}/pdf`), {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`PDF-Download fehlgeschlagen (${r.status})`);
        const buf = await r.arrayBuffer();
        if (cancelled) return;
        setPdfBytes(buf);
      } catch (e) {
        if (cancelled) return;
        setPdfError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, doc.id]);

  // Load existing fields so the editor starts populated.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/sign/document/${doc.id}/fields`), {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          fields?: Array<{
            id: number;
            recipientId: number;
            type: FieldType;
            page: number;
            pageX: number;
            pageY: number;
            pageWidth: number;
            pageHeight: number;
            label?: string;
          }>;
        };
        if (cancelled) return;
        setFields(j.fields ?? []);
      } catch {
        // Field list is optional — ignore failures (might be a brand-new doc).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, doc.id]);

  /* ── Active recipient ────────────────────────────────────────────── */

  const activeRecipient = recipients[activeRecipIdx] ?? null;
  const activeColor = colorFor(activeRecipIdx);

  function addRecipient() {
    setRecipients((prev) => [
      ...prev,
      {
        id: null,
        email: "",
        name: "",
        role: "SIGNER",
        signingOrder: prev.length + 1,
      },
    ]);
    setActiveRecipIdx(recipients.length);
  }

  function patchRecipient(idx: number, patch: Partial<DraftRecipient>) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function removeRecipient(idx: number) {
    const target = recipients[idx];
    if (!target) return;
    if (
      target.id != null &&
      !confirm(
        `Empfänger „${target.name || target.email}" und alle zugewiesenen Felder entfernen?`,
      )
    ) {
      return;
    }
    setRecipients((prev) => prev.filter((_, i) => i !== idx));
    setFields((prev) =>
      prev.filter((f) => target.id == null || f.recipientId !== target.id),
    );
    setActiveRecipIdx((i) => (i >= idx ? Math.max(0, i - 1) : i));
  }

  async function saveRecipients(): Promise<RecipientSummary[]> {
    setSaving("recipients");
    try {
      const r = await fetch(apiUrl(`/api/sign/document/${doc.id}/recipients`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipients: recipients.map((rec) => ({
            email: rec.email.trim(),
            name: rec.name.trim() || rec.email.trim(),
            role: rec.role,
            signingOrder: rec.signingOrder ?? undefined,
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const fresh = (j.recipients ?? []) as RecipientSummary[];
      // Re-key our drafts to the canonical Documenso IDs (matched by email).
      setRecipients((prev) =>
        prev.map((rec) => {
          const match = fresh.find(
            (f) => f.email.toLowerCase() === rec.email.toLowerCase(),
          );
          return match
            ? {
                ...rec,
                id: match.id,
                name: match.name,
                signingOrder: match.signingOrder,
              }
            : rec;
        }),
      );
      // Re-key pending fields too — fields placed before recipient save have
      // negative placeholder recipientIds (-(idx+1)) that we now resolve.
      setFields((prev) =>
        prev.map((f) => {
          if (f.recipientId > 0) return f;
          const idx = -f.recipientId - 1;
          const real = recipients[idx];
          if (!real?.email) return f;
          const match = fresh.find(
            (x) => x.email.toLowerCase() === real.email.toLowerCase(),
          );
          return match ? { ...f, recipientId: match.id } : f;
        }),
      );
      return fresh;
    } finally {
      setSaving(null);
    }
  }

  /* ── Field placement (drag/click) ────────────────────────────────── */

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  function placeFieldAt(
    clientX: number,
    clientY: number,
    type: FieldType,
  ) {
    if (!pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const palette = FIELD_PALETTE.find((p) => p.type === type)!;
    // Center the field on the cursor.
    const px = Math.max(0, Math.min(100 - palette.defaultWidth, x - palette.defaultWidth / 2));
    const py = Math.max(0, Math.min(100 - palette.defaultHeight, y - palette.defaultHeight / 2));
    const recipientId =
      activeRecipient?.id ??
      // Negative placeholder; rewritten on saveRecipients().
      -(activeRecipIdx + 1);
    setFields((prev) => [
      ...prev,
      {
        id: null,
        recipientId,
        type,
        page: pageIdx + 1,
        pageX: px,
        pageY: py,
        pageWidth: palette.defaultWidth,
        pageHeight: palette.defaultHeight,
      },
    ]);
  }

  function onPageDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-sign-field") as FieldType;
    if (!type) return;
    placeFieldAt(e.clientX, e.clientY, type);
    setDraggingType(null);
  }

  function onPageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!draggingType) return;
    placeFieldAt(e.clientX, e.clientY, draggingType);
    setDraggingType(null);
  }

  function removeField(idx: number) {
    const f = fields[idx];
    setFields((prev) => prev.filter((_, i) => i !== idx));
    if (f?.id != null) {
      void fetch(
        apiUrl(`/api/sign/document/${doc.id}/fields`) +
          `&fieldId=${encodeURIComponent(f.id)}`,
        { method: "DELETE" },
      );
    }
  }

  /* ── Save fields + send ─────────────────────────────────────────── */

  async function persistFields(): Promise<void> {
    const pending = fields.filter((f) => f.id == null && f.recipientId > 0);
    if (pending.length === 0) return;
    setSaving("fields");
    try {
      const r = await fetch(apiUrl(`/api/sign/document/${doc.id}/fields`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: pending.map((f) => ({
            type: f.type,
            recipientId: f.recipientId,
            page: f.page,
            pageX: f.pageX,
            pageY: f.pageY,
            pageWidth: f.pageWidth,
            pageHeight: f.pageHeight,
            label: f.label,
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setFields(
        (j.fields ?? []) as Array<EditorField & { id: number }>,
      );
    } finally {
      setSaving(null);
    }
  }

  async function send() {
    // Validate required state.
    if (recipients.length === 0) {
      alert("Mindestens ein Empfänger nötig.");
      return;
    }
    if (recipients.some((r) => !r.email || !r.email.includes("@"))) {
      alert("Jeder Empfänger braucht eine gültige E-Mail.");
      return;
    }
    const signers = recipients.filter((r) => r.role === "SIGNER");
    const fieldsBySigner = new Set(
      fields.map((f) => f.recipientId).filter((id) => id > 0),
    );
    const signersWithoutFields = signers.filter(
      (s) => s.id != null && !fieldsBySigner.has(s.id),
    );
    if (signersWithoutFields.length > 0) {
      const ok = confirm(
        `Achtung: ${signersWithoutFields.length} Empfänger haben noch kein Feld (z.B. Signatur). Trotzdem senden?`,
      );
      if (!ok) return;
    }
    setSaving("send");
    try {
      // 1) Sync recipients (idempotent).
      await saveRecipients();
      // 2) Persist any pending fields.
      await persistFields();
      // 3) Distribute (this is the "Versand-Workflow").
      const r = await fetch(apiUrl(`/api/sign/document/${doc.id}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      onSent();
    } catch (e) {
      alert(`Senden fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(null);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
      {/* Top bar */}
      <div
        className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-stroke-1 bg-bg-elevated"
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
            {doc.title}
          </h1>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Felder platzieren · {fields.length} Feld
            {fields.length === 1 ? "" : "er"} · {recipients.length} Empfänger
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveRecipients()}
          disabled={saving === "recipients"}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary text-[12px] disabled:opacity-50"
        >
          {saving === "recipients" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCircle2 size={12} />
          )}
          Empfänger speichern
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={saving === "send"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-60"
          style={{ background: accent }}
        >
          {saving === "send" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Send size={12} />
          )}
          {doc.status === "DRAFT" ? "Senden" : "Erneut senden"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary"
          aria-label="Schließen"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: recipients */}
        <aside className="w-72 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
          <div className="px-3 py-2 border-b border-stroke-1 flex items-center gap-2">
            <h2 className="text-[11.5px] uppercase tracking-wide text-text-tertiary font-semibold">
              Empfänger
            </h2>
            <button
              type="button"
              onClick={addRecipient}
              className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title="Empfänger hinzufügen"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1.5">
            {recipients.length === 0 && (
              <p className="text-[11.5px] text-text-tertiary text-center mt-4">
                Noch keine Empfänger. „+" klicken oder direkt unten ergänzen.
              </p>
            )}
            {recipients.map((r, i) => {
              const c = colorFor(i);
              const active = i === activeRecipIdx;
              return (
                <div
                  key={`${r.id ?? "draft"}-${i}`}
                  onClick={() => setActiveRecipIdx(i)}
                  className={`rounded-md border p-2 cursor-pointer transition ${active ? "" : "hover:bg-bg-overlay/40"}`}
                  style={{
                    borderColor: active ? c : "var(--stroke-1, rgba(255,255,255,0.08))",
                    background: active ? `${c}18` : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: c }}
                    />
                    <input
                      className="input flex-1 text-[12px] py-1 px-1.5"
                      placeholder="Name"
                      value={r.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        patchRecipient(i, { name: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecipient(i);
                      }}
                      className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-red-400"
                      title="Entfernen"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <input
                    className="input mt-1 text-[11.5px] py-1 px-1.5 w-full"
                    placeholder="E-Mail"
                    value={r.email}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      patchRecipient(i, { email: e.target.value })
                    }
                  />
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    <select
                      className="input flex-1 text-[11px] py-0.5 px-1"
                      value={r.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        patchRecipient(i, {
                          role: e.target.value as DraftRecipient["role"],
                        })
                      }
                    >
                      <option value="SIGNER">Signiert</option>
                      <option value="APPROVER">Bestätigt</option>
                      <option value="VIEWER">Liest mit</option>
                      <option value="CC">CC</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="#"
                      className="input w-12 text-[11px] py-0.5 px-1 text-center tabular-nums"
                      value={r.signingOrder ?? ""}
                      title="Reihenfolge"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        patchRecipient(i, {
                          signingOrder: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                  <div className="mt-1 text-[10.5px] text-text-quaternary">
                    {fields.filter((f) => {
                      if (r.id != null) return f.recipientId === r.id;
                      return f.recipientId === -(i + 1);
                    }).length}{" "}
                    Feld(er)
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: PDF stage */}
        <div
          ref={stageRef}
          className="flex-1 min-w-0 bg-bg-base/60 flex flex-col"
        >
          {/* Toolbar */}
          <div className="h-10 shrink-0 px-3 border-b border-stroke-1 flex items-center gap-2 bg-bg-chrome/70">
            <button
              type="button"
              onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
              disabled={pageIdx === 0}
              className="p-1 rounded hover:bg-bg-overlay disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11.5px] text-text-secondary tabular-nums">
              Seite {pageIdx + 1} / {pageCount || "?"}
            </span>
            <button
              type="button"
              onClick={() =>
                setPageIdx((p) => Math.min(pageCount - 1, p + 1))
              }
              disabled={pageIdx >= pageCount - 1}
              className="p-1 rounded hover:bg-bg-overlay disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
            <span className="ml-auto text-[10.5px] text-text-tertiary">
              Klick &amp; Drag oder Drag-and-Drop aus der rechten Leiste
            </span>
          </div>

          {/* Canvas + overlay */}
          <div className="flex-1 min-h-0 overflow-auto flex justify-center p-6">
            {pdfError && (
              <div className="self-center max-w-md rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12.5px] p-3 leading-snug">
                {pdfError}
              </div>
            )}
            {!pdfError && (
              <PdfPage
                pdfBytes={pdfBytes}
                pageIndex={pageIdx}
                onPdfReady={(n) => {
                  setPageCount(n);
                  setLoading(false);
                }}
                onPdfError={(msg) => {
                  setPdfError(msg);
                  setLoading(false);
                }}
                pageRef={pageRef}
              >
                {/* Field overlays */}
                <div
                  className="absolute inset-0"
                  onClick={onPageClick}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onPageDrop}
                  style={{
                    cursor: draggingType ? "crosshair" : "default",
                  }}
                >
                  {fields
                    .filter((f) => f.page === pageIdx + 1)
                    .map((f, idx) => {
                      const recIdx = recipients.findIndex((r) =>
                        r.id != null
                          ? r.id === f.recipientId
                          : f.recipientId === -(recipients.indexOf(r) + 1),
                      );
                      const c =
                        recIdx >= 0 ? colorFor(recIdx) : "#888";
                      const palette =
                        FIELD_PALETTE.find((p) => p.type === f.type) ??
                        FIELD_PALETTE[0];
                      const Icon = palette.icon;
                      const globalIdx = fields.indexOf(f);
                      return (
                        <div
                          key={idx}
                          className="absolute group rounded-sm border-2 border-dashed flex items-center justify-center text-[10px] font-medium select-none"
                          style={{
                            left: `${f.pageX}%`,
                            top: `${f.pageY}%`,
                            width: `${f.pageWidth}%`,
                            height: `${f.pageHeight}%`,
                            background: `${c}33`,
                            borderColor: c,
                            color: c,
                          }}
                          title={`${palette.label} · ${recipients[recIdx]?.name || "—"}`}
                        >
                          <Icon size={11} className="mr-1 opacity-80" />
                          <span className="truncate">{palette.label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(globalIdx);
                            }}
                            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-bg-base border border-stroke-1 text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                            aria-label="Feld entfernen"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </PdfPage>
            )}
            {loading && !pdfError && (
              <div className="self-center text-text-tertiary inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-[12px]">PDF wird geladen…</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: field tray */}
        <aside className="w-60 shrink-0 border-l border-stroke-1 bg-bg-chrome flex flex-col">
          <div className="px-3 py-2 border-b border-stroke-1">
            <h2 className="text-[11.5px] uppercase tracking-wide text-text-tertiary font-semibold">
              Felder
            </h2>
            <p className="text-[10.5px] text-text-quaternary mt-0.5 leading-snug">
              In das Dokument ziehen oder klicken &amp; auf Seite klicken.
              Aktiv für:
              <span
                className="ml-1 font-medium"
                style={{ color: activeColor }}
              >
                {activeRecipient?.name || activeRecipient?.email || "—"}
              </span>
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
            {FIELD_PALETTE.map((p) => {
              const Icon = p.icon;
              const dragSelected = draggingType === p.type;
              return (
                <div
                  key={p.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-sign-field",
                      p.type,
                    );
                    setDraggingType(p.type);
                  }}
                  onDragEnd={() => setDraggingType(null)}
                  onClick={() =>
                    setDraggingType((cur) => (cur === p.type ? null : p.type))
                  }
                  className="rounded-md border p-2.5 cursor-grab active:cursor-grabbing select-none transition"
                  style={
                    dragSelected
                      ? {
                          borderColor: activeColor,
                          background: `${activeColor}18`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2 text-[12px] font-semibold">
                    <Icon size={13} style={{ color: activeColor }} />
                    {p.label}
                  </div>
                  <p className="text-[10.5px] text-text-quaternary mt-0.5 leading-snug">
                    {p.hint}
                  </p>
                </div>
              );
            })}
            {draggingType && (
              <div
                className="text-[10.5px] text-center px-2 py-1.5 rounded border"
                style={{
                  borderColor: activeColor,
                  color: activeColor,
                  background: `${activeColor}10`,
                }}
              >
                Klick auf das PDF, um zu platzieren
              </div>
            )}
          </div>
          <div className="border-t border-stroke-1 p-2.5 text-[10.5px] text-text-quaternary leading-snug">
            <strong>Versand-Workflow:</strong> Beim Klick auf „Senden"
            speichern wir Empfänger, persistieren noch nicht gespeicherte
            Felder und verteilen das Dokument per Documenso-API
            (Empfänger-Mails inkl. Signaturlink).
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── PDF page renderer (pdf.js) ───────────────────────────────────── */

function PdfPage({
  pdfBytes,
  pageIndex,
  onPdfReady,
  onPdfError,
  pageRef,
  children,
}: {
  pdfBytes: ArrayBuffer | null;
  pageIndex: number;
  onPdfReady: (pageCount: number) => void;
  onPdfError: (msg: string) => void;
  pageRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Store the loaded PDF document in a ref so re-rendering different pages
  // does not re-parse the file.
  const docRef = useRef<unknown | null>(null);
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // pdf.js ships its worker as an .mjs file; we copied it into
        // /public/pdfjs at build time.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        docRef.current = pdf;
        onPdfReady(pdf.numPages);
      } catch (e) {
        if (cancelled) return;
        onPdfError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes]);

  useEffect(() => {
    const pdf = docRef.current as
      | { getPage: (n: number) => Promise<unknown> }
      | null;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;
    void (async () => {
      try {
        type PdfPage = {
          getViewport: (opts: { scale: number }) => {
            width: number;
            height: number;
          };
          render: (params: {
            canvasContext: CanvasRenderingContext2D;
            viewport: { width: number; height: number };
          }) => { promise: Promise<void> };
        };
        const page = (await pdf.getPage(pageIndex + 1)) as PdfPage;
        const baseViewport = page.getViewport({ scale: 1 });
        const stageWidth = Math.min(900, window.innerWidth - 600); // leaves room for both rails
        const scale = stageWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Konnte 2D-Kontext nicht laden");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) {
          setRenderedSize({ w: viewport.width, h: viewport.height });
        }
      } catch (e) {
        if (!cancelled) onPdfError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pdfBytes]);

  return (
    <div className="relative shadow-2xl">
      <canvas ref={canvasRef} className="block bg-white" />
      <div
        ref={pageRef}
        className="absolute inset-0"
        style={renderedSize ? { width: renderedSize.w, height: renderedSize.h } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
