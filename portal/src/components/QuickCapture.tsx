"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, StickyNote, Loader2, Save } from "lucide-react";

/**
 * Quick-Capture floating action button.
 *
 * Persistent „+" in the bottom-right of every workspace page. Clicking
 * opens a tiny composer that drops the note into localStorage as
 * `corehub:quick-notes` so it survives reloads but doesn't ping the
 * backend. The user gets a friction-free way to jot a thought without
 * losing context — moving the captured note into a real Twenty note
 * or Plane issue is a follow-up step.
 *
 * Storage shape (per workspace):
 *   [
 *     { id: string, ts: ISO, body: string, kind: "note" }
 *   ]
 *
 * Future: voice-capture (mediaRecorder → Whisper) and photo-capture
 * (camera input) will reuse this same dropdown.
 */
export function QuickCapture({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const STORAGE_KEY = `corehub:quick-notes:${workspaceId}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCount((JSON.parse(raw) as unknown[]).length);
    } catch {
      // ignored
    }
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => ref.current?.focus());
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl + Shift + N opens the capture composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const list: Array<{ id: string; ts: string; body: string; kind: string }> =
        raw ? JSON.parse(raw) : [];
      list.unshift({
        id: `qn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date().toISOString(),
        body,
        kind: "note",
      });
      // Cap at 200 entries — beyond that the user really should be
      // moving these into a real CRM note / Plane issue.
      const capped = list.slice(0, 200);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
      setCount(capped.length);
      setDraft("");
      setOpen(false);
    } catch {
      // Silent — quota errors are extremely rare for ~200 short notes.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Quick-Capture öffnen"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 print:hidden"
        title={`Quick-Capture (⌘⇧N) · ${count} Notizen`}
      >
        {open ? <X size={20} /> : <Plus size={22} />}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-bg-elevated border border-stroke-1 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-stroke-1 flex items-center gap-2">
            <StickyNote size={14} className="text-fuchsia-400" />
            <h3 className="text-[12.5px] font-semibold text-text-primary">
              Quick-Capture
            </h3>
            <span className="ml-auto text-[10.5px] text-text-quaternary">
              {count} gespeichert
            </span>
          </div>
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Was willst du dir merken?"
            className="w-full px-3 py-2 bg-transparent border-0 outline-none text-[13px] resize-none min-h-[100px] text-text-primary placeholder:text-text-tertiary"
          />
          <div className="px-3 py-2 border-t border-stroke-1 flex items-center justify-between">
            <span className="text-[10px] text-text-quaternary">
              ⌘↩ speichern · Esc abbrechen
            </span>
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 text-[11.5px] font-medium disabled:opacity-40"
            >
              {busy ? <Loader2 size={11} className="spin" /> : <Save size={11} />}
              Speichern
            </button>
          </div>
        </div>
      )}
    </>
  );
}
