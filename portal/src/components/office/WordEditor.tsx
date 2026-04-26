"use client";

import { useEffect, useMemo } from "react";
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
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";

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

  if (!editor) return null;

  return (
    <div className="h-full flex flex-col">
      <Toolbar editor={editor} accent={accent} workspaceId={workspaceId} documentPath={documentPath} />
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
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
  accent: string;
  workspaceId: WorkspaceId;
  documentPath: string;
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
    <div className="shrink-0 flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-stroke-1 bg-bg-chrome">
      <ToolGroup>
        <ToolButton
          title="Rückgängig"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={14} />
        </ToolButton>
        <ToolButton
          title="Wiederholen"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={14} />
        </ToolButton>
      </ToolGroup>

      <ToolGroup>
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

      <ToolGroup>
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

      <ToolGroup>
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

      <ToolGroup>
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

      <ToolGroup>
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

      <ToolGroup>
        <ToolButton
          title="Schriftgröße kleiner"
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

function ToolGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 pr-1.5 mr-1.5 border-r border-stroke-1 last:border-r-0">
      {children}
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
