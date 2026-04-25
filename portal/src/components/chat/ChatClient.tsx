"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hash,
  Lock,
  User as UserIcon,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  Send as SendIcon,
  Video,
  X,
  Phone,
  Maximize2,
  Paperclip,
} from "lucide-react";
import type { ChatMessage, ChatRoom, ChatUserSummary } from "@/lib/chat/types";

type Me = { username: string; id: string };

export function ChatClient({
  initialRooms,
  initialMe,
  rocketChatWebBase,
}: {
  initialRooms: ChatRoom[];
  initialMe: Me;
  /** Public https://chat… — used to resolve /file-upload/… links. */
  rocketChatWebBase: string;
}) {
  const [rooms, setRooms] = useState<ChatRoom[]>(initialRooms);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRooms[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [callLink, setCallLink] = useState<string | null>(null);
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Stable lookup by ID. Re-runs only when rooms list or selection changes.
  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  );

  // Type for the active room is stable for a given roomId (DMs stay DMs etc),
  // so we keep it in a ref to avoid pulling the room *object* into effect deps.
  const activeTypeRef = useRef<ChatRoom["type"] | null>(null);
  if (activeRoom) activeTypeRef.current = activeRoom.type;

  // In-flight guards so polling never stacks up while RC is slow.
  const messagesInFlight = useRef(false);
  const roomsInFlight = useRef(false);

  /* ─────────────────────────── Fetchers ─────────────────────────── */

  const refreshRooms = useCallback(async () => {
    if (roomsInFlight.current) return;
    roomsInFlight.current = true;
    setRoomsLoading(true);
    try {
      const r = await fetch("/api/chat/rooms", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { rooms: ChatRoom[] };
        setRooms(j.rooms);
      }
    } catch {
      // swallow — keep last good state
    } finally {
      setRoomsLoading(false);
      roomsInFlight.current = false;
    }
  }, []);

  const refreshMessages = useCallback(
    async (roomId: string, type: ChatRoom["type"], showSpinner = true) => {
      if (messagesInFlight.current) return;
      messagesInFlight.current = true;
      if (showSpinner) setMessagesLoading(true);
      try {
        const r = await fetch(
          `/api/chat/messages?roomId=${roomId}&type=${type}&count=80`,
          { cache: "no-store" },
        );
        if (r.ok) {
          const j = (await r.json()) as { messages: ChatMessage[] };
          setMessages(j.messages);
        } else if (showSpinner) {
          // Only clear list on the user-initiated load, not on background polls
          setMessages([]);
        }
      } catch {
        // swallow on background polls
      } finally {
        if (showSpinner) setMessagesLoading(false);
        messagesInFlight.current = false;
      }
    },
    [],
  );

  // Switch active room → load messages + mark read.
  // Deps are *only* the stable string id, so this never loops.
  useEffect(() => {
    if (!activeRoomId) return;
    const type = activeTypeRef.current;
    if (!type) return;
    setMessages([]);
    void refreshMessages(activeRoomId, type, true);
    void fetch("/api/chat/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: activeRoomId }),
    }).catch(() => {});
    // Idempotent: only allocate a new room object if there's actually unread to clear
    setRooms((rs) => {
      let changed = false;
      const next = rs.map((r) => {
        if (r.id === activeRoomId && r.unread > 0) {
          changed = true;
          return { ...r, unread: 0 };
        }
        return r;
      });
      return changed ? next : rs;
    });
  }, [activeRoomId, refreshMessages]);

  // Poll for new messages every 5s while a room is open.
  useEffect(() => {
    if (!activeRoomId) return;
    const id = setInterval(() => {
      const type = activeTypeRef.current;
      if (type) void refreshMessages(activeRoomId, type, false);
    }, 5000);
    return () => clearInterval(id);
  }, [activeRoomId, refreshMessages]);

  // Poll rooms every 20s for unread updates / new DMs.
  useEffect(() => {
    const id = setInterval(refreshRooms, 20000);
    return () => clearInterval(id);
  }, [refreshRooms]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  /* ─────────────────────────── Actions ──────────────────────────── */

  const send = useCallback(async () => {
    if (!activeRoom) return;
    const text = composer.trim();
    if (!text && !pendingFile) return;
    setSending(true);
    const file = pendingFile;
    const prevComposer = text;
    setComposer("");
    setPendingFile(null);
    try {
      if (file) {
        const fd = new FormData();
        fd.append("roomId", activeRoom.id);
        fd.append("file", file);
        if (text) fd.append("msg", text);
        const r = await fetch("/api/chat/upload", { method: "POST", body: fd });
        if (r.ok) {
          const j = (await r.json()) as { message: ChatMessage };
          setMessages((ms) => [...ms, j.message]);
        } else {
          const e = (await r.json().catch(() => ({}))) as { error?: string };
          alert("Datei-Upload fehlgeschlagen: " + (e.error ?? r.statusText));
          setComposer(prevComposer);
          setPendingFile(file);
        }
        return;
      }
      const r = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: activeRoom.id, text }),
      });
      if (r.ok) {
        const j = (await r.json()) as { message: ChatMessage };
        setMessages((ms) => [...ms, j.message]);
      } else {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        alert("Senden fehlgeschlagen: " + (e.error ?? r.statusText));
        setComposer(text);
      }
    } finally {
      setSending(false);
    }
  }, [activeRoom, composer, pendingFile]);

  const startCall = useCallback(async () => {
    if (!activeRoom) return;
    const r = await fetch("/api/chat/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId: activeRoom.id,
        roomName: activeRoom.name,
        postInvite: true,
      }),
    });
    if (r.ok) {
      const j = (await r.json()) as { link: string };
      setCallLink(j.link);
      setCallPanelOpen(true);
      // Refresh messages to pick up the invite the server posted
      setTimeout(() => refreshMessages(activeRoom.id, activeRoom.type), 800);
    } else {
      alert("Call konnte nicht gestartet werden.");
    }
  }, [activeRoom, refreshMessages]);

  const startDM = useCallback(
    async (username: string) => {
      const r = await fetch("/api/chat/dm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (r.ok) {
        const j = (await r.json()) as { roomId: string };
        await refreshRooms();
        setActiveRoomId(j.roomId);
        setShowNewChat(false);
      }
    },
    [refreshRooms],
  );

  /* ──────────────────────────── Filter ──────────────────────────── */

  const visibleRooms = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter((r) => r.name.toLowerCase().includes(q));
  }, [rooms, search]);

  const channelRooms = visibleRooms.filter((r) => r.type === "c" || r.type === "p");
  const dmRooms = visibleRooms.filter((r) => r.type === "d");

  /* ─────────────────────────────── UI ───────────────────────────── */

  return (
    <div className="flex h-full bg-bg-base text-text-primary text-[13px] overflow-hidden">
      {/* ─── Sidebar: Rooms ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
        <div className="p-3 border-b border-stroke-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder="Suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-base border border-stroke-1 rounded-md text-[12px] py-1.5 pl-7 pr-2 outline-none focus:border-stroke-2"
            />
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] text-white"
            title="Neuer Chat"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <SidebarSection
            label="Kanäle"
            rooms={channelRooms}
            activeId={activeRoomId}
            onSelect={setActiveRoomId}
          />
          <SidebarSection
            label="Direktnachrichten"
            rooms={dmRooms}
            activeId={activeRoomId}
            onSelect={setActiveRoomId}
            empty="Noch keine Direktnachrichten"
          />
        </div>

        <div className="border-t border-stroke-1 p-2 flex items-center gap-2 text-[11px] text-text-tertiary">
          <Avatar name={initialMe.username} size={20} />
          <span className="truncate flex-1 text-text-secondary">@{initialMe.username}</span>
          <button
            onClick={refreshRooms}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Aktualisieren"
          >
            {roomsLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
      </aside>

      {/* ─── Main Pane ──────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-w-0 bg-bg-base">
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary gap-2">
            <Hash size={48} className="opacity-30" />
            <p className="text-sm">Wähle einen Kanal oder eine Person aus</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3 border-b border-stroke-1 flex items-center gap-3 bg-bg-base">
              <RoomIcon room={activeRoom} />
              <div className="flex-1 min-w-0">
                <h1 className="text-[15px] font-semibold text-text-primary truncate">
                  {activeRoom.name}
                </h1>
                {activeRoom.lastMessage && (
                  <div className="text-text-tertiary text-[11px] truncate">
                    Zuletzt aktiv:{" "}
                    {new Date(activeRoom.lastMessage.at).toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={startCall}
                className="flex items-center gap-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] text-white px-3 py-1.5 text-[12px] font-medium"
                title="Video-Anruf in diesem Channel starten"
              >
                <Video size={14} />
                Anruf starten
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {messagesLoading && messages.length === 0 && (
                <div className="text-text-tertiary text-xs flex items-center justify-center py-12">
                  <Loader2 size={20} className="spin mr-2" /> Lade Nachrichten …
                </div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="text-text-tertiary text-xs text-center py-12">
                  Noch keine Nachrichten. Sag „Hallo“!
                </div>
              )}
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  prev={messages[i - 1]}
                  selfUsername={initialMe.username}
                  assetBase={rocketChatWebBase}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-stroke-1 p-3">
              {pendingFile && (
                <div className="mb-2 flex items-center gap-2 text-[11px] text-text-secondary">
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate flex-1 font-mono">{pendingFile.name}</span>
                  <span className="text-text-tertiary">{(pendingFile.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    className="p-0.5 rounded hover:bg-bg-overlay text-text-tertiary"
                    title="Anhang entfernen"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 bg-bg-elevated border border-stroke-1 rounded-lg px-2 py-2 focus-within:border-stroke-2">
                <label className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary cursor-pointer shrink-0">
                  <Paperclip size={16} />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPendingFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <textarea
                  rows={1}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    pendingFile
                      ? "Optional: Bildunterschrift …"
                      : `Nachricht an ${activeRoom.name}`
                  }
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[13px] text-text-primary placeholder:text-text-tertiary py-1 max-h-32"
                  style={{
                    minHeight: "1.5rem",
                    height: "auto",
                  }}
                />
                <button
                  onClick={() => void send()}
                  disabled={sending || (!composer.trim() && !pendingFile)}
                  className="p-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] disabled:opacity-40 text-white"
                  title="Senden (Enter)"
                >
                  {sending ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <SendIcon size={14} />
                  )}
                </button>
              </div>
              <div className="mt-1 text-[10px] text-text-tertiary">
                Enter zum Senden · Shift + Enter für neue Zeile
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── Call Panel (right) ─────────────────────────────────── */}
      {callPanelOpen && callLink && (
        <CallPanel
          link={callLink}
          onClose={() => {
            setCallPanelOpen(false);
            setCallLink(null);
          }}
        />
      )}

      {/* ─── New Chat Modal ─────────────────────────────────────── */}
      {showNewChat && (
        <NewChatModal onCancel={() => setShowNewChat(false)} onPick={startDM} />
      )}
    </div>
  );
}

