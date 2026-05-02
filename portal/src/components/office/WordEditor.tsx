"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Quote,
  Code,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Type,
  RemoveFormatting,
  PenLine,
  Search,
  Mails,
  X,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import { CRM_MERGE_TOKENS } from "@/lib/office/merge-tokens";

/**
 * TipTap-based Word-style editor. Provides a Word-ish toolbar (formatting,
 * lists, alignment, headings, tables, images, link, highlight) and emits
 * HTML + plain-text on each change so the parent can debounce + persist.
 *
 * Image upload routes through the existing Nextcloud cloud-upload endpoint
 * so images live next to the document on disk.
 */
export function WordEditor({
  initialHtml,
  accent,
  workspaceId,
  documentPath,
  onChange,
}: {
  initialHtml: string;
  accent: string;
  workspaceId: WorkspaceId;
  documentPath: string;
  onChange: (html: string, text: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml || "<p></p>",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
    editorProps: {
      attributes: {
        class:
          "office-doc max-w-[820px] mx-auto bg-bg-base text-text-primary px-12 py-12 outline-none min-h-[100%] shadow-md rounded-sm",
        spellCheck: "true",
      },
    },
  });

  // When the file is reloaded externally, sync editor content.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === initialHtml) return;
    editor.commands.setContent(initialHtml || "<p></p>", false);
  }, [initialHtml, editor]);

  /* ── Find & Replace ──────────────────────────────────────────────── */
  const [findOpen, setFindOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Cmd/Ctrl+F should open the find bar. We bind globally — but only
  // capture when the editor is focused, so the rest of the portal's
  // search affordances aren't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "f" && k !== "h") return;
      const active = document.activeElement as HTMLElement | null;
      const inEditor =
        active?.classList.contains("office-doc") ||
        active?.closest?.(".office-doc") != null;
      if (!inEditor) return;
      e.preventDefault();
      setFindOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!editor) return null;

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        editor={editor}
        accent={accent}
        workspaceId={workspaceId}
        documentPath={documentPath}
        onOpenFind={() => setFindOpen(true)}
        onOpenMerge={() => setMergeOpen(true)}
      />
      {mergeOpen && (
        <MailMergeDialog
          editor={editor}
          workspaceId={workspaceId}
          onClose={() => setMergeOpen(false)}
        />
      )}
      {findOpen && (
        <FindReplaceBar
          editor={editor}
          onClose={() => {
            setFindOpen(false);
            editor.commands.focus();
          }}
        />
      )}
      <div className="flex-1 min-h-0 overflow-auto bg-bg-elevated/40 py-6">
        <EditorContent editor={editor} className="h-full" />
      </div>
      <style jsx global>{`
        .office-doc {
          font-family: "Calibri", "Segoe UI", system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.55;
        }
        .office-doc h1 { font-size: 28px; font-weight: 700; margin: 1.2em 0 0.4em; }
        .office-doc h2 { font-size: 22px; font-weight: 600; margin: 1.0em 0 0.4em; }
        .office-doc h3 { font-size: 18px; font-weight: 600; margin: 0.8em 0 0.3em; }
        .office-doc h4 { font-size: 16px; font-weight: 600; margin: 0.6em 0 0.3em; }
        .office-doc p  { margin: 0.4em 0; }
        .office-doc ul, .office-doc ol { padding-left: 1.5em; }
        .office-doc blockquote { border-left: 3px solid currentColor; padding-left: 1em; opacity: 0.85; }
        .office-doc table { border-collapse: collapse; margin: 0.6em 0; min-width: 360px; }
        .office-doc th, .office-doc td { border: 1px solid var(--stroke-1, #444); padding: 4px 8px; min-width: 60px; }
        .office-doc th { background: var(--bg-elevated, #2a2c33); font-weight: 600; }
        .office-doc img { max-width: 100%; height: auto; }
        .office-doc mark { padding: 0 2px; border-radius: 2px; }
        .office-doc a { color: #5b9eff; text-decoration: underline; }
        .office-doc ul[data-type="taskList"] { list-style: none; padding-left: 0.4em; }
        .office-doc ul[data-type="taskList"] li { display: flex; gap: 0.4em; align-items: flex-start; }
        .office-doc .signature-field {
          display: inline-block;
          padding: 4px 10px;
          border: 2px dashed currentColor;
          border-radius: 4px;
          background: rgba(91, 95, 199, 0.08);
          font-size: 0.85em;
          color: rgb(91, 95, 199);
          margin: 0 4px;
          min-width: 140px;
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Toolbar                                  */
/* ─────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Toolbar({
  editor,
  accent,
  workspaceId,
  documentPath,
  onOpenFind,
  onOpenMerge,
}: {
  editor: Editor;
  accent: string;
  workspaceId: WorkspaceId;
  documentPath: string;
  onOpenFind: () => void;
  onOpenMerge: () => void;
}) {
  const dir = useMemo(() => {
    const p = documentPath.split("/");
    p.pop();
    return p.join("/") || "/";
  }, [documentPath]);

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("files", file, file.name);
    const r = await fetch(
      `/api/cloud/upload?ws=${workspaceId}&dir=${encodeURIComponent(dir)}`,
      { method: "POST", body: fd },
    );
    if (!r.ok) return null;
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    return `/api/cloud/download?ws=${workspaceId}&path=${encodeURIComponent(
      dir + "/" + safeName,
    )}&inline=1`;
  }

  return (
    <div className="shrink-0 flex flex-wrap items-stretch gap-0 px-2 border-b border-stroke-1 bg-bg-chrome min-h-9">
      <ToolGroup label="Verlauf">
        <ToolButton
          title="Rückgängig (Cmd/Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={14} />
        </ToolButton>
        <ToolButton
          title="Wiederholen (Cmd/Ctrl+Shift+Z)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Stil">
        <select
          aria-label="Stil"
          className="text-[11.5px] bg-bg-elevated border border-stroke-1 rounded px-1.5 py-1 outline-none"
          value={
            editor.isActive("heading", { level: 1 })
              ? "h1"
              : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                  ? "h3"
                  : editor.isActive("heading", { level: 4 })
                    ? "h4"
                    : "p"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 })
                .run();
          }}
        >
          <option value="p">Standard</option>
          <option value="h1">Überschrift 1</option>
          <option value="h2">Überschrift 2</option>
          <option value="h3">Überschrift 3</option>
          <option value="h4">Überschrift 4</option>
        </select>
      </ToolGroup>

      <ToolGroup label="Start">
        <ToolButton
          title="Fett"
          active={editor.isActive("bold")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolButton>
        <ToolButton
          title="Kursiv"
          active={editor.isActive("italic")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolButton>
        <ToolButton
          title="Unterstrichen"
          active={editor.isActive("underline")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </ToolButton>
        <ToolButton
          title="Durchgestrichen"
          active={editor.isActive("strike")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolButton>
        <ToolButton
          title="Markieren"
          active={editor.isActive("highlight")}
          accent={accent}
          onClick={() =>
            editor.chain().focus().toggleHighlight({ color: "#fff59d" }).run()
          }
        >
          <Highlighter size={14} />
        </ToolButton>
        <ToolButton
          title="Inline-Code"
          active={editor.isActive("code")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={14} />
        </ToolButton>
        <ToolButton
          title="Formatierung entfernen"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Listen">
        <ToolButton
          title="Aufzählung"
          active={editor.isActive("bulletList")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolButton>
        <ToolButton
          title="Nummerierung"
          active={editor.isActive("orderedList")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolButton>
        <ToolButton
          title="Aufgabenliste"
          active={editor.isActive("taskList")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks size={14} />
        </ToolButton>
        <ToolButton
          title="Zitat"
          active={editor.isActive("blockquote")}
          accent={accent}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Ausrichtung">
        <ToolButton
          title="Linksbündig"
          active={editor.isActive({ textAlign: "left" })}
          accent={accent}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={14} />
        </ToolButton>
        <ToolButton
          title="Zentriert"
          active={editor.isActive({ textAlign: "center" })}
          accent={accent}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={14} />
        </ToolButton>
        <ToolButton
          title="Rechtsbündig"
          active={editor.isActive({ textAlign: "right" })}
          accent={accent}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={14} />
        </ToolButton>
        <ToolButton
          title="Blocksatz"
          active={editor.isActive({ textAlign: "justify" })}
          accent={accent}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Einfügen">
        <ToolButton
          title="Link einfügen"
          active={editor.isActive("link")}
          accent={accent}
          onClick={() => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = prompt("URL:", prev ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
            } else {
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
            }
          }}
        >
          <LinkIcon size={14} />
        </ToolButton>
        <ToolButton
          title="Bild einfügen"
          onClick={() => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.onchange = async () => {
              const f = inp.files?.[0];
              if (!f) return;
              const url = await uploadImage(f);
              if (url) editor.chain().focus().setImage({ src: url }).run();
              else alert("Bild-Upload fehlgeschlagen.");
            };
            inp.click();
          }}
        >
          <ImageIcon size={14} />
        </ToolButton>
        <ToolButton
          title="Tabelle einfügen (3×3)"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon size={14} />
        </ToolButton>
        <ToolButton
          title="Signatur-Feld einfügen"
          onClick={() => {
            const label = prompt(
              'Beschriftung des Signatur-Felds (z.B. „Auftraggeber"):',
              "Unterschrift",
            );
            if (label === null) return;
            editor
              .chain()
              .focus()
              .insertContent(
                `<span class="signature-field" data-signature="1" data-label="${escapeAttr(
                  label,
                )}">✎ ${escapeHtml(label)}</span>&nbsp;`,
              )
              .run();
          }}
        >
          <PenLine size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Schrift">
        <ToolButton
          title="Schriftgröße"
          onClick={() => {
            // Wrap selection in <span style="font-size">; we don't have a font-size mark
            // by default, so we use a simple HTML insert.
            const size = prompt("Schriftgröße in pt (8–48):", "14");
            if (!size) return;
            const n = Number(size);
            if (Number.isFinite(n) && n >= 6 && n <= 96) {
              const sel = editor.state.selection;
              if (sel.empty) return;
              const text = editor.state.doc.textBetween(sel.from, sel.to, " ");
              editor
                .chain()
                .focus()
                .insertContent(
                  `<span style="font-size:${n}px">${escapeHtml(text)}</span>`,
                )
                .run();
            }
          }}
        >
          <Type size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Suchen">
        <ToolButton
          title="Suchen / Ersetzen (Cmd/Ctrl+F)"
          onClick={onOpenFind}
        >
          <Search size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup label="Mail-Merge">
        <ToolButton
          title="Serienbrief: aus CRM-Firmen Briefe generieren"
          onClick={onOpenMerge}
        >
          <Mails size={14} />
        </ToolButton>
      </ToolGroup>

      <div className="ml-auto flex items-center gap-2 text-[10.5px] text-text-tertiary pr-1">
        <span title="Wörter">
          {editor.storage.characterCount?.words?.() ??
            (editor.getText() ?? "").split(/\s+/).filter(Boolean).length}{" "}
          Wörter
        </span>
        <Heading1 size={11} className="opacity-0 hidden" />
        <Heading2 size={11} className="opacity-0 hidden" />
        <Heading3 size={11} className="opacity-0 hidden" />
      </div>
    </div>
  );
}

function ToolGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch px-2 py-1 border-r border-stroke-1 last:border-r-0">
      <div className="flex items-center gap-0.5 flex-1">{children}</div>
      {label ? (
        <span className="text-text-quaternary text-[9px] uppercase tracking-wide leading-tight pt-0.5">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  title,
  active,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`p-1.5 rounded ${
        active
          ? "text-text-primary"
          : "text-text-tertiary hover:text-text-primary hover:bg-bg-overlay"
      } disabled:opacity-30 disabled:hover:bg-transparent`}
      style={active && accent ? { background: `${accent}25` } : undefined}
    >
      {children}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                             Find & Replace                              */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Find every occurrence of `query` in the TipTap document and return
 * their absolute positions. We walk text nodes once, building a flat
 * string + a parallel position array so a string `indexOf` loop
 * resolves cleanly to ProseMirror positions. Linear in document size.
 */
function findMatches(
  editor: Editor,
  query: string,
  caseSensitive: boolean,
): { from: number; to: number }[] {
  if (!query) return [];
  const positions: number[] = [];
  let buf = "";
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const text = caseSensitive ? node.text : node.text.toLowerCase();
    for (let i = 0; i < text.length; i++) {
      buf += text[i];
      positions.push(pos + i);
    }
    return false;
  });
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: { from: number; to: number }[] = [];
  let i = 0;
  while ((i = buf.indexOf(needle, i)) !== -1) {
    const from = positions[i] ?? -1;
    const to = (positions[i + needle.length - 1] ?? -1) + 1;
    if (from >= 0 && to >= 0) matches.push({ from, to });
    i += Math.max(needle.length, 1);
  }
  return matches;
}

