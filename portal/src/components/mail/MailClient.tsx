"use client";
import Link from "next/link";
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
  GitBranch,
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
  Settings as SettingsIcon,
  Sparkles,
  Kanban,
  Clock,
} from "lucide-react";
import type {
  MailAddress,
  MailFolder,
  MailFull,
  MailListItem,
} from "@/lib/mail/types";
import {
  groupAndSortThreads,
  normMessageId,
  peersInSameThread,
} from "@/lib/mail/thread-utils";
import { useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";
import { useResizableWidth, ResizeHandle } from "@/components/ui/resizable";

const ROLE_LABEL_KEY: Record<MailFolder["role"], keyof Messages | null> = {
  inbox: "mail.folder.inbox",
  sent: "mail.folder.sent",
  drafts: "mail.folder.drafts",
  trash: "mail.folder.trash",
  junk: "mail.folder.spam",
  archive: "mail.folder.archive",
  custom: null,
};

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

type TriageBucket = "urgent" | "needs-action" | "fyi" | "spam";
type TriageVerdict = { bucket: TriageBucket; reason: string };

const TRIAGE_META: Record<
  TriageBucket,
  { label: string; chipClass: string; dotClass: string; emoji: string }
> = {
  "urgent": {
    label: "Heute",
    chipClass: "bg-red-500/15 text-red-300 border-red-500/30",
    dotClass: "bg-red-400",
    emoji: "!",
  },
  "needs-action": {
    label: "Antworten",
    chipClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dotClass: "bg-amber-400",
    emoji: "↩",
  },
  "fyi": {
    label: "Info",
    chipClass: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    dotClass: "bg-sky-400",
    emoji: "i",
  },
  "spam": {
    label: "Rauschen",
    chipClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 line-through opacity-70",
    dotClass: "bg-zinc-500",
    emoji: "—",
  },
};

function triageKey(folder: string, uid: number): string {
  return `${folder}#${uid}`;
}

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
  workspaceId,
}: {
  initialFolders: MailFolder[];
  selfEmail: string;
  selfName?: string;
  workspaceId: string;
}) {
  const t = useT();
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

  // AI-Triage: keyed by `${folder}#${uid}`. We store the verdict per-message
  // so re-running on a refreshed list keeps stale verdicts visible while the
  // model thinks (avoids a flicker back to "no chip"). Filter is "all" by
  // default; the user can pin to a single bucket via the toolbar chips.
  const [triage, setTriage] = useState<Record<string, TriageVerdict>>({});
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [triageFilter, setTriageFilter] = useState<TriageBucket | "all">("all");

  /** Bulk selection `${folder}#${uid}` — gleicher Schlüssel wie triage/triageKey. */
  const [bulkKeys, setBulkKeys] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Resizable column widths — persisted per browser. Folder rail and message
  // list both have a generous range so users can give either column more room
  // when subjects get long. The reading pane just absorbs the rest (flex-1).
  const folderResize = useResizableWidth({
    storageKey: "mail:folders",
    defaultWidth: 240,
    min: 180,
    max: 360,
  });
  const listResize = useResizableWidth({
    storageKey: "mail:list",
    defaultWidth: 360,
    min: 280,
    max: 560,
  });

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

  // Snooze-wake poller. Hits /api/mail/snooze (GET) on mount and then
  // every 60 s while the tab is foregrounded. The endpoint moves any
  // overdue snoozed messages back into INBOX. We refresh folders on
  // a non-zero `woken` count so the inbox unread badge updates without
  // a manual refresh.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/mail/snooze", {
          method: "GET",
          cache: "no-store",
        });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { woken?: number };
        if ((j.woken ?? 0) > 0 && !cancelled) {
          await refreshFolders();
          await refreshMessages(activeFolder);
        }
      } catch {
        // Ignore — wake will retry on the next interval.
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refreshFolders, refreshMessages, activeFolder]);

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

  const handleSnoozed = useCallback(
    (_wakeAt: Date) => {
      // The IMAP move already happened server-side — drop the message
      // from the visible list and reset the active selection. The
      // folder counts will update on the next poll.
      if (!activeMessage) return;
      setMessages((ms) => ms.filter((m) => m.uid !== activeMessage.uid));
      setActiveMessage(null);
      setActiveUid(null);
      refreshFolders();
    },
    [activeMessage, refreshFolders],
  );

  const reply = useCallback(
    (
      mode: "reply" | "replyAll" | "forward",
      aiPrefill?: { subject?: string; body?: string },
    ) => {
      if (!activeMessage) return;
      const m = activeMessage;
      const subject =
        aiPrefill?.subject?.trim() ||
        (mode === "forward"
          ? prefixSubject(m.subject, "Fwd:")
          : prefixSubject(m.subject, "Re:"));
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
      const body = aiPrefill?.body
        ? `${aiPrefill.body}\n\n${quote}`
        : mode === "forward"
          ? `\n\n${quote}`
          : `\n\n${quote}`;
      setCompose({
        mode,
        to,
        cc,
        bcc: "",
        subject,
        body,
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

  // Deeplink-Compose: another module (CRM, Helpdesk, …) can open mail
  // with a pre-filled draft via `?compose=1&to=…&subject=…&body=…`.
  // We trigger this once on mount; further navigation clears the params
  // so refreshing the page doesn't duplicate the compose window.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("compose") !== "1") return;
    setCompose({
      mode: "new",
      to: params.get("to") ?? "",
      cc: params.get("cc") ?? "",
      bcc: params.get("bcc") ?? "",
      subject: params.get("subject") ?? "",
      body: params.get("body") ?? "",
      attachments: [],
    });
    // Strip the compose-related params from the URL so the deep-link
    // doesn't re-fire on a soft reload.
    const url = new URL(window.location.href);
    ["compose", "to", "cc", "bcc", "subject", "body"].forEach((k) =>
      url.searchParams.delete(k),
    );
    window.history.replaceState({}, "", url.pathname + (url.search ? "?" + url.searchParams : ""));
  }, []);

  // Liste filtern nach Stichwort (z.B. `@domain`) — anderer Teil des Portals kann
  // `/mail?q=…` öffnen (CRM Company Hub).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("q")?.trim();
    if (!raw) return;
    setSearch(raw);
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    const qs = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      url.pathname + (qs ? "?" + qs : ""),
    );
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
    let list = messages;
    if (triageFilter !== "all") {
      list = list.filter(
        (m) => triage[triageKey(m.folder, m.uid)]?.bucket === triageFilter,
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.from?.address.toLowerCase().includes(q) ||
          m.from?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [messages, search, triage, triageFilter]);

  /** Konversationen gruppieren (Message-ID-Kette), Reihenfolge wie Outlook/Gmail erwarten. */
  const threadedRows = useMemo(() => {
    const buckets = groupAndSortThreads(visibleMessages);
    return buckets.flatMap((bucket) =>
      bucket.map((msg, threadIndex) => ({
        msg,
        threadSize: bucket.length,
        threadIndex,
      })),
    );
  }, [visibleMessages]);

  const threadPeers = useMemo(() => {
    if (!activeMessage || visibleMessages.length === 0) return [] as MailListItem[];
    const anchor = {
      uid: activeMessage.uid,
      folder: activeMessage.folder,
      date: activeMessage.date,
      messageId: normMessageId(activeMessage.messageId),
      inReplyTo: normMessageId(activeMessage.inReplyTo),
    };
    return peersInSameThread(anchor, visibleMessages);
  }, [activeMessage, visibleMessages]);

  const triageCounts = useMemo(() => {
    const out: Record<TriageBucket | "all", number> = {
      "all": messages.length,
      "urgent": 0,
      "needs-action": 0,
      "fyi": 0,
      "spam": 0,
    };
    for (const m of messages) {
      const v = triage[triageKey(m.folder, m.uid)];
      if (v) out[v.bucket] += 1;
    }
    return out;
  }, [messages, triage]);

  const toggleBulkKey = useCallback((key: string) => {
    setBulkKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisibleBulk = useCallback(() => {
    setBulkKeys(
      new Set(
        threadedRows.map(({ msg }) => triageKey(msg.folder, msg.uid)),
      ),
    );
  }, [threadedRows]);

  const clearBulkKeys = useCallback(() => setBulkKeys(new Set()), []);

  useEffect(() => {
    setBulkKeys(new Set());
  }, [activeFolder, triageFilter]);

  useEffect(() => {
    const visible = new Set(
      visibleMessages.map((m) => triageKey(m.folder, m.uid)),
    );
    setBulkKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      prev.forEach((k) => {
        if (visible.has(k)) next.add(k);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [visibleMessages]);

  const bulkDeleteSelected = useCallback(async () => {
    if (bulkKeys.size === 0) return;
    if (!window.confirm(t("mail.bulk.deleteConfirm"))) return;
    setBulkBusy(true);
    try {
      const ids = [...bulkKeys];
      const results = await Promise.allSettled(
        ids.map((key) => {
          const hash = key.lastIndexOf("#");
          const folder = key.slice(0, hash);
          const uid = Number(key.slice(hash + 1));
          return fetch(
            `/api/mail/message/${encodeURIComponent(folder)}/${uid}`,
            { method: "DELETE" },
          );
        }),
      );
      const failed = results.filter((r) => {
        if (r.status === "rejected") return true;
        return r.status === "fulfilled" && !r.value.ok;
      }).length;

      const remove = bulkKeys;
      const prevOpen = activeMessage;
      setMessages((ms) =>
        ms.filter((m) => !remove.has(triageKey(m.folder, m.uid))),
      );
      if (prevOpen && remove.has(triageKey(prevOpen.folder, prevOpen.uid))) {
        setActiveMessage(null);
        setActiveUid(null);
      }
      setBulkKeys(new Set());

      if (failed > 0) {
        alert(t("mail.bulk.partialFail"));
      }
      void refreshFolders();
    } finally {
      setBulkBusy(false);
    }
  }, [bulkKeys, activeMessage, t, refreshFolders]);

  /* ------------------------------ AI-Triage ----------------------------- */

  // We classify the *currently visible* messages (post-search filter) and
  // batch in chunks of 40 to stay inside the prompt budget. A single click
  // covers a 100-mail morning inbox in ~3 sequential calls.
  const runTriage = useCallback(async () => {
    if (messages.length === 0) return;
    setTriageBusy(true);
    setTriageError(null);
    try {
      const todo = messages.map((m) => ({
        uid: m.uid,
        folder: m.folder,
        subject: m.subject,
        from: m.from
          ? `${m.from.name ?? ""} <${m.from.address}>`.trim()
          : "",
        preview: m.preview,
        date: m.date,
      }));
      const merged: Record<string, TriageVerdict> = {};
      for (let i = 0; i < todo.length; i += 40) {
        const batch = todo.slice(i, i + 40);
        const r = await fetch("/api/ai/mail-triage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: batch }),
        });
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(e.message ?? e.error ?? r.statusText);
        }
        const j = (await r.json()) as {
          items: Array<{
            uid: number;
            folder: string;
            bucket: TriageBucket;
            reason: string;
          }>;
        };
        for (const it of j.items) {
          merged[triageKey(it.folder, it.uid)] = {
            bucket: it.bucket,
            reason: it.reason,
          };
        }
        // Stream progress: render chips after each batch instead of waiting
        // for the whole inbox — feels noticeably more responsive on 100+ mails.
        setTriage((prev) => ({ ...prev, ...merged }));
      }
    } catch (e) {
      setTriageError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriageBusy(false);
    }
  }, [messages]);

  // Reset triage state when switching folders — a verdict from Inbox isn't
  // meaningful for Sent / Trash, and re-keying by folder is cheaper than
  // filtering verdicts by folder on every render.
  useEffect(() => {
    setTriage({});
    setTriageFilter("all");
    setTriageError(null);
  }, [activeFolder]);

  /* --------------------------------- UI --------------------------------- */

  return (
    <div className="flex h-full bg-bg-base text-text-primary text-[13px] overflow-hidden">
      {/* ── Folders ───────────────────────────────────────────────────── */}
      <aside
        className="shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col"
        style={{ width: folderResize.width }}
      >
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

      <ResizeHandle
        onPointerDown={folderResize.startDrag}
        ariaLabel="Ordnerleiste verschieben"
      />

      {/* ── Message List ──────────────────────────────────────────────── */}
      <section
        className="shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col"
        style={{ width: listResize.width }}
      >
        <div className="p-3 border-b border-stroke-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">
              {labelForFolder(folders, activeFolder, t)}
            </h2>
            <div className="flex items-center gap-0.5">
              <button
                onClick={runTriage}
                disabled={triageBusy || messages.length === 0}
                className="px-2 h-6 inline-flex items-center gap-1 rounded border border-[#5b5fc7]/40 bg-[#5b5fc7]/15 text-[#a5a8e6] hover:bg-[#5b5fc7]/25 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-medium transition-colors"
                title="KI sortiert die Inbox in Heute / Antworten / Info / Rauschen"
              >
                {triageBusy ? (
                  <Loader2 size={11} className="spin" />
                ) : (
                  <Sparkles size={11} />
                )}
                AI-Triage
              </button>
              <a
                href="https://webmail.kineo360.work/?admin"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                title={t("mail.settings")}
              >
                <SettingsIcon size={14} />
              </a>
              <button
                onClick={() => refreshMessages(activeFolder)}
                className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                title={t("common.refresh")}
              >
                {messagesLoading ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </button>
            </div>
          </div>
          {/* Filter-Chips: nur sichtbar wenn Triage gelaufen ist; "Alle" ist
              immer dabei, die einzelnen Buckets zeigen die Counts. */}
          {Object.keys(triage).length > 0 && (
            <div className="flex flex-wrap items-center gap-1 -mt-0.5">
              <TriageChip
                label="Alle"
                count={triageCounts.all}
                active={triageFilter === "all"}
                onClick={() => setTriageFilter("all")}
                tone="default"
              />
              <TriageChip
                label={TRIAGE_META.urgent.label}
                count={triageCounts.urgent}
                active={triageFilter === "urgent"}
                onClick={() => setTriageFilter("urgent")}
                tone="red"
              />
              <TriageChip
                label={TRIAGE_META["needs-action"].label}
                count={triageCounts["needs-action"]}
                active={triageFilter === "needs-action"}
                onClick={() => setTriageFilter("needs-action")}
                tone="amber"
              />
              <TriageChip
                label={TRIAGE_META.fyi.label}
                count={triageCounts.fyi}
                active={triageFilter === "fyi"}
                onClick={() => setTriageFilter("fyi")}
                tone="sky"
              />
              <TriageChip
                label={TRIAGE_META.spam.label}
                count={triageCounts.spam}
                active={triageFilter === "spam"}
                onClick={() => setTriageFilter("spam")}
                tone="zinc"
              />
            </div>
          )}
          {triageError && (
            <p className="text-[11px] text-red-300 -mt-0.5">{triageError}</p>
          )}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-base border border-stroke-1 rounded-md text-[12px] py-1.5 pl-7 pr-2 outline-none focus:border-stroke-2"
            />
          </div>
        </div>
        {bulkKeys.size > 0 && threadedRows.length > 0 && (
          <div className="shrink-0 border-b border-stroke-1 px-3 py-2 flex flex-wrap items-center gap-2 bg-[#0078d4]/12">
            <span className="text-[11.5px] font-semibold text-text-primary tabular-nums">
              {bulkKeys.size}{" "}
              {bulkKeys.size === 1 ? t("mail.bulk.one") : t("mail.bulk.many")}
            </span>
            <span className="text-[10.5px] text-text-quaternary">
              / {threadedRows.length} {t("mail.bulk.visible")}
            </span>
            {bulkKeys.size < threadedRows.length ? (
              <button
                type="button"
                onClick={selectAllVisibleBulk}
                disabled={bulkBusy}
                className="text-[10.5px] text-[#79b8ff] hover:text-text-primary underline disabled:opacity-50"
              >
                {t("mail.bulk.selectAllVisible")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearBulkKeys}
              disabled={bulkBusy}
              className="text-[10.5px] text-text-tertiary hover:text-text-primary"
            >
              {t("mail.bulk.clearSelection")}
            </button>
            <span className="flex-1 min-w-[12px]" />
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkDeleteSelected()}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium bg-red-500/20 text-red-200 hover:bg-red-500/30 disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Trash2 size={13} aria-hidden />
              )}
              {t("mail.bulk.moveToTrash")}
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
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
          <ul className="list-none m-0 p-0">
          {threadedRows.map(({ msg, threadSize, threadIndex }) => {
            const rowKey = triageKey(msg.folder, msg.uid);
            return (
            <MessageRow
              key={rowKey}
              msg={msg}
              active={msg.uid === activeUid}
              triage={triage[rowKey]}
              onClick={() => openMessage(msg.folder, msg.uid)}
              threadSize={threadSize}
              threadIndex={threadIndex}
              bulkChecked={bulkKeys.has(rowKey)}
              bulkActive={bulkKeys.size > 0}
              onToggleBulk={() => toggleBulkKey(rowKey)}
            />
            );
          })}
          </ul>
        </div>
      </section>

      <ResizeHandle
        onPointerDown={listResize.startDrag}
        ariaLabel="Nachrichtenliste verschieben"
      />

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
            workspaceId={workspaceId}
            threadPeers={threadPeers}
            onOpenPeer={(folder, uid) => void openMessage(folder, uid)}
            onReply={() => reply("reply")}
            onReplyAll={() => reply("replyAll")}
            onForward={() => reply("forward")}
            onAiReply={(prefill) => reply("reply", prefill)}
            onDelete={deleteCurrent}
            onSnoozed={handleSnoozed}
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
  triage,
  onClick,
  threadSize = 1,
  threadIndex = 0,
  bulkChecked,
  bulkActive,
  onToggleBulk,
}: {
  msg: MailListItem;
  active: boolean;
  triage?: TriageVerdict;
  onClick: () => void;
  /** Anzahl Nachrichten derselben Konversation im aktuellen Folder. */
  threadSize?: number;
  /** 0 = neueste in Thread-Gruppe, >0 Folgenachricht. */
  threadIndex?: number;
  bulkChecked: boolean;
  bulkActive: boolean;
  onToggleBulk: () => void;
}) {
  const isUnread = !msg.flags.includes("\\Seen");
  const sender = msg.from?.name ?? msg.from?.address ?? "(unbekannt)";
  const date = formatDate(new Date(msg.date));
  const meta = triage ? TRIAGE_META[triage.bucket] : null;
  const inThreadFollow = threadIndex > 0;
  const hasThreadBadge = threadIndex === 0 && threadSize > 1;

  return (
    <li className="flex border-b border-stroke-1 group">
      <label
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-[1] flex items-center justify-center w-8 shrink-0 cursor-pointer transition-opacity border-l-2 border-l-transparent ${
          bulkActive || bulkChecked
            ? "opacity-100"
            : "opacity-[0.52] group-hover:opacity-100"
        }`}
      >
        <input
          type="checkbox"
          checked={bulkChecked}
          onChange={(e) => {
            e.stopPropagation();
            onToggleBulk();
          }}
          className="w-3.5 h-3.5 rounded border-stroke-2 bg-bg-base accent-[#0078d4]"
          aria-label="Nachricht auswählen"
        />
      </label>
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-3 py-2 transition-colors flex flex-col gap-0.5 border-l-2 ${
          active
            ? "bg-bg-overlay border-l-[#0078d4]"
            : `border-l-transparent ${
                inThreadFollow
                  ? "ml-4 pl-1 border-r-0 border-t-0 shadow-[inset_2px_0_0_0_rgba(0,120,212,0.35)] hover:bg-bg-elevated/60"
                  : "hover:bg-bg-elevated"
              }`
        }`}
      >
      <div className="flex items-center gap-2">
        {meta && (
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
            aria-hidden
            title={meta.label}
          />
        )}
        {hasThreadBadge && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 px-1 py-px rounded bg-[#0078d4]/20 text-[10px] text-[#79b8ff]"
            title="Konversation mehrteiliger Nachrichten"
          >
            <GitBranch size={10} aria-hidden /> {threadSize}
          </span>
        )}
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
      <div className="flex items-center gap-1.5 flex-wrap">
        {msg.hasAttachments && <Paperclip size={11} className="text-text-tertiary" />}
        {msg.flags.includes("\\Flagged") && (
          <Star size={11} className="text-yellow-500" />
        )}
        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#0078d4]" />}
        {meta && triage && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 h-[16px] rounded border text-[10px] font-medium ${meta.chipClass}`}
            title={triage.reason || meta.label}
          >
            {meta.label}
          </span>
        )}
      </div>
      </button>
    </li>
  );
}

function TriageChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "default" | "red" | "amber" | "sky" | "zinc";
  onClick: () => void;
}) {
  const TONE: Record<typeof tone, { idle: string; on: string }> = {
    default: {
      idle: "bg-bg-elevated text-text-secondary border-stroke-1 hover:text-text-primary",
      on: "bg-[#0078d4]/15 text-[#7ec0ff] border-[#0078d4]/40",
    },
    red: {
      idle: "bg-bg-elevated text-text-secondary border-stroke-1 hover:text-red-300",
      on: "bg-red-500/20 text-red-200 border-red-500/40",
    },
    amber: {
      idle: "bg-bg-elevated text-text-secondary border-stroke-1 hover:text-amber-300",
      on: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    },
    sky: {
      idle: "bg-bg-elevated text-text-secondary border-stroke-1 hover:text-sky-300",
      on: "bg-sky-500/15 text-sky-200 border-sky-500/40",
    },
    zinc: {
      idle: "bg-bg-elevated text-text-secondary border-stroke-1 hover:text-zinc-300",
      on: "bg-zinc-500/20 text-zinc-200 border-zinc-500/40",
    },
  };
  const cls = active ? TONE[tone].on : TONE[tone].idle;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 h-[20px] rounded-full border text-[10px] font-medium transition-colors ${cls}`}
    >
      <span>{label}</span>
      <span className="opacity-70">{count}</span>
    </button>
  );
}

function Reader({
  msg,
  workspaceId,
  threadPeers,
  onOpenPeer,
  onReply,
  onReplyAll,
  onForward,
  onAiReply,
  onDelete,
  onSnoozed,
}: {
  msg: MailFull;
  workspaceId: string;
  /** Andere Nachrichten derselben Konversation auf der Liste (aktueller Folder). */
  threadPeers: MailListItem[];
  onOpenPeer: (folder: string, uid: number) => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onAiReply: (prefill: { subject?: string; body: string }) => void;
  onDelete: () => void;
  onSnoozed: (wakeAt: Date) => void;
}) {
  const t = useT();
  const [issueOpen, setIssueOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  return (
    <div className="relative flex flex-col h-full min-h-0">
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
          <ActionButton icon={Reply} label={t("common.reply")} onClick={onReply} primary />
          <ActionButton icon={ReplyAll} label={t("common.replyAll")} onClick={onReplyAll} />
          <ActionButton icon={Forward} label={t("common.forward")} onClick={onForward} />
          <ActionButton
            icon={Sparkles}
            label="AI-Antwort"
            onClick={() => setAiOpen((v) => !v)}
          />
          <ActionButton
            icon={Kanban}
            label="Als Issue"
            onClick={() => setIssueOpen(true)}
          />
          <ActionButton
            icon={Clock}
            label="Snooze"
            onClick={() => setSnoozeOpen(true)}
          />
          <div className="flex-1" />
          <ActionButton icon={Trash2} label={t("common.delete")} onClick={onDelete} danger />
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
        {threadPeers.length > 0 && (
          <div className="mt-3 rounded-md border border-stroke-1 bg-bg-chrome px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-text-quaternary mb-1.5 flex items-center gap-1">
              <GitBranch size={11} aria-hidden /> Weitere Nachrichten in dieser Konversation
            </p>
            <div className="flex flex-wrap gap-1.5">
              {threadPeers.map((p) => (
                <button
                  key={`${p.folder}-${p.uid}`}
                  type="button"
                  onClick={() => onOpenPeer(p.folder, p.uid)}
                  className="text-left max-w-full px-2 py-1 rounded border border-stroke-1 hover:border-[#0078d4]/50 hover:bg-bg-overlay text-[11px] transition-colors"
                >
                  <span className="text-text-primary font-medium truncate block">
                    {p.from?.name ?? p.from?.address ?? "?"}
                  </span>
                  <span className="text-text-quaternary text-[10px]">
                    {formatDate(new Date(p.date))}
                  </span>
                </button>
              ))}
            </div>
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
      {issueOpen && (
        <IssueFromMailDialog
          msg={msg}
          workspaceId={workspaceId}
          onClose={() => setIssueOpen(false)}
        />
      )}
      {aiOpen && (
        <AiReplyPanel
          msg={msg}
          workspaceId={workspaceId}
          onClose={() => setAiOpen(false)}
          onPick={(v) => {
            onAiReply({ subject: v.subject, body: v.body });
            setAiOpen(false);
          }}
        />
      )}
      {snoozeOpen && (
        <SnoozePanel
          msg={msg}
          onClose={() => setSnoozeOpen(false)}
          onSnoozed={(wakeAt) => {
            setSnoozeOpen(false);
            onSnoozed(wakeAt);
          }}
        />
      )}
    </div>
  );
}

/**
 * "Später erinnern"-Panel.
 *
 * Presets cover the cases that account for ~90 % of real-world snoozes
 * (today-evening, tomorrow-morning, end-of-week, next-monday) plus a
 * "custom" datetime input for everything else. We don't allow snoozing
 * less than 5 min ahead — IMAP MOVE → INBOX latency makes very-near
 * snoozes feel buggy.
 */
function SnoozePanel({
  msg,
  onClose,
  onSnoozed,
}: {
  msg: MailFull;
  onClose: () => void;
  onSnoozed: (wakeAt: Date) => void;
}) {
  const presets = useMemo<
    Array<{ id: string; label: string; sub: string; date: Date }>
  >(() => {
    const now = new Date();
    const todayEvening = new Date(now);
    todayEvening.setHours(18, 0, 0, 0);
    if (todayEvening.getTime() < now.getTime() + 60 * 60 * 1000) {
      // If it's already past 17h we'd skip "today evening" — bump
      // to tomorrow same-time and label accordingly.
      todayEvening.setDate(todayEvening.getDate() + 1);
    }
    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);
    const nextMonday = new Date(now);
    const daysToMon = (8 - nextMonday.getDay()) % 7 || 7;
    nextMonday.setDate(nextMonday.getDate() + daysToMon);
    nextMonday.setHours(8, 0, 0, 0);
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    return [
      {
        id: "1h",
        label: "In 1 Stunde",
        sub: fmt(inOneHour),
        date: inOneHour,
      },
      {
        id: "evening",
        label: todayEvening.getDate() === now.getDate() ? "Heute Abend" : "Morgen Abend",
        sub: fmt(todayEvening),
        date: todayEvening,
      },
      {
        id: "tomorrow",
        label: "Morgen früh",
        sub: fmt(tomorrowMorning),
        date: tomorrowMorning,
      },
      {
        id: "monday",
        label: "Nächster Montag",
        sub: fmt(nextMonday),
        date: nextMonday,
      },
    ];
  }, []);

  const [customDate, setCustomDate] = useState<string>(() => {
    // Default custom to "tomorrow 09:00" in local time — works in
    // datetime-local inputs which expect "YYYY-MM-DDTHH:MM".
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (when: Date) => {
      if (when.getTime() < Date.now() + 5 * 60 * 1000) {
        setError("Bitte mindestens 5 Minuten in die Zukunft.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const r = await fetch("/api/mail/snooze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            folder: msg.folder,
            uid: msg.uid,
            wakeAt: when.toISOString(),
          }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          return;
        }
        onSnoozed(when);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [msg.folder, msg.uid, onSnoozed],
  );

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-stroke-1 bg-bg-chrome shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-2.5 border-b border-stroke-1 flex items-center gap-2">
          <Clock size={14} className="text-info" />
          <h3 className="text-[12.5px] font-semibold flex-1">
            Später erinnern
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary"
          >
            <X size={13} />
          </button>
        </header>
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-text-tertiary">
            Die Mail verschwindet aus deinem Posteingang und kommt zur
            gewählten Zeit ungelesen zurück.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => void submit(p.date)}
                className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md border border-stroke-1 hover:border-info text-left disabled:opacity-50"
              >
                <span className="text-[12px] font-medium">{p.label}</span>
                <span className="text-[10.5px] text-text-tertiary tabular-nums">
                  {p.sub}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-stroke-1 pt-2.5">
            <label className="text-[10.5px] text-text-tertiary uppercase tracking-wide">
              Eigene Zeit
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                disabled={busy}
                className="flex-1 px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 text-[12px] outline-none focus:border-info"
              />
              <button
                type="button"
                disabled={busy || !customDate}
                onClick={() => {
                  const d = new Date(customDate);
                  if (Number.isNaN(d.getTime())) {
                    setError("Ungültiges Datum");
                    return;
                  }
                  void submit(d);
                }}
                className="px-3 py-1.5 rounded-md bg-info text-white text-[11.5px] font-medium hover:bg-info/90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : "Snoozen"}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-[11.5px] text-red-400 inline-flex items-center gap-1">
              <AlertOctagon size={11} /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueFromMailDialog({
  msg,
  workspaceId,
  onClose,
}: {
  msg: MailFull;
  workspaceId: string;
  onClose: () => void;
}) {
  type Project = { id: string; name: string; identifier: string };
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState(msg.subject || "(kein Betreff)");
  const [priority, setPriority] = useState<"none" | "low" | "medium" | "high" | "urgent">(
    "medium",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; sequenceId: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/projects/projects?ws=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? r.statusText);
          setProjects([]);
          return;
        }
        const j = (await r.json()) as { projects?: Project[] };
        setProjects(j.projects ?? []);
        if (j.projects && j.projects.length > 0) {
          // Use sessionStorage to remember the last-picked project so the
          // user doesn't have to re-select on every issue.
          const last = sessionStorage.getItem("mail.issueProject");
          const found = last && j.projects.find((p) => p.id === last);
          setProjectId(found ? last! : j.projects[0]!.id);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const onSubmit = async () => {
    if (!projectId || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Build a description that gives context the issue actually
      // needs: who sent it, when, the original body — and a deep-link
      // back to the mail in the portal so the assignee can reply
      // without losing the thread.
      const fromLine = msg.from
        ? `${msg.from.name ?? ""} <${msg.from.address}>`.trim()
        : "(unbekannt)";
      const dateLine = new Date(msg.date).toLocaleString("de-DE");
      const body = (msg.bodyText ?? msg.bodyHtml ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
      const portalLink = `/${workspaceId}/mail`;

      const descriptionHtml =
        `<p><strong>Aus E-Mail:</strong> ${escapeHtml(fromLine)}</p>` +
        `<p><strong>Datum:</strong> ${escapeHtml(dateLine)}</p>` +
        `<p><strong>Betreff:</strong> ${escapeHtml(msg.subject)}</p>` +
        `<hr/><p>${escapeHtml(body)}</p>` +
        `<p><a href="${portalLink}">Original-E-Mail im Portal öffnen</a></p>`;

      const r = await fetch(
        `/api/projects/issues?ws=${encodeURIComponent(workspaceId)}&project=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            descriptionHtml,
            priority,
            assignToMe: true,
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? r.statusText);
      }
      const j = (await r.json()) as {
        issue: { id: string; sequenceId: number };
      };
      sessionStorage.setItem("mail.issueProject", projectId);
      setCreated({ id: j.issue.id, sequenceId: j.issue.sequenceId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-stroke-1 bg-bg-elevated shadow-xl">
        <header className="flex items-center justify-between border-b border-stroke-1 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-text-primary">
            Als Plane-Issue speichern
          </h3>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-4 py-3 space-y-3">
          {created ? (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[13px] text-emerald-200">
                Issue erstellt — wird dir zugewiesen.
              </p>
              <Link
                className="text-[12px] text-emerald-300 underline mt-1 inline-block"
                href={`/${workspaceId}/projects?project=${encodeURIComponent(projectId)}&issue=${encodeURIComponent(created.id)}`}
                onClick={onClose}
              >
                #{created.sequenceId} öffnen →
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                  Projekt
                </label>
                {projects === null ? (
                  <div className="text-[12px] text-text-tertiary inline-flex items-center gap-1.5">
                    <Loader2 size={12} className="spin" />
                    Lade Projekte …
                  </div>
                ) : projects.length === 0 ? (
                  <p className="text-[12px] text-amber-300">
                    Keine Projekte in deinem Plane-Workspace gefunden.
                  </p>
                ) : (
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12.5px] outline-none focus:border-[#5b5fc7]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.identifier} · {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                  Titel
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12.5px] outline-none focus:border-[#5b5fc7]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                  Priorität
                </label>
                <div className="flex gap-1">
                  {(["urgent", "high", "medium", "low", "none"] as const).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`flex-1 px-2 h-7 rounded border text-[11px] font-medium transition-colors capitalize ${
                          priority === p
                            ? "bg-[#5b5fc7]/20 border-[#5b5fc7]/50 text-text-primary"
                            : "border-stroke-1 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {p === "none" ? "—" : p}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="rounded border border-stroke-1 bg-bg-base/60 p-2">
                <p className="text-[10px] text-text-tertiary mb-0.5">
                  Beschreibung enthält automatisch:
                </p>
                <ul className="text-[11px] text-text-secondary list-disc list-inside space-y-0.5">
                  <li>Absender, Datum, Betreff</li>
                  <li>Mail-Inhalt (auf 4000 Zeichen gekürzt)</li>
                  <li>Link zurück zur E-Mail</li>
                </ul>
              </div>

              {error && (
                <p className="text-[11px] text-red-300">{error}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 h-8 rounded border border-stroke-1 text-text-secondary text-[12px] hover:text-text-primary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={busy || !projectId || !title.trim()}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded bg-[#5b5fc7] text-white text-[12px] font-medium hover:bg-[#4f52b2] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy && <Loader2 size={12} className="spin" />}
                  Erstellen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AiReplyPanel({
  msg,
  workspaceId,
  onClose,
  onPick,
}: {
  msg: MailFull;
  workspaceId: string;
  onClose: () => void;
  onPick: (v: { subject?: string; body: string }) => void;
}) {
  const [intent, setIntent] = useState("");
  const [tone, setTone] = useState<"freundlich" | "formell" | "kurz" | "empathisch">(
    "freundlich",
  );
  const [variants, setVariants] = useState<
    Array<{ label: string; subject?: string; body: string }>
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedKnowledge, setUsedKnowledge] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const incomingBody =
        msg.bodyText ||
        (msg.bodyHtml
          ? msg.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : "");
      const r = await fetch("/api/ai/reply-suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: "mail",
          workspace: workspaceId,
          incoming: {
            subject: msg.subject,
            from: msg.from
              ? `${msg.from.name ?? ""} <${msg.from.address}>`.trim()
              : undefined,
            body: incomingBody,
            receivedAt: msg.date,
          },
          intent: intent.trim() || undefined,
          tone,
          variants: 3,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setVariants(j.variants ?? []);
      setUsedKnowledge(j.usedKnowledge ?? []);
      setWarnings(j.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [msg, workspaceId, intent, tone]);

  useEffect(() => {
    if (variants.length === 0 && !error) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-x-0 bottom-0 top-[140px] z-30 bg-bg-base border-t-2 border-info/40 shadow-2xl flex flex-col">
      <header className="shrink-0 px-4 py-2.5 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2">
        <Sparkles size={14} className="text-info" />
        <h3 className="text-[12.5px] font-semibold flex-1">
          AI-Antwortvorschläge
        </h3>
        {usedKnowledge.length > 0 && (
          <span
            className="text-[10.5px] text-text-tertiary truncate max-w-[260px]"
            title={`Genutzte Wissensbasis-Abschnitte: ${usedKnowledge.join(", ")}`}
          >
            Wissensbasis: {usedKnowledge.length} Abschnitt
            {usedKnowledge.length === 1 ? "" : "e"}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary"
        >
          <X size={13} />
        </button>
      </header>
      <div className="px-4 py-2.5 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2">
        <input
          type="text"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void generate();
          }}
          placeholder={'Optional: was soll die Antwort sagen? z.B. „Termin am Mi 14:00 bestätigen, alternative Donnerstag 09:00".'}
          className="flex-1 px-2.5 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
        />
        <select
          value={tone}
          onChange={(e) =>
            setTone(
              e.target.value as
                | "freundlich"
                | "formell"
                | "kurz"
                | "empathisch",
            )
          }
          className="px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 text-[12px] outline-none"
        >
          <option value="freundlich">Freundlich</option>
          <option value="formell">Formell</option>
          <option value="kurz">Kurz</option>
          <option value="empathisch">Empathisch</option>
        </select>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-info hover:bg-info/90 text-white text-[11.5px] font-medium disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={11} className="spin" />
          ) : (
            <RefreshCw size={11} />
          )}
          {variants.length === 0 ? "Generieren" : "Neu generieren"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-2.5">
            {error}
            {!isNotConfiguredError(error) ? null : (
              <p className="text-[11px] mt-1 text-text-tertiary">
                Tipp: Befülle die{" "}
                <a
                  href={`/${workspaceId}/ai-knowledge`}
                  className="underline text-info"
                >
                  Wissensbasis
                </a>{" "}
                damit die AI deine Firma kennt.
              </p>
            )}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11.5px] p-2 space-y-0.5">
            {warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}
        {busy && variants.length === 0 && (
          <div className="flex items-center justify-center py-8 text-text-tertiary text-[12px] gap-2">
            <Loader2 size={14} className="spin" />
            Generiere Vorschläge mit Firmen-Wissensbasis …
          </div>
        )}
        {variants.map((v, i) => (
          <article
            key={i}
            className="rounded-md border border-stroke-1 bg-bg-chrome overflow-hidden"
          >
            <header className="px-3 py-2 border-b border-stroke-1 bg-info/5 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold flex items-center gap-1.5">
                <Sparkles size={11} className="text-info" />
                {v.label}
              </h4>
              <button
                type="button"
                onClick={() => onPick(v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-info hover:bg-info/90 text-white text-[11px] font-medium"
              >
                Übernehmen
              </button>
            </header>
            {v.subject && (
              <div className="px-3 py-1.5 border-b border-stroke-1 text-[11.5px]">
                <span className="text-text-tertiary">Betreff: </span>
                <span className="font-medium">{v.subject}</span>
              </div>
            )}
            <pre className="px-3 py-2.5 text-[12.5px] whitespace-pre-wrap font-sans leading-relaxed text-text-primary">
              {v.body}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}

function isNotConfiguredError(msg: string): boolean {
  return /not.?configured/i.test(msg);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const t = useT();
  const [sending, setSending] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiIntent, setAiIntent] = useState("");
  const [aiTone, setAiTone] = useState<"freundlich" | "formell" | "kurz">(
    "freundlich",
  );
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

  /**
   * Generate a draft via Claude. Pulls the current `to` + `subject` as
   * context so the model can personalise the greeting; the Operator can
   * then iterate by re-clicking — each new prompt overwrites the body
   * (we keep the previous text in the input for "extend" use-cases via
   * the intent string).
   */
  const onAiDraft = async () => {
    const intent = aiIntent.trim();
    if (!intent) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/email-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent,
          tone: aiTone,
          context: {
            senderName: selfName ?? selfEmail,
            recipientEmail: state.to.split(",")[0]?.trim(),
            previousMessage: state.body || undefined,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(`AI-Draft fehlgeschlagen: ${j.error ?? `HTTP ${r.status}`}`);
        return;
      }
      update({
        subject: j.subject || state.subject,
        body: j.body || state.body,
      });
      setAiOpen(false);
      setAiIntent("");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 py-3 border-b border-stroke-1 flex items-center gap-2">
        <h1 className="text-sm font-semibold text-text-primary flex-1">
          {state.mode === "new"
            ? t("mail.compose")
            : state.mode === "forward"
              ? t("common.forward")
              : t("common.reply")}
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
          {t("common.send")}
        </button>
        <button
          onClick={onCancel}
          className="p-1.5 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title={t("common.cancel")}
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-5 py-2 border-b border-stroke-1 flex flex-col gap-1.5">
        <ComposeField
          label={t("common.from")}
          value={selfName ? `${selfName} <${selfEmail}>` : selfEmail}
          readonly
        />
        <ComposeField
          label={t("mail.compose.to")}
          value={state.to}
          onChange={(v) => update({ to: v })}
          placeholder="empfänger@beispiel.de, ..."
        />
        <ComposeField
          label={t("mail.compose.cc")}
          value={state.cc}
          onChange={(v) => update({ cc: v })}
        />
        <ComposeField
          label={t("mail.compose.subject")}
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
        <button
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded ${
            aiOpen
              ? "bg-fuchsia-500/15 text-fuchsia-300"
              : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
          }`}
          title="Mit AI Entwurf erstellen"
        >
          <Sparkles size={13} />
          Mit AI
        </button>
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
      {aiOpen && (
        <div className="px-5 py-3 border-b border-stroke-1 bg-bg-elevated flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
            <Sparkles size={11} className="text-fuchsia-400" />
            <span>Beschreibe was die Mail erreichen soll — Subject + Body werden generiert.</span>
          </div>
          <textarea
            value={aiIntent}
            onChange={(e) => setAiIntent(e.target.value)}
            placeholder="z.B. „Erstkontakt mit Physio-Praxis, kurze Vorstellung MedTheris und Vorschlag für ein 15-min Demo-Call."
            className="bg-bg-base border border-stroke-1 rounded px-2 py-1.5 text-[13px] outline-none focus:border-stroke-2 min-h-[60px] resize-y"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-tertiary">Tonalität:</label>
            {(["freundlich", "formell", "kurz"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAiTone(t)}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  aiTone === t
                    ? "bg-fuchsia-500/15 text-fuchsia-300"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={onAiDraft}
              disabled={aiBusy || !aiIntent.trim()}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 text-[12px] font-medium disabled:opacity-40"
            >
              {aiBusy ? (
                <Loader2 size={11} className="spin" />
              ) : (
                <Sparkles size={11} />
              )}
              Generieren
            </button>
          </div>
        </div>
      )}
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

function labelForFolder(
  folders: MailFolder[],
  path: string,
  translate?: (k: keyof Messages, fallback?: string) => string,
): string {
  const f = folders.find((x) => x.path === path);
  if (!f) return path;
  const key = ROLE_LABEL_KEY[f.role];
  if (key && translate) return translate(key, ROLE_LABEL[f.role] || f.name);
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
