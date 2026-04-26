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
  ChevronRight,
  Users as UsersIcon,
  Settings,
  MessageSquarePlus,
  FolderPlus,
  UserPlus,
  UserMinus,
  Archive,
  FileText,
  Globe,
  Crown,
  Shield,
} from "lucide-react";
import type {
  ChatMessage,
  ChatRoom,
  ChatTeam,
  ChatUserSummary,
} from "@/lib/chat/types";

type RoomMember = {
  id: string;
  username: string;
  name?: string;
  status?: "online" | "away" | "busy" | "offline";
  isOwner?: boolean;
  isModerator?: boolean;
};

type RoomFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
};

type Me = { username: string; id: string };

export function ChatClient({
  workspace,
  workspaceLabel,
  initialRooms,
  initialTeams,
  initialMe,
  rocketChatWebBase,
}: {
  /** Portal workspace slug (`kineo` | `corehub` | `medtheris`). */
  workspace: string;
  workspaceLabel: string;
  initialRooms: ChatRoom[];
  initialTeams: ChatTeam[];
  initialMe: Me;
  /** Public https://chat… — used to resolve /file-upload/… links. */
  rocketChatWebBase: string;
}) {
  const [rooms, setRooms] = useState<ChatRoom[]>(initialRooms);
  const [teams, setTeams] = useState<ChatTeam[]>(initialTeams);
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
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  // Close the create-menu popover whenever the user clicks elsewhere.
  useEffect(() => {
    if (!createMenuOpen) return;
    const onDown = (ev: MouseEvent) => {
      const node = createMenuRef.current;
      if (node && !node.contains(ev.target as Node)) setCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [createMenuOpen]);

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
      const r = await fetch(
        `/api/chat/rooms?ws=${encodeURIComponent(workspace)}`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const j = (await r.json()) as { rooms: ChatRoom[]; teams?: ChatTeam[] };
        setRooms(j.rooms);
        if (j.teams) setTeams(j.teams);
      }
    } catch {
      // swallow — keep last good state
    } finally {
      setRoomsLoading(false);
      roomsInFlight.current = false;
    }
  }, [workspace]);

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
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.displayName.toLowerCase().includes(q),
    );
  }, [rooms, search]);

  // Group channels into teams. Anything without a teamId becomes a "loose"
  // channel rendered above the team sections.
  const { teamGroups, looseChannels, dmRooms } = useMemo(() => {
    const teamGroups = new Map<
      string,
      { team: ChatTeam; main: ChatRoom | null; subs: ChatRoom[] }
    >();
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const loose: ChatRoom[] = [];
    const dms: ChatRoom[] = [];
    for (const r of visibleRooms) {
      if (r.type === "d") {
        dms.push(r);
        continue;
      }
      if (r.teamId && teamById.has(r.teamId)) {
        const g = teamGroups.get(r.teamId) ?? {
          team: teamById.get(r.teamId)!,
          main: null,
          subs: [],
        };
        if (r.teamMain) g.main = r;
        else g.subs.push(r);
        teamGroups.set(r.teamId, g);
      } else {
        loose.push(r);
      }
    }
    // Stable team order: by display name
    const sortedGroups = [...teamGroups.values()].sort((a, b) =>
      a.team.displayName.localeCompare(b.team.displayName, "de"),
    );
    // Sort sub-channels alphabetically
    for (const g of sortedGroups) {
      g.subs.sort((a, b) =>
        prettyChannelName(a, g.team).localeCompare(
          prettyChannelName(b, g.team),
          "de",
        ),
      );
    }
    return { teamGroups: sortedGroups, looseChannels: loose, dmRooms: dms };
  }, [visibleRooms, teams]);

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
          <div className="relative" ref={createMenuRef}>
            <button
              onClick={() => setCreateMenuOpen((v) => !v)}
              className="p-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] text-white"
              title="Neu erstellen"
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
            >
              <Plus size={14} />
            </button>
            {createMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-48 z-30 rounded-md border border-stroke-1 bg-bg-elevated shadow-lg overflow-hidden"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowNewChat(true);
                    setCreateMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-text-primary hover:bg-bg-overlay"
                >
                  <MessageSquarePlus size={14} className="text-text-secondary" />
                  Direktnachricht
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowNewChannel(true);
                    setCreateMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-text-primary hover:bg-bg-overlay border-t border-stroke-1"
                >
                  <FolderPlus size={14} className="text-text-secondary" />
                  Neuer Kanal …
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Workspace label so the user always knows where they are */}
          <div className="px-3 pt-1 pb-2 text-[11px] uppercase tracking-wider text-text-tertiary font-semibold flex items-center gap-1.5">
            <UsersIcon size={11} />
            <span>{workspaceLabel}</span>
          </div>

          {/* Loose channels (no team) — rare; mostly legacy / general */}
          {looseChannels.length > 0 && (
            <SidebarSection
              label="Kanäle"
              rooms={looseChannels}
              activeId={activeRoomId}
              onSelect={setActiveRoomId}
            />
          )}

          {/* MS-Teams-style team sections */}
          {teamGroups.length === 0 && looseChannels.length === 0 && (
            <div className="px-3 py-3 text-text-tertiary text-[11px] italic">
              Keine Team-Kanäle in {workspaceLabel}.
              <br />
              Du kannst rechts unten eine Direktnachricht starten.
            </div>
          )}
          {teamGroups.map(({ team, main, subs }) => (
            <TeamSection
              key={team.id}
              team={team}
              main={main}
              subs={subs}
              activeId={activeRoomId}
              onSelect={setActiveRoomId}
            />
          ))}

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
                <h1 className="text-[15px] font-semibold text-text-primary truncate flex items-center gap-2">
                  {(() => {
                    const team = activeRoom.teamId
                      ? teams.find((t) => t.id === activeRoom.teamId)
                      : null;
                    const label = activeRoom.teamMain
                      ? "Allgemein"
                      : team
                        ? prettyChannelName(activeRoom, team)
                        : activeRoom.displayName;
                    return (
                      <>
                        {team && (
                          <>
                            <span className="text-text-tertiary font-normal">
                              {team.displayName}
                            </span>
                            <span className="text-text-tertiary font-normal">
                              ›
                            </span>
                          </>
                        )}
                        <span>{label}</span>
                        {activeRoom.type === "p" && (
                          <Lock
                            size={12}
                            className="text-text-tertiary inline-block"
                            aria-label="Privat"
                          />
                        )}
                      </>
                    );
                  })()}
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
              {activeRoom.type !== "d" && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary border border-transparent hover:border-stroke-1"
                  title="Kanal-Einstellungen"
                  aria-label="Kanal-Einstellungen"
                >
                  <Settings size={16} />
                </button>
              )}
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
                      : `Nachricht an ${activeRoom.displayName || activeRoom.name}`
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

      {/* ─── New Channel Modal ──────────────────────────────────── */}
      {showNewChannel && (
        <NewChannelModal
          workspace={workspace}
          workspaceLabel={workspaceLabel}
          teams={teams}
          onCancel={() => setShowNewChannel(false)}
          onCreated={async (roomId) => {
            await refreshRooms();
            setActiveRoomId(roomId);
            setShowNewChannel(false);
          }}
        />
      )}

      {/* ─── Channel Settings Drawer ────────────────────────────── */}
      {showSettings && activeRoom && activeRoom.type !== "d" && (
        <ChannelSettingsDrawer
          room={activeRoom}
          selfUsername={initialMe.username}
          rocketChatWebBase={rocketChatWebBase}
          onClose={() => setShowSettings(false)}
          onUpdated={async () => {
            await refreshRooms();
          }}
          onArchived={async () => {
            await refreshRooms();
            setShowSettings(false);
            setActiveRoomId(null);
          }}
        />
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

/**
 * MS-Teams-style collapsible team section. Renders the team name as a
 * clickable header, with the main channel rendered as "Allgemein" and
 * sub-channels listed below. Private channels show a 🔒 icon.
 */
function TeamSection({
  team,
  main,
  subs,
  activeId,
  onSelect,
}: {
  team: ChatTeam;
  main: ChatRoom | null;
  subs: ChatRoom[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const initial = (() => {
    try {
      return localStorage.getItem(`chat:team:${team.id}:open`) !== "0";
    } catch {
      return true;
    }
  });
  const [open, setOpen] = useState<boolean>(initial);
  useEffect(() => {
    try {
      localStorage.setItem(`chat:team:${team.id}:open`, open ? "1" : "0");
    } catch {
      // ignore (private mode etc.)
    }
  }, [team.id, open]);

  // Mark active if any room inside is active
  const hasActive =
    (main && main.id === activeId) || subs.some((s) => s.id === activeId);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wide ${
          hasActive ? "text-text-primary" : "text-text-secondary"
        } hover:bg-bg-elevated rounded-sm`}
        title={team.name}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <TeamAvatar team={team} />
        <span className="flex-1 truncate normal-case tracking-normal text-[13px]">
          {team.displayName}
        </span>
      </button>
      {open && (
        <div className="ml-2 border-l border-stroke-1 pl-1">
          {main && (
            <RoomRow
              room={main}
              active={main.id === activeId}
              onClick={() => onSelect(main.id)}
              labelOverride="Allgemein"
              indent
            />
          )}
          {subs.map((r) => (
            <RoomRow
              key={r.id}
              room={r}
              active={r.id === activeId}
              onClick={() => onSelect(r.id)}
              labelOverride={prettyChannelName(r, team)}
              indent
            />
          ))}
          {!main && subs.length === 0 && (
            <div className="px-3 py-1 text-text-tertiary text-[11px] italic">
              Noch keine Kanäle
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamAvatar({ team }: { team: ChatTeam }) {
  // Stable color from team id, MS-Teams-style coloured square avatar
  const palette = [
    "#5b5fc7", // teams purple
    "#0e7c87",
    "#7e3c95",
    "#1f6feb",
    "#9c27b0",
    "#c95a23",
  ];
  const hash = Array.from(team.id).reduce(
    (a, c) => (a * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  const bg = palette[hash % palette.length];
  const initials = team.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-[10px] font-semibold shrink-0"
      style={{ background: bg }}
      aria-hidden
    >
      {initials || "T"}
    </span>
  );
}

function RoomRow({
  room,
  active,
  onClick,
  labelOverride,
  indent,
}: {
  room: ChatRoom;
  active: boolean;
  onClick: () => void;
  labelOverride?: string;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 ${
        indent ? "pl-3 pr-2" : "px-3"
      } py-1.5 text-left text-[13px] transition-colors ${
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
        {labelOverride ?? room.displayName}
      </span>
      {room.unread > 0 && (
        <span className="text-[10px] font-bold bg-[#5b5fc7] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {room.unread > 99 ? "99+" : room.unread}
        </span>
      )}
    </button>
  );
}

/**
 * Strip a team's slug prefix from a channel name and Title-Case it so
 * `kineo-escherwyss` under team `kineo-physiotherapie` reads as "Escherwyss"
 * and `bereichsleitungs-board` under team `kineo` becomes "Bereichsleitungs Board".
 * Falls back to the room's display name if no useful transformation applies.
 */
function prettyChannelName(room: ChatRoom, team: ChatTeam): string {
  const fname = room.displayName ?? room.name;
  if (fname && fname !== room.name) return fname;
  const slug = room.name;
  const teamPrefix = team.name + "-";
  let trimmed = slug.startsWith(teamPrefix) ? slug.slice(teamPrefix.length) : slug;
  // For physio, collapse the "kineo-" location prefix → just the location
  if (team.name === "kineo-physiotherapie" && trimmed.startsWith("kineo-")) {
    trimmed = "Kineo " + trimmed.slice("kineo-".length);
  }
  return trimmed
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
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

/* ─────────────────────────────── Channel management ─────────────────────── */

function NewChannelModal({
  workspace,
  workspaceLabel,
  teams,
  onCancel,
  onCreated,
}: {
  workspace: string;
  workspaceLabel: string;
  teams: ChatTeam[];
  onCancel: () => void;
  onCreated: (roomId: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [teamId, setTeamId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = useMemo(() => slugify(name), [name]);

  // Filter teams to those visible in this workspace, but always allow "no team".
  const wsTeams = useMemo(
    () => teams.filter((t) => t.workspace === workspace),
    [teams, workspace],
  );

  const submit = async () => {
    setError(null);
    if (slug.length < 2) {
      setError("Name muss mindestens 2 Zeichen haben");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: slug,
          isPrivate,
          workspace,
          topic: topic.trim() || undefined,
          teamId: teamId || undefined,
          displayName: name.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (j.error === "name-already-in-use") {
          setError("Ein Kanal mit diesem Namen existiert bereits.");
        } else {
          setError(j.error ?? `Fehler ${r.status}`);
        }
        return;
      }
      const j = (await r.json()) as { roomId: string };
      await onCreated(j.roomId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-20 z-50"
      onClick={onCancel}
    >
      <div
        className="bg-bg-base border border-stroke-1 rounded-lg shadow-xl w-[460px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <FolderPlus size={14} />
          <h3 className="font-semibold text-[13px] flex-1">
            Neuer Kanal in {workspaceLabel}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. kineo-retail"
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              maxLength={64}
            />
            {slug && slug !== name && (
              <p className="text-[11px] text-text-tertiary mt-1">
                Wird gespeichert als <span className="font-mono">#{slug}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              Beschreibung (optional)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Worüber wird hier gesprochen?"
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              maxLength={200}
            />
          </div>

          {wsTeams.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                Team (optional)
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              >
                <option value="">— Kein Team —</option>
                {wsTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-text-tertiary mt-1">
                Teams gruppieren zusammengehörende Kanäle in der Seitenleiste.
              </p>
            </div>
          )}

          <div className="rounded-md border border-stroke-1 bg-bg-elevated p-3 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="privacy"
                checked={!isPrivate}
                onChange={() => setIsPrivate(false)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                  <Globe size={12} />
                  Öffentlich
                </div>
                <p className="text-[11px] text-text-tertiary">
                  Jede:r in {workspaceLabel} kann beitreten und mitlesen.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="privacy"
                checked={isPrivate}
                onChange={() => setIsPrivate(true)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                  <Lock size={12} />
                  Privat
                </div>
                <p className="text-[11px] text-text-tertiary">
                  Nur eingeladene Mitglieder sehen den Kanal und seine Inhalte.
                </p>
              </div>
            </label>
          </div>

          {error && (
            <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-stroke-1 flex items-center justify-end gap-2 bg-bg-chrome">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-[12px] text-text-secondary hover:bg-bg-overlay"
            disabled={submitting}
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={submitting || slug.length < 2}
            className="px-3 py-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] disabled:opacity-50 text-white text-[12px] font-medium flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={12} className="spin" />}
            Kanal erstellen
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelSettingsDrawer({
  room,
  selfUsername,
  rocketChatWebBase,
  onClose,
  onUpdated,
  onArchived,
}: {
  room: ChatRoom;
  selfUsername: string;
  rocketChatWebBase: string;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
  onArchived: () => void | Promise<void>;
}) {
  type Tab = "members" | "files" | "settings";
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = room.type;

  const refreshMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(room.id)}/members?type=${type}`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const j = (await r.json()) as { members: RoomMember[] };
        setMembers(j.members);
      }
    } finally {
      setMembersLoading(false);
    }
  }, [room.id, type]);

  const refreshFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(room.id)}/files?type=${type}`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const j = (await r.json()) as { files: RoomFile[] };
        setFiles(j.files);
      }
    } finally {
      setFilesLoading(false);
    }
  }, [room.id, type]);

  useEffect(() => {
    if (tab === "members") void refreshMembers();
    if (tab === "files") void refreshFiles();
  }, [tab, refreshMembers, refreshFiles]);

  const me = members.find((m) => m.username === selfUsername);
  const isOwnerOrMod = !!(me?.isOwner || me?.isModerator);

  return (
    <aside className="w-[min(100%,420px)] sm:w-[400px] shrink-0 border-l border-stroke-1 bg-bg-chrome flex flex-col shadow-2xl">
      <div className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2 bg-bg-elevated">
        <div className="w-8 h-8 rounded bg-[#5b5fc7]/20 flex items-center justify-center shrink-0">
          {type === "p" ? (
            <Lock size={14} className="text-[#5b5fc7]" />
          ) : (
            <Hash size={14} className="text-[#5b5fc7]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[13px] text-text-primary leading-tight truncate">
            {room.displayName || room.name}
          </h3>
          <p className="text-[10px] text-text-tertiary truncate font-mono">
            #{room.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Schließen"
        >
          <X size={15} />
        </button>
      </div>

      <div className="border-b border-stroke-1 flex">
        {(
          [
            ["members", "Mitglieder", UsersIcon],
            ["files", "Dateien", FileText],
            ["settings", "Einstellungen", Settings],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 ${
              tab === key
                ? "border-[#5b5fc7] text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {tab === "members" && (
          <MembersTab
            members={members}
            loading={membersLoading}
            canEdit={isOwnerOrMod}
            roomId={room.id}
            roomType={type}
            onChange={async () => {
              await refreshMembers();
              await onUpdated();
            }}
            onError={setError}
            assetBase={rocketChatWebBase}
          />
        )}

        {tab === "files" && (
          <FilesTab
            files={files}
            loading={filesLoading}
            assetBase={rocketChatWebBase}
            onRefresh={refreshFiles}
          />
        )}

        {tab === "settings" && (
          <SettingsTab
            room={room}
            canEdit={isOwnerOrMod}
            onUpdated={async () => {
              await onUpdated();
            }}
            onArchived={async () => {
              await onArchived();
            }}
            onError={setError}
          />
        )}
      </div>
    </aside>
  );
}

function MembersTab({
  members,
  loading,
  canEdit,
  roomId,
  roomType,
  onChange,
  onError,
  assetBase,
}: {
  members: RoomMember[];
  loading: boolean;
  canEdit: boolean;
  roomId: string;
  roomType: "c" | "p" | "d";
  onChange: () => void | Promise<void>;
  onError: (msg: string | null) => void;
  assetBase: string;
}) {
  void assetBase;
  const [addOpen, setAddOpen] = useState(false);

  const remove = async (username: string) => {
    if (!confirm(`@${username} wirklich aus diesem Kanal entfernen?`)) return;
    onError(null);
    const r = await fetch(
      `/api/chat/channels/${encodeURIComponent(roomId)}/members?username=${encodeURIComponent(username)}&type=${roomType}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      onError(
        j.error === "forbidden"
          ? "Keine Berechtigung. Nur Owner/Moderatoren können Mitglieder entfernen."
          : (j.error ?? `Fehler ${r.status}`),
      );
      return;
    }
    await onChange();
  };

  return (
    <div className="p-3 space-y-3">
      {canEdit && (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-stroke-1 bg-bg-elevated hover:bg-bg-overlay text-text-secondary hover:text-text-primary py-2 text-[12px] font-medium"
        >
          <UserPlus size={13} />
          Mitglied einladen
        </button>
      )}

      {loading && members.length === 0 && (
        <div className="text-text-tertiary text-xs flex items-center justify-center py-8">
          <Loader2 size={14} className="spin mr-2" />
          Lade Mitglieder …
        </div>
      )}

      <ul className="divide-y divide-stroke-1 -mx-1">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 px-1 py-2 group"
          >
            <Avatar name={m.username} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-text-primary truncate flex items-center gap-1.5">
                {m.name ?? m.username}
                {m.isOwner && (
                  <Crown
                    size={11}
                    className="text-amber-400"
                    aria-label="Owner"
                  />
                )}
                {m.isModerator && !m.isOwner && (
                  <Shield
                    size={11}
                    className="text-sky-400"
                    aria-label="Moderator"
                  />
                )}
              </div>
              <div className="text-[11px] text-text-tertiary truncate">
                @{m.username}
                {m.status === "online" && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle" />
                )}
              </div>
            </div>
            {canEdit && !m.isOwner && (
              <button
                onClick={() => void remove(m.username)}
                className="p-1.5 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                title={`@${m.username} entfernen`}
              >
                <UserMinus size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!loading && members.length === 0 && (
        <div className="text-text-tertiary text-xs text-center py-8">
          Noch keine Mitglieder
        </div>
      )}

      {addOpen && (
        <AddMemberPicker
          roomId={roomId}
          roomType={roomType}
          existing={members.map((m) => m.username)}
          onCancel={() => setAddOpen(false)}
          onAdded={async () => {
            setAddOpen(false);
            await onChange();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function AddMemberPicker({
  roomId,
  roomType,
  existing,
  onCancel,
  onAdded,
  onError,
}: {
  roomId: string;
  roomType: "c" | "p" | "d";
  existing: string[];
  onCancel: () => void;
  onAdded: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const existingSet = useMemo(() => new Set(existing), [existing]);

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

  const invite = async (username: string) => {
    onError(null);
    setSubmitting(username);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(roomId)}/members`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, type: roomType }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        onError(
          j.error === "forbidden"
            ? "Keine Berechtigung. Nur Owner/Moderatoren können einladen."
            : j.error === "user-not-found"
              ? `@${username} existiert nicht im Chat.`
              : (j.error ?? `Fehler ${r.status}`),
        );
        return;
      }
      await onAdded();
    } finally {
      setSubmitting(null);
    }
  };

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
          <UserPlus size={14} />
          <h3 className="font-semibold text-[13px] flex-1">
            Mitglied einladen
          </h3>
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
          {results.map((u) => {
            const already = existingSet.has(u.username);
            return (
              <button
                key={u.id}
                disabled={already || submitting === u.username}
                onClick={() => void invite(u.username)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                  already
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-bg-elevated"
                }`}
              >
                <Avatar name={u.username} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary font-medium">
                    {u.name ?? u.username}
                  </div>
                  <div className="text-text-tertiary text-[11px]">
                    @{u.username}
                  </div>
                </div>
                {already ? (
                  <span className="text-[10px] text-text-tertiary uppercase tracking-wide">
                    Mitglied
                  </span>
                ) : submitting === u.username ? (
                  <Loader2 size={14} className="spin text-text-tertiary" />
                ) : (
                  <UserPlus size={14} className="text-text-tertiary" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilesTab({
  files,
  loading,
  assetBase,
  onRefresh,
}: {
  files: RoomFile[];
  loading: boolean;
  assetBase: string;
  onRefresh: () => void | Promise<void>;
}) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span>{files.length} Datei{files.length === 1 ? "" : "en"} im Kanal</span>
        <button
          onClick={() => void onRefresh()}
          className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Aktualisieren"
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {loading && files.length === 0 && (
        <div className="text-text-tertiary text-xs flex items-center justify-center py-8">
          <Loader2 size={14} className="spin mr-2" />
          Lade Dateien …
        </div>
      )}
      {!loading && files.length === 0 && (
        <div className="text-text-tertiary text-xs text-center py-8">
          Noch keine Dateien geteilt
        </div>
      )}
      <ul className="space-y-1">
        {files.map((f) => {
          const href = resolveRcAssetUrl(f.url, assetBase);
          return (
            <li key={f.id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-2 rounded hover:bg-bg-elevated"
              >
                <div className="w-8 h-8 rounded bg-bg-overlay flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-text-primary truncate font-medium">
                    {f.name}
                  </div>
                  <div className="text-[11px] text-text-tertiary truncate">
                    {humanFileSize(f.size)}
                    {" · "}
                    @{f.uploadedBy}
                    {f.uploadedAt && (
                      <>
                        {" · "}
                        {new Date(f.uploadedAt).toLocaleDateString("de-DE")}
                      </>
                    )}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsTab({
  room,
  canEdit,
  onUpdated,
  onArchived,
  onError,
}: {
  room: ChatRoom;
  canEdit: boolean;
  onUpdated: () => void | Promise<void>;
  onArchived: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [topic, setTopic] = useState(room.topic ?? "");
  const [savingTopic, setSavingTopic] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const dirtyTopic = topic !== (room.topic ?? "");

  const saveTopic = async () => {
    onError(null);
    setSavingTopic(true);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic, type: room.type }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        onError(j.error ?? `Fehler ${r.status}`);
        return;
      }
      await onUpdated();
    } finally {
      setSavingTopic(false);
    }
  };

  const togglePrivacy = async () => {
    const target = room.type === "p" ? "öffentlich" : "privat";
    if (
      !confirm(
        `Diesen Kanal wirklich auf ${target} stellen? Bestehende Mitglieder bleiben erhalten.`,
      )
    ) {
      return;
    }
    onError(null);
    setTogglingPrivacy(true);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            isPrivate: room.type !== "p",
            type: room.type,
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        onError(j.error ?? `Fehler ${r.status}`);
        return;
      }
      await onUpdated();
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const archive = async () => {
    if (
      !confirm(
        "Kanal wirklich archivieren? Er bleibt erhalten, ist aber nicht mehr aktiv.",
      )
    )
      return;
    onError(null);
    setArchiving(true);
    try {
      const r = await fetch(
        `/api/chat/channels/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archive: true, type: room.type }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        onError(j.error ?? `Fehler ${r.status}`);
        return;
      }
      await onArchived();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="p-3 space-y-5">
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          Beschreibung
        </h4>
        <textarea
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={!canEdit}
          placeholder="Worüber wird hier gesprochen?"
          className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[12.5px] py-2 px-3 outline-none focus:border-stroke-2 resize-none disabled:opacity-60"
          maxLength={250}
        />
        {canEdit && dirtyTopic && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setTopic(room.topic ?? "")}
              className="px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-overlay rounded-md"
            >
              Verwerfen
            </button>
            <button
              onClick={() => void saveTopic()}
              disabled={savingTopic}
              className="px-3 py-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] disabled:opacity-50 text-white text-[12px] font-medium flex items-center gap-1.5"
            >
              {savingTopic && <Loader2 size={11} className="spin" />}
              Speichern
            </button>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          Sichtbarkeit
        </h4>
        <div className="rounded-md border border-stroke-1 bg-bg-elevated p-3 flex items-start gap-3">
          <div className="w-7 h-7 rounded bg-bg-overlay flex items-center justify-center shrink-0">
            {room.type === "p" ? (
              <Lock size={13} className="text-text-secondary" />
            ) : (
              <Globe size={13} className="text-text-secondary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium text-text-primary">
              {room.type === "p" ? "Privat" : "Öffentlich"}
            </div>
            <p className="text-[11px] text-text-tertiary">
              {room.type === "p"
                ? "Nur eingeladene Mitglieder sehen diesen Kanal."
                : "Jede:r im Workspace kann diesen Kanal sehen und beitreten."}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => void togglePrivacy()}
              disabled={togglingPrivacy}
              className="px-2.5 py-1 text-[11px] rounded-md border border-stroke-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50 flex items-center gap-1"
            >
              {togglingPrivacy && <Loader2 size={10} className="spin" />}
              Auf {room.type === "p" ? "öffentlich" : "privat"} stellen
            </button>
          )}
        </div>
      </section>

      {canEdit && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Gefahrenzone
          </h4>
          <button
            onClick={() => void archive()}
            disabled={archiving}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-stroke-1 bg-bg-elevated hover:border-amber-500/40 hover:text-amber-300 text-text-secondary py-2 text-[12px] disabled:opacity-50"
          >
            {archiving ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <Archive size={12} />
            )}
            Kanal archivieren
          </button>
          <p className="text-[10.5px] text-text-tertiary mt-1.5">
            Archivierte Kanäle werden ausgeblendet, aber nicht gelöscht. Ein
            Workspace-Admin kann sie reaktivieren.
          </p>
        </section>
      )}

      {!canEdit && (
        <p className="text-[11px] text-text-tertiary italic">
          Nur Owner und Moderatoren können Kanal-Einstellungen ändern.
        </p>
      )}
    </div>
  );
}

function humanFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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