function FindReplaceBar({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Clear the success/empty status when the user starts typing again.
  useEffect(() => setStatus(""), [query, replace]);

  const matches = useMemo(
    () => findMatches(editor, query, caseSensitive),
    [editor, query, caseSensitive],
  );

  // Keep the visible "x / y" counter sane when matches shrink.
  useEffect(() => {
    if (matchIdx >= matches.length) setMatchIdx(0);
  }, [matchIdx, matches.length]);

  const goTo = useCallback(
    (idx: number) => {
      if (matches.length === 0) return;
      const wrapped = ((idx % matches.length) + matches.length) % matches.length;
      setMatchIdx(wrapped);
      const m = matches[wrapped]!;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: m.from, to: m.to })
        .scrollIntoView()
        .run();
    },
    [editor, matches],
  );

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0 || !query) return;
    const m = matches[matchIdx]!;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: m.from, to: m.to })
      .insertContent(replace)
      .run();
    setStatus("Ersetzt.");
    // After replacement, positions of later matches shift; we rerun the
    // search by waiting for the editor's update cycle (matches memo
    // re-derives) and let the caret naturally land on the next match.
    requestAnimationFrame(() => goTo(matchIdx));
  }, [editor, goTo, matchIdx, matches, query, replace]);

  const replaceAll = useCallback(() => {
    if (!query) return;
    let count = 0;
    // We splice from the *end* of the doc to avoid recomputing positions
    // after each replacement: replacing later text first means earlier
    // match positions don't shift.
    const ms = matches.slice().reverse();
    if (ms.length === 0) {
      setStatus("Keine Treffer.");
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        for (const m of ms) {
          tr.insertText(replace, m.from, m.to);
          count += 1;
        }
        return true;
      })
      .run();
    setStatus(`${count} Ersetzung${count === 1 ? "" : "en"}.`);
  }, [editor, matches, query, replace]);

  return (
    <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2 px-3 py-1.5">
      <Search size={13} className="text-text-tertiary" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Suchen…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goTo(matchIdx - 1);
            else goTo(matchIdx + 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="px-2 py-1 text-[11.5px] bg-bg-base border border-stroke-1 rounded outline-none w-[200px]"
      />
      <input
        type="text"
        value={replace}
        placeholder="Ersetzen durch…"
        onChange={(e) => setReplace(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            replaceCurrent();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="px-2 py-1 text-[11.5px] bg-bg-base border border-stroke-1 rounded outline-none w-[200px]"
      />
      <label className="flex items-center gap-1 text-[10.5px] text-text-tertiary cursor-pointer">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
          className="accent-[#5b5fc7]"
        />
        Aa
      </label>
      <span className="text-[10.5px] text-text-tertiary tabular-nums w-12 text-center">
        {matches.length === 0 ? "0/0" : `${matchIdx + 1}/${matches.length}`}
      </span>
      <button
        type="button"
        onClick={() => goTo(matchIdx - 1)}
        title="Vorheriger Treffer (Shift+Enter)"
        className="px-1.5 py-1 rounded text-text-secondary hover:bg-bg-overlay text-[10.5px]"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => goTo(matchIdx + 1)}
        title="Nächster Treffer (Enter)"
        className="px-1.5 py-1 rounded text-text-secondary hover:bg-bg-overlay text-[10.5px]"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={replaceCurrent}
        className="px-2 py-1 rounded text-[11px] bg-bg-base hover:bg-bg-overlay text-text-secondary"
      >
        Ersetzen
      </button>
      <button
        type="button"
        onClick={replaceAll}
        className="px-2 py-1 rounded text-[11px] bg-[#5b5fc7] text-white hover:opacity-90"
      >
        Alle ersetzen
      </button>
      {status && (
        <span className="text-[10.5px] text-text-tertiary">{status}</span>
      )}
      <button
        type="button"
        onClick={onClose}
        title="Schließen (Esc)"
        className="ml-auto p-1 rounded text-text-tertiary hover:bg-bg-overlay"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Mail-Merge                                  */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Mail-Merge-Dialog: serialisiert das aktuelle TipTap-HTML als
 * Template, lässt User Empfänger wählen (alle Firmen oder explizit),
 * triggert /api/office/word-merge und triggert den Download eines
 * ZIPs aus dem Browser.  Halt die UI bewusst minimal — Power-Features
 * (CSV-Upload als Datenquelle, Filter-Builder) kommen separat.
 */
function MailMergeDialog({
  editor,
  workspaceId,
  onClose,
}: {
  editor: Editor;
  workspaceId: WorkspaceId;
  onClose: () => void;
}) {
  type Company = {
    id: string;
    name: string;
    city?: string | null;
    domain?: string | null;
  };
  const [scope, setScope] = useState<"selection" | "all">("selection");
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<
    Array<{ companyId: string; companyName: string; html: string }> | null
  >(null);
  const [usedTokens, setUsedTokens] = useState<string[] | null>(null);
  const [done, setDone] = useState<{ count: number; size: number } | null>(
    null,
  );

  // Lazy-load companies on mount.
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

  const toggleAll = () => {
    if (filtered.every((c) => picked.has(c.id))) {
      const next = new Set(picked);
      for (const c of filtered) next.delete(c.id);
      setPicked(next);
    } else {
      const next = new Set(picked);
      for (const c of filtered) next.add(c.id);
      setPicked(next);
    }
  };

  const submit = async (preview: boolean) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const templateHtml: string = editor.getHTML();
      const body = {
        templateHtml,
        scope: scope === "all" ? "all" : "ids",
        companyIds: scope === "all" ? [] : Array.from(picked),
        preview,
        limit: 200,
      };
      const r = await fetch(
        `/api/office/word-merge?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      if (preview) {
        const j = (await r.json()) as {
          previews?: typeof previews;
          tokens?: string[];
        };
        setPreviews(j.previews ?? []);
        setUsedTokens(j.tokens ?? []);
      } else {
        const buf = await r.arrayBuffer();
        const blob = new Blob([buf], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cd = r.headers.get("Content-Disposition") ?? "";
        const m = /filename="([^"]+)"/.exec(cd);
        a.download = m?.[1] ?? "mail-merge.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setDone({
          count: Number(r.headers.get("X-Merge-Count") ?? 0),
          size: buf.byteLength,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const insertToken = (token: string) => {
    editor
      .chain()
      .focus()
      .insertContent(`{{${token}}}`)
      .run();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] rounded-lg border border-stroke-1 bg-bg-chrome shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-2.5 border-b border-stroke-1 flex items-center gap-2">
          <Mails size={14} className="text-info" />
          <h3 className="text-[12.5px] font-semibold flex-1">
            Serienbrief aus CRM
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary"
          >
            <X size={13} />
          </button>
        </header>
        <div className="flex-1 min-h-0 grid grid-cols-[260px,1fr] divide-x divide-stroke-1">
          <aside className="p-3 overflow-y-auto">
            <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1.5">
              Variablen
            </h4>
            <p className="text-[11px] text-text-tertiary mb-2 leading-relaxed">
              Klick fügt den Token an der Cursor-Position ins Dokument
              ein. Filter:{" "}
              <code className="text-[10px] bg-bg-base px-1 rounded">
                {"{{company.name | upper}}"}
              </code>
            </p>
            <ul className="flex flex-col gap-0.5">
              {CRM_MERGE_TOKENS.map((t) => (
                <li key={t.token}>
                  <button
                    type="button"
                    onClick={() => insertToken(t.token)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-bg-overlay text-[11.5px]"
                  >
                    <code className="text-info text-[11px]">
                      {`{{${t.token}}}`}
                    </code>
                    <p className="text-[10.5px] text-text-tertiary leading-tight mt-0.5">
                      {t.description}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {usedTokens && (
              <div className="mt-3 pt-3 border-t border-stroke-1">
                <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1.5">
                  Im Dokument verwendet
                </h4>
                <div className="flex flex-wrap gap-1">
                  {usedTokens.length === 0 ? (
                    <span className="text-[11px] text-text-tertiary">
                      Keine Variablen erkannt.
                    </span>
                  ) : (
                    usedTokens.map((t) => (
                      <span
                        key={t}
                        className="text-[10.5px] px-1.5 py-0.5 rounded bg-info/10 text-info"
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </aside>

          <main className="p-3 flex flex-col min-h-0">
            <div className="mb-2 flex items-center gap-2 text-[12px]">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={scope === "selection"}
                  onChange={() => setScope("selection")}
                />
                Auswahl ({picked.size})
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                Alle Firmen (max. 200)
              </label>
              <input
                type="search"
                placeholder="Suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={scope === "all"}
                className="ml-auto bg-bg-base border border-stroke-1 rounded px-2 py-1 text-[12px] outline-none focus:border-info disabled:opacity-50 w-[180px]"
              />
            </div>
            {scope === "selection" ? (
              <div className="flex-1 min-h-0 overflow-y-auto border border-stroke-1 rounded-md">
                {companies === null ? (
                  <div className="flex items-center justify-center h-32 text-text-tertiary text-[12px]">
                    Lade Firmen…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-4 text-[12px] text-text-tertiary">
                    Keine Firmen gefunden.
                  </p>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-bg-chrome z-[1]">
                      <tr>
                        <th className="text-left font-medium px-2 py-1.5 w-[26px]">
                          <input
                            type="checkbox"
                            checked={
                              filtered.length > 0 &&
                              filtered.every((c) => picked.has(c.id))
                            }
                            onChange={toggleAll}
                            title="Sichtbare auswählen"
                          />
                        </th>
                        <th className="text-left font-medium px-2 py-1.5">
                          Name
                        </th>
                        <th className="text-left font-medium px-2 py-1.5">
                          Ort
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => {
                        const sel = picked.has(c.id);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => {
                              const next = new Set(picked);
                              if (sel) next.delete(c.id);
                              else next.add(c.id);
                              setPicked(next);
                            }}
                            className={`cursor-pointer border-t border-stroke-1/60 ${
                              sel ? "bg-info/10" : "hover:bg-bg-overlay"
                            }`}
                          >
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={sel}
                                readOnly
                              />
                            </td>
                            <td className="px-2 py-1.5 truncate">{c.name}</td>
                            <td className="px-2 py-1.5 text-text-tertiary">
                              {c.city ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-text-tertiary px-2 py-3 border border-stroke-1 rounded-md">
                Es werden bis zu 200 Firmen aus dem CRM gerendert (sortiert
                nach Name). Brauchst du mehr Kontrolle, wechsle auf
                „Auswahl".
              </p>
            )}

            {previews && previews.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stroke-1">
                <h4 className="text-[10.5px] uppercase tracking-wide text-text-tertiary font-medium mb-1.5">
                  Vorschau (erste {previews.length})
                </h4>
                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto">
                  {previews.map((p) => (
                    <div
                      key={p.companyId}
                      className="rounded border border-stroke-1 bg-bg-base p-2"
                    >
                      <p className="text-[11px] font-medium text-text-primary mb-1">
                        {p.companyName}
                      </p>
                      <div
                        className="prose prose-sm prose-invert text-[11px] max-w-none"
                        dangerouslySetInnerHTML={{ __html: p.html }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="mt-2 text-[11.5px] text-red-400">{error}</p>
            )}
            {done && (
              <p className="mt-2 text-[11.5px] text-success">
                {done.count} Briefe erstellt · {(done.size / 1024).toFixed(1)}{" "}
                KB ZIP heruntergeladen.
              </p>
            )}

            <footer className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px]"
              >
                Schließen
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  (scope === "selection" && picked.size === 0)
                }
                onClick={() => void submit(true)}
                className="px-3 py-1.5 rounded-md border border-stroke-1 text-text-primary text-[11.5px] hover:bg-bg-overlay disabled:opacity-50"
              >
                Vorschau
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  (scope === "selection" && picked.size === 0)
                }
                onClick={() => void submit(false)}
                className="px-3 py-1.5 rounded-md bg-info text-white text-[11.5px] font-medium hover:bg-info/90 disabled:opacity-50"
              >
                {busy ? "Generiere…" : "Serienbrief erstellen"}
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