/* ─────────────────────────────── Sub-components ─────────────────────────────── */

function SidebarSection({
  label,
  rooms,
  activeId,
  onSelect,
  empty,
}: {
  label: string;
  rooms: ChatRoom[];
  activeId: string | null;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  return (
    <div className="mb-2">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
        {label}
      </div>
      {rooms.length === 0 && empty && (
        <div className="px-3 py-1 text-text-tertiary text-[11px] italic">{empty}</div>
      )}
      {rooms.map((r) => (
        <RoomRow key={r.id} room={r} active={r.id === activeId} onClick={() => onSelect(r.id)} />
      ))}
    </div>
  );
}

function RoomRow({
  room,
  active,
  onClick,
}: {
  room: ChatRoom;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? "bg-bg-overlay text-text-primary border-l-2 border-l-[#5b5fc7]"
          : "border-l-2 border-l-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      <RoomIcon room={room} small />
      <span
        className={`flex-1 truncate ${
          room.unread > 0 ? "font-semibold text-text-primary" : ""
        }`}
      >
        {room.name}
      </span>
      {room.unread > 0 && (
        <span className="text-[10px] font-bold bg-[#5b5fc7] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {room.unread > 99 ? "99+" : room.unread}
        </span>
      )}
    </button>
  );
}

function RoomIcon({ room, small }: { room: ChatRoom; small?: boolean }) {
  const size = small ? 14 : 18;
  if (room.type === "d") {
    return <Avatar name={room.name} size={small ? 18 : 28} />;
  }
  const Icon = room.type === "p" ? Lock : Hash;
  return (
    <div
      className={`flex items-center justify-center rounded ${
        small ? "w-[18px] h-[18px]" : "w-7 h-7"
      } text-text-tertiary`}
    >
      <Icon size={size} />
    </div>
  );
}

function resolveRcAssetUrl(href: string | undefined, base: string): string {
  if (!href) return "#";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

function MessageBubble({
  msg,
  prev,
  selfUsername,
  assetBase,
}: {
  msg: ChatMessage;
  prev?: ChatMessage;
  selfUsername: string;
  assetBase: string;
}) {
  const isSelf = msg.user.username === selfUsername;
  const groupedWithPrev =
    prev &&
    prev.user.id === msg.user.id &&
    !prev.isSystem &&
    new Date(msg.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000;

  if (msg.isSystem) {
    return (
      <div className="text-center text-[11px] text-text-tertiary italic py-1">
        {msg.text}
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${groupedWithPrev ? "mt-0.5" : "mt-4"}`}>
      <div className="w-8 shrink-0">
        {!groupedWithPrev && <Avatar name={msg.user.username} size={32} />}
      </div>
      <div className="flex-1 min-w-0">
        {!groupedWithPrev && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className={`text-[13px] font-semibold ${
                isSelf ? "text-[#5b5fc7]" : "text-text-primary"
              }`}
            >
              {msg.user.name ?? msg.user.username}
            </span>
            <span className="text-text-tertiary text-[11px]">
              {new Date(msg.at).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        {msg.text ? (
          <div
            className="text-[13px] leading-relaxed text-text-primary whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: renderMessageBody(msg.text) }}
          />
        ) : null}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-1 space-y-1.5">
            {msg.attachments.map((a, i) => {
              const imgUrl = a.imageUrl
                ? resolveRcAssetUrl(a.imageUrl, assetBase)
                : null;
              const fileUrl = a.titleLink
                ? resolveRcAssetUrl(a.titleLink, assetBase)
                : null;
              const showImage = !!imgUrl && a.type !== "audio" && a.type !== "video";
              return (
                <div key={i} className="rounded border border-stroke-1 bg-bg-elevated/60 p-2 text-[12px]">
                  {showImage && imgUrl ? (
                    <a
                      href={fileUrl ?? imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={imgUrl}
                        alt={a.title ?? ""}
                        className="max-w-full max-h-48 rounded object-contain"
                      />
                    </a>
                  ) : fileUrl ? (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5b5fc7] hover:underline break-all"
                    >
                      {a.title || "Datei"}
                    </a>
                  ) : (
                    <span className="text-text-tertiary">{a.title || "Anhang"}</span>
                  )}
                  {a.description && (
                    <p className="text-text-tertiary text-[11px] mt-1">{a.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Path segment(s) for Jitsi room, e.g. corehub-ali-a1b2c3d4 */
function jitsiRoomFromInviteLink(href: string): { domain: string; room: string; origin: string } {
  const u = new URL(href);
  const parts = u.pathname.split("/").filter(Boolean);
  const room = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!room) {
    throw new Error("Jitsi-Link enthält keinen Raum (Pfad leer).");
  }
  return { domain: u.hostname, room, origin: u.origin };
}

type JitsiApi = { dispose: () => void };

const jitsiScriptByOrigin = new Map<string, Promise<void>>();

function loadJitsiExternalApi(origin: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  const cached = jitsiScriptByOrigin.get(origin);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${origin}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      jitsiScriptByOrigin.delete(origin);
      reject(new Error("Jitsi external_api.js konnte nicht geladen werden"));
    };
    document.head.appendChild(s);
  });
  jitsiScriptByOrigin.set(origin, p);
  return p;
}

function CallPanel({ link, onClose }: { link: string; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "iframe-fallback" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let room: string;
    let domain: string;
    let origin: string;
    try {
      const p = jitsiRoomFromInviteLink(link);
      room = p.room;
      domain = p.domain;
      origin = p.origin;
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrMsg(null);

    const run = async () => {
      try {
        await loadJitsiExternalApi(origin);
        if (cancelled) return;
        const ctor = (window as unknown as { JitsiMeetExternalAPI?: new (d: string, o: Record<string, unknown>) => JitsiApi })
          .JitsiMeetExternalAPI;
        if (!ctor) {
          throw new Error("JitsiMeetExternalAPI fehlt nach Script-Ladung");
        }
        apiRef.current?.dispose();
        el.innerHTML = "";
        if (cancelled || !hostRef.current) return;

        const api = new ctor(domain, {
          roomName: room,
          parentNode: hostRef.current,
          width: "100%",
          height: "100%",
          lang: "de",
          configOverwrite: {
            // Direkt in den geplanten Raum — kein willkürlicher Zufallsname auf der Startseite
            subject: "Kineo360 Besprechung",
            disableDeepLinking: true,
            prejoinConfig: { enabled: true },
            hideDisplayName: false,
          },
          interfaceConfigOverwrite: {
            APP_NAME: "Kineo360 Besprechung",
            NATIVE_APP_NAME: "Kineo360",
            PROVIDER_NAME: "Kineo360",
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DEFAULT_BACKGROUND: "#11151a",
          },
        });
        apiRef.current = api;
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        // Fallback: klassisches iframe mit gleichem Ziel-URL
        setStatus("iframe-fallback");
        el.innerHTML = "";
        const ifr = document.createElement("iframe");
        ifr.src = link;
        ifr.className = "w-full h-full min-h-[280px] border-0";
        ifr.title = "Video-Anruf";
        ifr.allow =
          "camera *; microphone *; display-capture *; clipboard-write *; autoplay; fullscreen; web-share";
        ifr.setAttribute("allowFullScreen", "");
        el.appendChild(ifr);
        setErrMsg(
          e instanceof Error
            ? `API-Embedding: ${e.message} — nutze Iframe-Modus.`
            : "API-Embedding fehlgeschlagen — Iframe-Modus.",
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
      try {
        apiRef.current?.dispose();
      } catch {
        // ignore
      }
      apiRef.current = null;
      if (el) el.innerHTML = "";
    };
  }, [link]);

  return (
    <aside className="w-[min(100%,480px)] sm:w-[440px] shrink-0 border-l border-stroke-1 bg-bg-chrome flex flex-col shadow-2xl">
      <div className="h-1 bg-gradient-to-r from-[#4f52b2] to-[#5b5fc7] shrink-0" aria-hidden />
      <div className="px-3 py-2.5 border-b border-stroke-1 flex items-center gap-2 bg-bg-elevated">
        <div className="w-8 h-8 rounded bg-[#5b5fc7]/20 flex items-center justify-center shrink-0">
          <Phone size={16} className="text-[#5b5fc7]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[13px] text-text-primary leading-tight">
            Kineo360 · Besprechung
          </h3>
          <p className="text-[10px] text-text-tertiary truncate">
            {status === "loading"
              ? "Starte Anruf …"
              : "Kamera & Mikro im Browser-Dialog zulassen"}
          </p>
        </div>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Gleiche Besprechung in neuem Tab"
        >
          <Maximize2 size={15} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Seitenleiste schließen"
        >
          <X size={15} />
        </button>
      </div>
      {errMsg && status !== "loading" && (
        <p className="px-2 py-1 text-[10px] text-text-tertiary border-b border-stroke-1 bg-bg-base/80">
          {errMsg}
        </p>
      )}
      {status === "error" && errMsg && (
        <div className="p-3 text-sm text-text-secondary">{errMsg}</div>
      )}
      <div className="flex-1 min-h-0 bg-[#11151a] relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-bg-chrome/90">
            <Loader2 className="w-6 h-6 text-[#5b5fc7] spin" />
          </div>
        )}
        <div
          ref={hostRef}
          className="w-full h-full min-h-[280px] [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:min-h-[280px] [&>iframe]:border-0"
        />
      </div>
    </aside>
  );
}

function NewChatModal({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (username: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let aborted = false;
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/chat/users?q=${encodeURIComponent(q)}`);
        if (!aborted && r.ok) {
          const j = (await r.json()) as { users: ChatUserSummary[] };
          setResults(j.users);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }, 250);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-24 z-50"
      onClick={onCancel}
    >
      <div
        className="bg-bg-base border border-stroke-1 rounded-lg shadow-xl w-[400px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <UserIcon size={14} />
          <h3 className="font-semibold text-[13px] flex-1">Person finden</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-3 border-b border-stroke-1">
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name oder @username"
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              <Loader2 size={16} className="spin inline mr-1" /> Suche …
            </div>
          )}
          {!loading && q.length >= 2 && results.length === 0 && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              Niemand gefunden
            </div>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => onPick(u.username)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-elevated"
            >
              <Avatar name={u.username} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium">
                  {u.name ?? u.username}
                </div>
                <div className="text-text-tertiary text-[11px]">
                  @{u.username}
                  {u.email && <span className="ml-2">{u.email}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s|@|[-_.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const hue = stringHash(name) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        background: `hsl(${hue} 50% 35%)`,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(9, size * 0.4)}px`,
      }}
    >
      {initials}
    </div>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Very lightweight markdown rendering: bold, italic, links, line-breaks.
 * Rocket.Chat's `msg` field is plain markdown; we render a safe subset.
 */
function renderMessageBody(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#5b5fc7] hover:underline">$1</a>',
    )
    .replace(
      /(^|[\s(])(https?:\/\/[^\s)]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#5b5fc7] hover:underline">$2</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)_([^_]+)_/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-bg-elevated px-1 rounded text-[12px]">$1</code>')
    .replace(/\n/g, "<br />");
}
