"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Folder,
  Plus,
  RefreshCw,
  Search,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  X,
  Loader2,
  Star,
} from "lucide-react";
import type {
  MailAddress,
  MailFolder,
  MailFull,
  MailListItem,
} from "@/lib/mail/types";

type ComposeState = {
  mode: "new" | "reply" | "replyAll" | "forward";
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
  /** Raw `File` objects — sent via multipart to avoid base64+JSON size limits. */
  attachments: File[];
};

const ROLE_ICON: Record<MailFolder["role"], React.ComponentType<{ size?: number }>> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  junk: AlertOctagon,
  archive: Archive,
  custom: Folder,
};

const ROLE_LABEL: Record<MailFolder["role"], string> = {
  inbox: "Posteingang",
  sent: "Gesendet",
  drafts: "Entwürfe",
  trash: "Papierkorb",
  junk: "Junk-E-Mail",
  archive: "Archiv",
  custom: "",
};

export function MailClient({
  initialFolders,
  selfEmail,
  selfName,
}: {
  initialFolders: MailFolder[];
  selfEmail: string;
  selfName?: string;
}) {
  const [folders, setFolders] = useState<MailFolder[]>(initialFolders);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string>(
    initialFolders.find((f) => f.role === "inbox")?.path ?? initialFolders[0]?.path ?? "INBOX",
  );
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeUid, setActiveUid] = useState<number | null>(null);
  const [activeMessage, setActiveMessage] = useState<MailFull | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [search, setSearch] = useState("");

  /* ------------------------------ Fetchers ------------------------------ */

  const refreshFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const r = await fetch("/api/mail/folders", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { folders: MailFolder[] };
        setFolders(j.folders);
      }
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const refreshMessages = useCallback(
    async (folder: string) => {
      setMessagesLoading(true);
      setActiveMessage(null);
      try {
        const r = await fetch(
          `/api/mail/messages?folder=${encodeURIComponent(folder)}`,
          { cache: "no-store" },
        );
        if (r.ok) {
          const j = (await r.json()) as { items: MailListItem[] };
          setMessages(j.items);
        } else {
          setMessages([]);
        }
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    refreshMessages(activeFolder);
  }, [activeFolder, refreshMessages]);

  const openMessage = useCallback(
    async (folder: string, uid: number) => {
      setActiveUid(uid);
      setMessageLoading(true);
      setActiveMessage(null);
      try {
        const r = await fetch(
          `/api/mail/message/${encodeURIComponent(folder)}/${uid}`,
          { cache: "no-store" },
        );
        if (r.ok) {
          const m = (await r.json()) as MailFull;
          setActiveMessage(m);
          // mark seen in local list immediately
          setMessages((ms) =>
            ms.map((x) =>
              x.uid === uid && x.folder === folder
                ? { ...x, flags: Array.from(new Set([...x.flags, "\\Seen"])) }
                : x,
            ),
          );
          setFolders((fs) =>
            fs.map((f) =>
              f.path === folder && f.unread > 0 && !messageWasSeen(messages, uid)
                ? { ...f, unread: f.unread - 1 }
                : f,
            ),
          );
        }
      } finally {
        setMessageLoading(false);
      }
    },
    [messages],
  );

  /* ------------------------------ Actions ------------------------------- */

  const deleteCurrent = useCallback(async () => {
    if (!activeMessage) return;
    const r = await fetch(
      `/api/mail/message/${encodeURIComponent(activeMessage.folder)}/${activeMessage.uid}`,
      { method: "DELETE" },
    );
    if (r.ok) {
      setMessages((ms) => ms.filter((m) => m.uid !== activeMessage.uid));
      setActiveMessage(null);
      setActiveUid(null);
      refreshFolders();
    }
  }, [activeMessage, refreshFolders]);

  const reply = useCallback(
    (mode: "reply" | "replyAll" | "forward") => {
      if (!activeMessage) return;
      const m = activeMessage;
      const subject =
        mode === "forward"
          ? prefixSubject(m.subject, "Fwd:")
          : prefixSubject(m.subject, "Re:");
      const to =
        mode === "forward"
          ? ""
          : addrLineFor(m.replyTo[0] ?? m.from);
      const cc =
        mode === "replyAll"
          ? [...m.to, ...m.cc]
              .filter((a) => a.address.toLowerCase() !== selfEmail.toLowerCase())
              .map(addrLine)
              .join(", ")
          : "";
      const quote = quoteBody(m);
      setCompose({
        mode,
        to,
        cc,
        bcc: "",
        subject,
        body: mode === "forward" ? `\n\n${quote}` : `\n\n${quote}`,
        inReplyTo: m.messageId ?? undefined,
        references: m.messageId ? [...m.references, m.messageId] : m.references,
        attachments: [],
      });
    },
    [activeMessage, selfEmail],
  );

  const newMessage = useCallback(() => {
    setCompose({
      mode: "new",
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      attachments: [],
    });
  }, []);

  const sendCompose = useCallback(async () => {
    if (!compose) return;
    const meta = {
      to: parseAddrLine(compose.to),
      cc: parseAddrLine(compose.cc),
      bcc: parseAddrLine(compose.bcc),
      subject: compose.subject,
      text: compose.body,
      inReplyTo: compose.inReplyTo,
      references: compose.references,
    };
    let r: Response;
    if (compose.attachments.length > 0) {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(meta));
      for (const f of compose.attachments) {
        fd.append("files", f, f.name);
      }
      r = await fetch("/api/mail/send", { method: "POST", body: fd });
    } else {
      r = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(meta),
      });
    }
    if (r.ok) {
      setCompose(null);
      refreshFolders();
      // If we replied within the same folder, the IMAP server will pick up
      // the message in Sent — refresh that view.
      refreshMessages(activeFolder);
    } else {
      const e = (await r.json().catch(() => ({}))) as { error?: string };
      alert("Senden fehlgeschlagen: " + (e.error ?? r.statusText));
    }
  }, [compose, activeFolder, refreshFolders, refreshMessages]);

  /* ------------------------------ Filtering ----------------------------- */

  const visibleMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from?.address.toLowerCase().includes(q) ||
        m.from?.name?.toLowerCase().includes(q),
    );
  }, [messages, search]);

  /* --------------------------------- UI --------------------------------- */

  return (
    <div className="flex h-full bg-bg-base text-text-primary text-[13px] overflow-hidden">
      {/* ── Folders ───────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
        <div className="p-3 border-b border-stroke-1">
          <button
            onClick={newMessage}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-[#0078d4] hover:bg-[#106ebe] text-white px-3 py-2 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Neue E-Mail
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {folders.map((f) => (
            <FolderItem
              key={f.path}
              folder={f}
              active={f.path === activeFolder}
              onClick={() => setActiveFolder(f.path)}
            />
          ))}
        </div>
        <div className="border-t border-stroke-1 p-2 text-text-tertiary text-[11px] flex items-center gap-2">
          <span className="truncate flex-1">{selfEmail}</span>
          <button
            onClick={refreshFolders}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Ordner neu laden"
          >
            {foldersLoading ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </button>
        </div>
      </aside>

      {/* ── Message List ──────────────────────────────────────────────── */}
      <section className="w-[360px] shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
        <div className="p-3 border-b border-stroke-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">
              {labelForFolder(folders, activeFolder)}
            </h2>
            <button
              onClick={() => refreshMessages(activeFolder)}
              className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title="Aktualisieren"
            >
              {messagesLoading ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder="In dieser Ansicht suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-base border border-stroke-1 rounded-md text-[12px] py-1.5 pl-7 pr-2 outline-none focus:border-stroke-2"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {messagesLoading && messages.length === 0 && (
            <div className="p-6 text-center text-text-tertiary text-xs">
              <Loader2 size={20} className="spin mx-auto mb-2" />
              Lade Nachrichten …
            </div>
          )}
          {!messagesLoading && visibleMessages.length === 0 && (
            <div className="p-6 text-center text-text-tertiary text-xs">
              {search ? "Nichts gefunden" : "Keine Nachrichten"}
            </div>
          )}
          {visibleMessages.map((m) => (
            <MessageRow
              key={`${m.folder}-${m.uid}`}
              msg={m}
              active={m.uid === activeUid}
              onClick={() => openMessage(m.folder, m.uid)}
            />
          ))}
        </div>
      </section>

      {/* ── Reader / Compose ──────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-w-0 bg-bg-base">
        {compose ? (
          <Composer
            state={compose}
            setState={setCompose}
            onSend={sendCompose}
            onCancel={() => setCompose(null)}
            selfEmail={selfEmail}
            selfName={selfName}
          />
        ) : messageLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            <Loader2 size={20} className="spin mr-2" /> Lade Nachricht …
          </div>
        ) : activeMessage ? (
          <Reader
            msg={activeMessage}
            onReply={() => reply("reply")}
            onReplyAll={() => reply("replyAll")}
            onForward={() => reply("forward")}
            onDelete={deleteCurrent}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary gap-2">
            <Inbox size={48} className="opacity-30" />
            <p className="text-sm">Wähle eine Nachricht aus</p>
          </div>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/*                                Sub-components                                */
/* --------------------------------------------------------------------------- */

function FolderItem({
  folder,
  active,
  onClick,
}: {
  folder: MailFolder;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = ROLE_ICON[folder.role];
  const label = ROLE_LABEL[folder.role] || folder.name;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? "bg-bg-overlay text-text-primary border-l-2 border-l-[#0078d4]"
          : "border-l-2 border-l-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      <Icon size={15} />
      <span className="flex-1 truncate">{label}</span>
      {folder.unread > 0 && (
        <span className="text-[11px] font-semibold text-[#0078d4]">
          {folder.unread}
        </span>
      )}
    </button>
  );
}

function MessageRow({
  msg,
  active,
  onClick,
}: {
  msg: MailListItem;
  active: boolean;
  onClick: () => void;
}) {
  const isUnread = !msg.flags.includes("\\Seen");
  const sender = msg.from?.name ?? msg.from?.address ?? "(unbekannt)";
  const date = formatDate(new Date(msg.date));
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 border-b border-stroke-1 transition-colors flex flex-col gap-0.5 ${
        active
          ? "bg-bg-overlay border-l-2 border-l-[#0078d4]"
          : "border-l-2 border-l-transparent hover:bg-bg-elevated"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex-1 truncate text-[13px] ${
            isUnread ? "font-semibold text-text-primary" : "text-text-secondary"
          }`}
        >
          {sender}
        </span>
        <span className="text-text-tertiary text-[11px] shrink-0">{date}</span>
      </div>
      <div
        className={`truncate text-[12px] ${
          isUnread ? "text-text-primary" : "text-text-secondary"
        }`}
      >
        {msg.subject || "(kein Betreff)"}
      </div>
      <div className="flex items-center gap-1.5">
        {msg.hasAttachments && <Paperclip size={11} className="text-text-tertiary" />}
        {msg.flags.includes("\\Flagged") && (
          <Star size={11} className="text-yellow-500" />
        )}
        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#0078d4]" />}
      </div>
    </button>
  );
}

function Reader({
  msg,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
}: {
  msg: MailFull;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 pt-4 pb-3 border-b border-stroke-1">
        <h1 className="text-[18px] font-semibold mb-2 text-text-primary">
          {msg.subject || "(kein Betreff)"}
        </h1>
        <div className="flex items-center gap-3">
          <Avatar name={msg.from?.name ?? msg.from?.address ?? "?"} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-text-primary">
              <span className="font-medium">
                {msg.from?.name ?? msg.from?.address}
              </span>
              {msg.from?.name && (
                <span className="text-text-tertiary ml-2 text-[12px]">
                  &lt;{msg.from.address}&gt;
                </span>
              )}
            </div>
            <div className="text-text-tertiary text-[11px] mt-0.5">
              An: {msg.to.map((a) => a.name ?? a.address).join(", ") || "—"}
              {msg.cc.length > 0 && (
                <span className="ml-2">
                  Cc: {msg.cc.map((a) => a.name ?? a.address).join(", ")}
                </span>
              )}
            </div>
          </div>
          <div className="text-text-tertiary text-[11px] whitespace-nowrap">
            {new Date(msg.date).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <ActionButton icon={Reply} label="Antworten" onClick={onReply} primary />
          <ActionButton icon={ReplyAll} label="Allen antworten" onClick={onReplyAll} />
          <ActionButton icon={Forward} label="Weiterleiten" onClick={onForward} />
          <div className="flex-1" />
          <ActionButton icon={Trash2} label="Löschen" onClick={onDelete} danger />
        </div>
        {msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {msg.attachments
              .filter((a) => !a.inline)
              .map((a) => (
                <a
                  key={a.partId}
                  href={`/api/mail/message/${encodeURIComponent(msg.folder)}/${msg.uid}/attachment/${encodeURIComponent(a.partId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-stroke-1 bg-bg-elevated text-text-secondary hover:border-stroke-2 hover:text-text-primary text-[12px] transition-colors"
                >
                  <Paperclip size={12} />
                  <span className="max-w-[200px] truncate">{a.filename}</span>
                  <span className="text-text-tertiary text-[10px]">
                    {formatBytes(a.size)}
                  </span>
                </a>
              ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 mail-body">
        {msg.bodyHtml ? (
          <div
            className="text-[14px] leading-relaxed text-text-primary"
            dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-text-primary">
            {msg.bodyText ?? "(kein Inhalt)"}
          </pre>
        )}
      </div>
    </div>
  );
}

function Composer({
  state,
  setState,
  onSend,
  onCancel,
  selfEmail,
  selfName,
}: {
  state: ComposeState;
  setState: Dispatch<SetStateAction<ComposeState | null>>;
  onSend: () => void;
  onCancel: () => void;
  selfEmail: string;
  selfName?: string;
}) {
  const [sending, setSending] = useState(false);
  const update = (patch: Partial<ComposeState>) =>
    setState((c) => (c ? { ...c, ...patch } : null));

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const items: File[] = [...state.attachments];
    for (const f of Array.from(files)) {
      if (f.size > 0) items.push(f);
    }
    update({ attachments: items });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 py-3 border-b border-stroke-1 flex items-center gap-2">
        <h1 className="text-sm font-semibold text-text-primary flex-1">
          {state.mode === "new"
            ? "Neue E-Mail"
            : state.mode === "forward"
              ? "Weiterleiten"
              : "Antworten"}
        </h1>
        <button
          onClick={async () => {
            setSending(true);
            try {
              await onSend();
            } finally {
              setSending(false);
            }
          }}
          disabled={sending || !state.to.trim()}
          className="flex items-center gap-2 rounded bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          Senden
        </button>
        <button
          onClick={onCancel}
          className="p-1.5 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Verwerfen"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-5 py-2 border-b border-stroke-1 flex flex-col gap-1.5">
        <ComposeField
          label="Von"
          value={selfName ? `${selfName} <${selfEmail}>` : selfEmail}
          readonly
        />
        <ComposeField
          label="An"
          value={state.to}
          onChange={(v) => update({ to: v })}
          placeholder="empfänger@beispiel.de, ..."
        />
        <ComposeField
          label="Cc"
          value={state.cc}
          onChange={(v) => update({ cc: v })}
        />
        <ComposeField
          label="Betreff"
          value={state.subject}
          onChange={(v) => update({ subject: v })}
        />
      </div>
      <div className="px-5 py-2 border-b border-stroke-1 flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-text-primary cursor-pointer">
          <Paperclip size={14} />
          Anhang
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        {state.attachments.map((a, i) => (
          <span
            key={`${a.name}-${a.size}-${i}`}
            className="flex items-center gap-1.5 text-[11px] bg-bg-elevated border border-stroke-1 rounded px-2 py-0.5"
          >
            {a.name} <span className="text-text-tertiary">{formatBytes(a.size)}</span>
            <button
              onClick={() =>
                update({
                  attachments: state.attachments.filter((_, j) => j !== i),
                })
              }
              className="text-text-tertiary hover:text-text-primary"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <textarea
        value={state.body}
        onChange={(e) => update({ body: e.target.value })}
        className="flex-1 px-5 py-4 bg-bg-base border-0 outline-none text-[14px] leading-relaxed text-text-primary resize-none font-sans"
        placeholder="Schreibe deine Nachricht …"
      />
    </div>
  );
}

function ComposeField({
  label,
  value,
  onChange,
  placeholder,
  readonly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readonly?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-text-tertiary text-[11px] w-12 shrink-0 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readonly}
        className={`flex-1 bg-transparent border-0 border-b border-stroke-1 focus:border-stroke-2 outline-none px-0 py-1 text-[13px] text-text-primary ${
          readonly ? "text-text-tertiary cursor-default" : ""
        }`}
      />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  danger,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
        primary
          ? "bg-[#0078d4] hover:bg-[#106ebe] text-white"
          : danger
            ? "text-text-secondary hover:bg-red-500/10 hover:text-red-400"
            : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const hue = stringHash(name) % 360;
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0"
      style={{ background: `hsl(${hue} 50% 35%)` }}
    >
      {initials}
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/*                                  helpers                                     */
/* --------------------------------------------------------------------------- */

function labelForFolder(folders: MailFolder[], path: string): string {
  const f = folders.find((x) => x.path === path);
  if (!f) return path;
  return ROLE_LABEL[f.role] || f.name;
}

function formatDate(d: Date): string {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  const week = 1000 * 60 * 60 * 24 * 6;
  if (now.getTime() - d.getTime() < week) {
    return d.toLocaleDateString("de-DE", { weekday: "short" });
  }
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function prefixSubject(subject: string, prefix: string): string {
  const re = new RegExp(`^${prefix.replace(":", "")}:?\\s*`, "i");
  return re.test(subject) ? subject : `${prefix} ${subject || "(kein Betreff)"}`;
}

function addrLine(a: MailAddress): string {
  return a.name ? `"${a.name}" <${a.address}>` : a.address;
}
function addrLineFor(a: MailAddress | null): string {
  return a ? addrLine(a) : "";
}

function parseAddrLine(line: string): MailAddress[] {
  if (!line.trim()) return [];
  return line
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
      if (m) return { name: m[1].trim(), address: m[2].trim() };
      return { address: p };
    });
}

function quoteBody(m: MailFull): string {
  const header = `Am ${new Date(m.date).toLocaleString("de-DE")} schrieb ${
    m.from?.name ?? m.from?.address ?? "Unbekannt"
  }:\n`;
  const body = (m.bodyText ?? "").split("\n").map((l) => `> ${l}`).join("\n");
  return `${header}${body}`;
}

function messageWasSeen(messages: MailListItem[], uid: number): boolean {
  return messages.find((m) => m.uid === uid)?.flags.includes("\\Seen") ?? false;
}
