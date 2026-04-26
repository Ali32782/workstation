"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Download,
  FileDown,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { OfficeDocument } from "@/lib/office/types";
import type { WorkspaceId } from "@/lib/workspaces";

const WordEditor = dynamic(() => import("./WordEditor").then((m) => m.WordEditor), {
  ssr: false,
  loading: () => <EditorLoading label="Word" />,
});

const ExcelEditor = dynamic(
  () => import("./ExcelEditor").then((m) => m.ExcelEditor),
  {
    ssr: false,
    loading: () => <EditorLoading label="Excel" />,
  },
);

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string };

/**
 * Top-level Office Hub editor shell. Loads the document via /api/office/load,
 * dispatches to either WordEditor (TipTap) or ExcelEditor (Univer), and
 * handles save / PDF export. Designed to be opened in a regular tab so the
 * user can keep multiple Office docs side-by-side.
 */
export function OfficeEditorPage({
  workspaceId,
  workspaceName,
  path,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  path: string;
  accent: string;
}) {
  const [doc, setDoc] = useState<OfficeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [dirty, setDirty] = useState(false);

  // Buffer the current editor state for save / PDF.
  const [wordHtml, setWordHtml] = useState<string>("");
  const [wordText, setWordText] = useState<string>("");
  const [workbook, setWorkbook] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/office/load?ws=${workspaceId}&path=${encodeURIComponent(path)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as OfficeDocument & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        setDoc(j);
        if (j.kind === "word") {
          setWordHtml(j.html);
          setWordText(j.text ?? "");
        } else if (j.kind === "excel") {
          setWorkbook(j.workbook);
        }
        setDirty(false);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path]);

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const onSave = useCallback(async () => {
    if (!doc) return;
    setSaveState({ status: "saving" });
    try {
      const payload =
        doc.kind === "word"
          ? { kind: "word", html: wordHtml, text: wordText }
          : { kind: "excel", workbook };
      const r = await fetch(
        `/api/office/save?ws=${workspaceId}&path=${encodeURIComponent(path)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSaveState({ status: "saved", at: Date.now() });
      setDirty(false);
    } catch (e) {
      setSaveState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [doc, wordHtml, wordText, workbook, workspaceId, path]);

  const onExportPdf = useCallback(async () => {
    if (!doc) return;
    const payload =
      doc.kind === "word"
        ? { kind: "word", html: wordHtml }
        : { kind: "excel", workbook };
    const name = doc.meta.name;
    try {
      const r = await fetch(
        `/api/office/export-pdf?name=${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(
        "PDF-Export fehlgeschlagen: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }, [doc, wordHtml, workbook]);

  // Cmd/Ctrl+S → save.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave]);

  if (loading) {
    return <EditorLoading label="Datei" />;
  }
  if (error || !doc) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <h1 className="text-text-primary font-semibold text-lg">
            Konnte Datei nicht öffnen
          </h1>
          <p className="text-text-secondary text-sm break-words">
            {error ?? "Unbekannter Fehler"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <button
          type="button"
          onClick={() => {
            if (
              !dirty ||
              confirm("Ungespeicherte Änderungen verwerfen und schließen?")
            ) {
              window.history.back();
            }
          }}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Zurück"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[12.5px] font-semibold leading-tight truncate">
            {doc.meta.name}
            {dirty && (
              <span className="ml-1 text-text-tertiary font-normal">•</span>
            )}
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · {doc.meta.path}
          </p>
        </div>

        <SaveIndicator state={saveState} />

        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-stroke-2 text-[11.5px]"
          title="Als PDF exportieren"
        >
          <FileDown size={12} /> PDF
        </button>
        <a
          href={`/api/cloud/download?ws=${workspaceId}&path=${encodeURIComponent(
            path,
          )}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stroke-1 bg-bg-elevated hover:border-stroke-2 text-[11.5px]"
          title="Original herunterladen"
        >
          <Download size={12} /> Original
        </a>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState.status === "saving"}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white text-[11.5px] font-medium disabled:opacity-50"
          style={{ background: accent }}
          title="Speichern (Ctrl/Cmd+S)"
        >
          {saveState.status === "saving" ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <Save size={12} />
          )}
          Speichern
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {doc.kind === "word" && (
          <WordEditor
            initialHtml={wordHtml}
            accent={accent}
            workspaceId={workspaceId}
            documentPath={path}
            onChange={(html, text) => {
              setWordHtml(html);
              setWordText(text);
              setDirty(true);
            }}
          />
        )}
        {doc.kind === "excel" && workbook != null && (
          <ExcelEditor
            initialWorkbook={workbook}
            onChange={(wb) => {
              setWorkbook(wb);
              setDirty(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === "saving") {
    return (
      <span className="text-[11px] text-text-tertiary inline-flex items-center gap-1">
        <Loader2 size={11} className="spin" /> Speichere…
      </span>
    );
  }
  if (state.status === "saved") {
    return (
      <span className="text-[11px] text-emerald-500 inline-flex items-center gap-1">
        <CheckCircle2 size={11} /> Gespeichert
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <span
        className="text-[11px] text-red-500 inline-flex items-center gap-1 max-w-[260px] truncate"
        title={state.message}
      >
        <AlertCircle size={11} /> {state.message}
      </span>
    );
  }
  return null;
}

function EditorLoading({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-text-tertiary text-[12px] gap-2">
      <Loader2 size={16} className="spin" /> Lade {label}-Editor…
    </div>
  );
}
