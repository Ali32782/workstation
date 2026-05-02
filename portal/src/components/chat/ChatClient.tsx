"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  ChevronLeft,
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
import {
  attachmentLooksLikeMeetLinkPreview,
  extractMeetUrlFromAttachments,
  extractMeetUrlFromRocketchatMessage,
  portalCallInviteKind,
} from "@/lib/comms/rocketchat-call-invite";
import {
  PENDING_CHAT_MEETING_KEY,
  type PendingChatMeeting,
} from "@/lib/jitsi/client";
import { MeetingCallOverlay } from "@/components/calls/MeetingCallOverlay";
import { useLocale, useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";
import { useResizableWidth, ResizeHandle } from "@/components/ui/resizable";
import { useIsNarrowScreen } from "@/lib/use-is-narrow-screen";

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

type Me = { username: string; id: string; name?: string; email?: string };

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
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";

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
  const [activeCallMode, setActiveCallMode] = useState<"video" | "voice" | null>(
    null,
  );
  /** Channel / DM label at the moment the call was started (stable while overlay is open). */
  const [callSubjectLabel, setCallSubjectLabel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"members" | "files" | "settings">("members");
  const [dragActive, setDragActive] = useState(false);
  const isNarrow = useIsNarrowScreen();
  const [mobileShowRoomList, setMobileShowRoomList] = useState(true);

  // Resizable column widths (persisted per browser).
  // Sidebar = left rail with rooms / DMs.
  // Call panel = right rail (only present while a call is active).
  const sidebarResize = useResizableWidth({
    storageKey: "chat:sidebar",
    defaultWidth: 256, // matches the original w-64
    tabletDefault: 216,
    viewportMaxRatio: 0.22,
    min: 180,
    max: 420,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  // Close the create-menu popover whenever the user clicks elsewhere.
  useEffect(() => {
    if (!createMenuOpen) return;
    const onDown = (ev: PointerEvent) => {
      const node = createMenuRef.current;
      if (node && !node.contains(ev.target as Node)) setCreateMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [createMenuOpen]);

  useEffect(() => {
    if (!isNarrow) setMobileShowRoomList(true);
  }, [isNarrow]);

  /** Eingehender Chat-Ring: „Annehmen (hier)“ legt Session-Payload und landet im Chat. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(PENDING_CHAT_MEETING_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_CHAT_MEETING_KEY);
      const j = JSON.parse(raw) as PendingChatMeeting;
      if (!j?.joinUrl || typeof j.joinUrl !== "string") return;
      setCallLink(j.joinUrl);
      setActiveCallMode(j.callMedia === "voice" ? "voice" : "video");
      setCallSubjectLabel(
        typeof j.subject === "string" && j.subject.trim()
          ? j.subject
          : t("chat.defaultMeetingSubject"),
      );
      setCallPanelOpen(true);
      const rid = typeof j.ringMessageId === "string" ? j.ringMessageId.trim() : "";
      if (rid) {
        void fetch(
          `/api/comms/call-ring/dismiss?ws=${encodeURIComponent(workspace)}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: rid }),
          },
        );
      }
    } catch {
      /* noop */
    }
  }, [workspace, t]);

  // Stable lookup by ID. Re-runs only when rooms list or selection changes.
  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  );

  // Type for the active room is stable for a given roomId (DMs stay DMs etc),
  // so we keep it in a ref to avoid pulling the room *object* into effect deps.
  const activeTypeRef = useRef<ChatRoom["type"] | null>(null);
  if (activeRoom) activeTypeRef.current = activeRoom.type;

  /** Bumped on every messages fetch; stale responses must not call setMessages (room switch race). */
  const messagesFetchGen = useRef(0);
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
      const myGen = ++messagesFetchGen.current;
      if (showSpinner) setMessagesLoading(true);
      try {
        const r = await fetch(
          `/api/chat/messages?roomId=${roomId}&type=${type}&count=80`,
          { cache: "no-store" },
        );
        if (myGen !== messagesFetchGen.current) return;
        if (r.ok) {
          const j = (await r.json()) as { messages: ChatMessage[] };
          setMessages(j.messages);
        } else if (showSpinner) {
          setMessages([]);
        }
      } catch {
        // swallow on background polls
      } finally {
        if (showSpinner && myGen === messagesFetchGen.current) {
          setMessagesLoading(false);
        }
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

  // Mobile/tablet Safari throttles setInterval aggressively in background tabs;
  // Kathrin sieht dann die Video-Einladung erst sehr spät. Beim Zurück zur App synchronisieren.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void refreshRooms();
      const id = activeRoomId;
      const type = activeTypeRef.current;
      if (id && type) void refreshMessages(id, type, false);
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [activeRoomId, refreshMessages, refreshRooms]);

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
          alert(t("chat.alert.uploadFailed") + (e.error ?? r.statusText));
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
        alert(t("chat.alert.sendFailed") + (e.error ?? r.statusText));
        setComposer(text);
      }
    } finally {
      setSending(false);
    }
  }, [activeRoom, composer, pendingFile, t]);

  const pickRoom = useCallback(
    (id: string | null) => {
      setActiveRoomId(id);
      if (isNarrow && id) setMobileShowRoomList(false);
    },
    [isNarrow],
  );

  const startCall = useCallback(
    async (mode: "video" | "voice") => {
      if (!activeRoom) return;
      const r = await fetch("/api/chat/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: activeRoom.id,
          roomName: activeRoom.name,
          roomType: activeRoom.type,
          portalWorkspace: workspace,
          postInvite: false,
          callMode: mode,
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { link: string };
        setCallLink(j.link);
        setActiveCallMode(mode);
        setCallSubjectLabel(
          `Chat · ${activeRoom.displayName ?? activeRoom.name}`,
        );
        setCallPanelOpen(true);
      } else {
        alert(t("chat.alert.startCallFailed"));
      }
    },
    [activeRoom, workspace, t],
  );

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
        pickRoom(j.roomId);
        setShowNewChat(false);
      }
    },
    [refreshRooms, pickRoom],
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
      a.team.displayName.localeCompare(b.team.displayName, localeTag),
    );
    // Sort sub-channels alphabetically
    for (const g of sortedGroups) {
      g.subs.sort((a, b) =>
        prettyChannelName(a, g.team).localeCompare(
          prettyChannelName(b, g.team),
          localeTag,
        ),
      );
    }
    return { teamGroups: sortedGroups, looseChannels: loose, dmRooms: dms };
  }, [visibleRooms, teams, localeTag]);

  /* ─────────────────────────────── UI ───────────────────────────── */

  return (
    <div className="flex h-full min-h-0 bg-bg-chrome md:bg-gradient-to-br md:from-bg-chrome md:via-bg-chrome md:to-bg-base md:p-3 text-text-primary text-[13px] overflow-hidden">
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden md:rounded-2xl md:border md:border-stroke-1 md:bg-bg-base md:shadow-xl md:shadow-black/20">
      {/* ─── Sidebar: Rooms ─────────────────────────────────────── */}
      <aside
        className={`shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col min-h-0 touch-manipulation ${
          isNarrow
            ? mobileShowRoomList
              ? "flex w-full min-w-0 flex-1"
              : "hidden"
            : ""
        }`}
        style={isNarrow ? undefined : { width: sidebarResize.width }}
      >
        <div className="p-3 border-b border-stroke-1 flex items-center gap-2">
          <div className="relative flex-1">
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
          <div className="relative" ref={createMenuRef}>
            <button
              onClick={() => setCreateMenuOpen((v) => !v)}
              className="p-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] text-white"
              title={t("chat.createMenuTitle")}
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
                  {t("chat.newDm")}
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
                  {`${t("chat.newChannel")} …`}
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
              label={t("chat.channelsSection")}
              rooms={looseChannels}
              activeId={activeRoomId}
              onSelect={pickRoom}
            />
          )}

          {/* MS-Teams-style team sections */}
          {teamGroups.length === 0 && looseChannels.length === 0 && (
            <div className="px-3 py-3 text-text-tertiary text-[11px] italic">
              {t("chat.sidebar.emptyTeamsLine1").replace(
                "{workspace}",
                workspaceLabel,
              )}
              <br />
              {t("chat.sidebar.emptyTeamsLine2")}
            </div>
          )}
          {teamGroups.map(({ team, main, subs }) => (
            <TeamSection
              key={team.id}
              team={team}
              main={main}
              subs={subs}
              activeId={activeRoomId}
              onSelect={pickRoom}
            />
          ))}

          <SidebarSection
            label={t("chat.dmSection")}
            rooms={dmRooms}
            activeId={activeRoomId}
            onSelect={pickRoom}
            empty={t("chat.dmEmpty")}
          />
        </div>

        <div className="border-t border-stroke-1 p-2 flex items-center gap-2 text-[11px] text-text-tertiary">
          <Avatar name={initialMe.username} size={20} />
          <span className="truncate flex-1 text-text-secondary">@{initialMe.username}</span>
          <button
            onClick={refreshRooms}
            className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title={t("chat.refreshRooms")}
          >
            {roomsLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
      </aside>

      {!isNarrow && (
      <ResizeHandle
        onPointerDown={sidebarResize.startDrag}
        ariaLabel={t("chat.sidebarResizeAria")}
      />
      )}

      {/* ─── Main Pane ──────────────────────────────────────────── */}
      <section
        className={`flex-1 flex flex-col min-w-0 bg-bg-base min-h-0 touch-manipulation ${
          isNarrow && mobileShowRoomList ? "hidden" : ""
        }`}
      >
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary gap-2">
            <Hash size={48} className="opacity-30" />
            <p className="text-sm">{t("chat.pickRoomHint")}</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-stroke-1 flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-3 bg-bg-base">
              {isNarrow && (
                <button
                  type="button"
                  onClick={() => setMobileShowRoomList(true)}
                  className="shrink-0 p-2 -ml-1 rounded-lg hover:bg-bg-overlay text-text-secondary active:bg-bg-overlay min-h-11 min-w-11 flex items-center justify-center"
                  aria-label={t("chat.backToChannelListAria")}
                >
                  <ChevronLeft size={22} strokeWidth={2} />
                </button>
              )}
              <RoomIcon room={activeRoom} />
              <div className="flex-1 min-w-0">
                <h1 className="text-[15px] font-semibold text-text-primary truncate flex items-center gap-2">
                  {(() => {
                    const team = activeRoom.teamId
                      ? teams.find((tm) => tm.id === activeRoom.teamId)
                      : null;
                    const label = activeRoom.teamMain
                      ? t("chat.generalChannel")
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
                            aria-label={t("chat.privateAria")}
                          />
                        )}
                      </>
                    );
                  })()}
                </h1>
                {activeRoom.lastMessage && (
                  <div className="text-text-tertiary text-[11px] truncate">
                    {t("chat.lastActivePrefix")}{" "}
                    {new Date(activeRoom.lastMessage.at).toLocaleString(localeTag, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-wrap justify-end max-md:max-w-[45vw]">
                <button
                  type="button"
                  onClick={() => void startCall("video")}
                  className="flex items-center gap-1 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] text-white px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 text-[12px] font-medium touch-manipulation"
                  title={t("chat.videoCallTitle")}
                >
                  <Video size={14} />
                  <span className="hidden sm:inline">{t("chat.video")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void startCall("voice")}
                  className="flex items-center gap-1 rounded-md border border-stroke-1 bg-bg-elevated hover:bg-bg-overlay text-text-primary px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 text-[12px] font-medium touch-manipulation"
                  title={t("chat.voiceCallTitle")}
                >
                  <Phone size={14} className="text-emerald-500" />
                  <span className="hidden sm:inline">{t("chat.tel")}</span>
                </button>
              </div>
              <button
                onClick={() => {
                  setDrawerTab("files");
                  setShowSettings(true);
                }}
                className="hidden sm:flex items-center gap-1.5 rounded-md hover:bg-bg-overlay text-text-secondary hover:text-text-primary border border-stroke-1 px-2.5 py-1.5 text-[12px] font-medium"
                title={t("chat.filesTitle")}
                aria-label={t("chat.filesTitle")}
              >
                <FileText size={14} />
                {t("chat.files")}
              </button>
              <button
                onClick={() => {
                  setDrawerTab("files");
                  setShowSettings(true);
                }}
                className="sm:hidden flex items-center justify-center rounded-md hover:bg-bg-overlay text-text-secondary border border-stroke-1 p-2 min-h-10 min-w-10 touch-manipulation"
                title={t("chat.files")}
                aria-label={t("chat.filesTitle")}
              >
                <FileText size={16} />
              </button>
              {activeRoom.type !== "d" && (
                <button
                  onClick={() => {
                    setDrawerTab("members");
                    setShowSettings(true);
                  }}
                  className="p-2 sm:p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary border border-transparent hover:border-stroke-1 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 flex items-center justify-center touch-manipulation shrink-0"
                  title={t("chat.channelSettings")}
                  aria-label={t("chat.channelSettings")}
                >
                  <Settings size={16} />
                </button>
              )}
            </div>

            {/* Messages */}
            <div
              className={`flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-4 relative overscroll-y-contain ${
                dragActive ? "bg-[#5b5fc7]/5" : ""
              }`}
              onDragEnter={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDragActive(true);
                }
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDragLeave={(e) => {
                const rt = e.relatedTarget as Node | null;
                if (!rt || !(e.currentTarget as Node).contains(rt)) {
                  setDragActive(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setPendingFile(f);
              }}
            >
              {messagesLoading && messages.length === 0 && (
                <div className="text-text-tertiary text-xs flex items-center justify-center py-12">
                  <Loader2 size={20} className="spin mr-2" />{" "}
                  {t("chat.loadingMessages")}
                </div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="text-text-tertiary text-xs text-center py-12">
                  {t("chat.noMessagesYet")}
                </div>
              )}
              {messages.map((m, i) => {
                if (isInviteContinuation(messages, i)) return null;
                const prev = messages[i - 1];
                const invGroup = takeInviteGroup(messages, i);
                const info = portalInviteInfo(m);
                if (info && invGroup.length > 1) {
                  return (
                    <MessageBubble
                      key={`invite-group-${invGroup[0].id}`}
                      msg={m}
                      prev={prev}
                      selfUsername={initialMe.username}
                      assetBase={rocketChatWebBase}
                      inviteGroup={invGroup}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    prev={prev}
                    selfUsername={initialMe.username}
                    assetBase={rocketChatWebBase}
                  />
                );
              })}
              <div ref={messagesEndRef} />
              {dragActive && (
                <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-[#5b5fc7] bg-[#5b5fc7]/10 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-[#5b5fc7] text-sm font-medium bg-bg-base px-4 py-2 rounded-md shadow">
                    <Paperclip size={16} />
                    {t("chat.dropFileHint")}
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-stroke-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              {pendingFile && (
                <div className="mb-2 flex items-center gap-2 text-[11px] text-text-secondary">
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate flex-1 font-mono">{pendingFile.name}</span>
                  <span className="text-text-tertiary">{(pendingFile.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    className="p-0.5 rounded hover:bg-bg-overlay text-text-tertiary"
                    title={t("chat.removeAttachmentTitle")}
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
                      ? t("chat.captionPlaceholder")
                      : t("chat.messageTo").replace(
                          "{name}",
                          activeRoom.displayName || activeRoom.name,
                        )
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
                  title={t("chat.sendTitle")}
                >
                  {sending ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <SendIcon size={14} />
                  )}
                </button>
              </div>
              <div className="mt-1 text-[10px] text-text-tertiary hidden sm:block">
                {t("chat.composerHintDesktop")}
              </div>
              <div className="mt-1 text-[10px] text-text-tertiary sm:hidden">
                {t("chat.composerHintMobile")}
              </div>
            </div>
          </>
        )}
      </section>

      </div>

      {/* ─── Call overlay (Teams-style full stage, portal to body) ─ */}
      {callPanelOpen && callLink && activeCallMode && (
        <MeetingCallOverlay
          joinUrl={callLink}
          callMode={activeCallMode}
          displayName={initialMe.name ?? initialMe.username}
          email={initialMe.email?.trim() ?? ""}
          subject={callSubjectLabel ?? t("chat.defaultMeetingSubject")}
          workspaceLabel={workspaceLabel}
          onClose={() => {
            setCallPanelOpen(false);
            setCallLink(null);
            setActiveCallMode(null);
            setCallSubjectLabel(null);
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
            pickRoom(roomId);
            setShowNewChannel(false);
          }}
        />
      )}

      {/* ─── Channel Settings Drawer ────────────────────────────── */}
      {showSettings && activeRoom && (
        <ChannelSettingsDrawer
          room={activeRoom}
          selfUsername={initialMe.username}
          rocketChatWebBase={rocketChatWebBase}
          initialTab={
            activeRoom.type === "d"
              ? "files"
              : drawerTab
          }
          allowedTabs={
            activeRoom.type === "d"
              ? ["files"]
              : ["members", "files", "settings"]
          }
          onClose={() => setShowSettings(false)}
          onUpdated={async () => {
            await refreshRooms();
          }}
          onArchived={async () => {
            await refreshRooms();
            setShowSettings(false);
            setActiveRoomId(null);
            setMobileShowRoomList(true);
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
  const t = useT();
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
              labelOverride={t("chat.generalChannel")}
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
              {t("chat.team.noChannelsYet")}
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

type PortalInviteInfo = { kind: "video" | "voice"; url: string };

function portalInviteInfo(msg: ChatMessage): PortalInviteInfo | null {
  const t = msg.text ?? "";
  const kindFromText = t ? portalCallInviteKind(t) : null;
  const urlFromText = t ? extractMeetUrlFromRocketchatMessage(t) : null;
  if (kindFromText && urlFromText) return { kind: kindFromText, url: urlFromText };

  const attachUrl = extractMeetUrlFromAttachments(msg.attachments);
  if (!attachUrl) return null;

  const kind: PortalInviteInfo["kind"] =
    kindFromText ??
    (/sprach-anruf|sprachanruf|\bvoice\b|audio-only|nur audio/i.test(t)
      ? "voice"
      : "video");
  return { kind, url: attachUrl };
}

function isSameInviteChain(a: PortalInviteInfo | null, b: PortalInviteInfo | null) {
  return !!(a && b && a.kind === b.kind && a.url === b.url);
}

/** Skip render: same Jitsi invite as the message above (grouped into one card). */
function isInviteContinuation(messages: ChatMessage[], i: number): boolean {
  if (i <= 0) return false;
  return isSameInviteChain(portalInviteInfo(messages[i]), portalInviteInfo(messages[i - 1]));
}

/** Consecutive messages with the same portal invite URL + kind (video/voice). */
function takeInviteGroup(messages: ChatMessage[], start: number): ChatMessage[] {
  const first = portalInviteInfo(messages[start]);
  if (!first) return [messages[start]];
  const out = [messages[start]];
  for (let j = start + 1; j < messages.length; j++) {
    const info = portalInviteInfo(messages[j]);
    if (!isSameInviteChain(first, info)) break;
    out.push(messages[j]);
  }
  return out;
}

function formatInviteHm(iso: string, localeTag: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Echte „klingelnde“ Eingänge laufen über IncomingCallPortal.
 * Nur ganz frische Nachrichten: eine schmale Zeile mit Beitreten; danach nur
 * eine Zeile wie System-Hinweis (kein Karten-Look).
 */
const PORTAL_INVITE_JOIN_WINDOW_MS = 3 * 60 * 1000;

function isPortalInviteJoinWindow(latestAtIso: string): boolean {
  const t = new Date(latestAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= PORTAL_INVITE_JOIN_WINDOW_MS;
}

/** Für „vergangener Anruf, gestern 12:40 …“ */
function formatPastInviteWhen(
  iso: string,
  rangeEndIso: string | undefined,
  localeTag: string,
  tr: (key: keyof Messages) => string,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const end = rangeEndIso ? new Date(rangeEndIso) : d;
  const hmDate = (x: Date) =>
    x.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
  const dayKey = (x: Date) =>
    `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (rangeEndIso && rangeEndIso !== iso && !Number.isNaN(end.getTime())) {
    if (dayKey(d) === dayKey(end)) {
      return tr("chat.invite.when.sameDayRange")
        .replace("{start}", hmDate(d))
        .replace("{end}", hmDate(end));
    }
    return `${d.toLocaleString(localeTag, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}–${hmDate(end)}`;
  }
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (d0.getTime() === today0.getTime()) {
    return tr("chat.invite.when.today").replace("{hm}", hmDate(d));
  }
  const y0 = new Date(today0);
  y0.setDate(y0.getDate() - 1);
  if (d0.getTime() === y0.getTime()) {
    return tr("chat.invite.when.yesterday").replace("{hm}", hmDate(d));
  }
  return d.toLocaleString(localeTag, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact label for one or more chat users (deduped by username). */
function formatInviteSenderLabel(msgs: ChatMessage[], allSelf: boolean): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const m of msgs) {
    const u = m.user.username;
    if (seen.has(u)) continue;
    seen.add(u);
    labels.push(m.user.name ?? m.user.username);
  }
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} · ${labels[1]}`;
  if (allSelf) return labels[0];
  return `${labels[0]} · ${labels[1]} +${labels.length - 2}`;
}

/** Einladung von mir → „Vergangener …“, von anderem → „Verpasster …“. */
function callInvitePastLabel(
  fromSelf: boolean,
  media: "video" | "voice",
  tr: (key: keyof Messages) => string,
): string {
  if (fromSelf) {
    return media === "video"
      ? tr("chat.invite.pastVideoSelf")
      : tr("chat.invite.pastVoiceSelf");
  }
  return media === "video"
    ? tr("chat.invite.pastVideoOther")
    : tr("chat.invite.pastVoiceOther");
}

/** Kurze Join-Zeile nur in den ersten Minuten (danach nur Historienzeile). */
function CallInviteSlimRow({
  kind,
  joinUrl,
  at,
  senderLabel,
  sameRoomCount,
  fromSelf,
}: {
  kind: "video" | "voice";
  joinUrl: string;
  at: string;
  senderLabel: string;
  sameRoomCount?: number;
  fromSelf: boolean;
}) {
  const tr = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const isVideo = kind === "video";
  const slimTitle = fromSelf
    ? isVideo
      ? tr("chat.invite.activeVideo")
      : tr("chat.invite.activeVoice")
    : callInvitePastLabel(false, kind, tr);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-l border-stroke-1/80 pl-2 text-[11px] leading-snug text-text-tertiary">
      {isVideo ? (
        <Video size={12} className="shrink-0 text-text-quaternary opacity-80" aria-hidden />
      ) : (
        <Phone size={12} className="shrink-0 text-text-quaternary opacity-80" aria-hidden />
      )}
      <span className="text-text-secondary">
        {slimTitle}
        {sameRoomCount && sameRoomCount > 1 ? (
          <span className="text-text-quaternary">
            {" "}
            {tr("chat.invite.sameRoomParen").replace(
              "{count}",
              String(sameRoomCount),
            )}
          </span>
        ) : null}
      </span>
      <span className="text-text-quaternary">{formatInviteHm(at, localeTag)}</span>
      <span className="text-text-quaternary">·</span>
      <span className="truncate max-w-[10rem] sm:max-w-[16rem]">{senderLabel}</span>
      <a
        href={joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-text-secondary hover:text-text-primary hover:underline"
      >
        {tr("chat.invite.join")}
      </a>
    </div>
  );
}

/** Vergangene Einladungen: eine kursiv-Zeile, kein großer Block. */
function CallInviteHistoryLine({
  kind,
  joinUrl,
  firstAt,
  lastAt,
  senderLabel,
  sameRoomCount,
  fromSelf,
}: {
  kind: "video" | "voice";
  joinUrl: string;
  firstAt: string;
  lastAt: string;
  senderLabel: string;
  sameRoomCount?: number;
  fromSelf: boolean;
}) {
  const tr = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const when =
    sameRoomCount && sameRoomCount > 1
      ? formatPastInviteWhen(firstAt, lastAt, localeTag, tr)
      : formatPastInviteWhen(lastAt, undefined, localeTag, tr);
  const multi =
    sameRoomCount && sameRoomCount > 1
      ? tr("chat.invite.historySameRoomPrefix").replace(
          "{count}",
          String(sameRoomCount),
        )
      : "";
  const head = callInvitePastLabel(fromSelf, kind, tr);
  return (
    <p className="text-[11px] leading-snug text-text-quaternary italic pl-0.5">
      {head}, {multi}
      {when} — {senderLabel}
      {" · "}
      <a
        href={joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-tertiary not-italic hover:text-text-secondary hover:underline"
      >
        {tr("chat.invite.linkLabel")}
      </a>
    </p>
  );
}

function MessageBubble({
  msg,
  prev,
  selfUsername,
  assetBase,
  inviteGroup,
}: {
  msg: ChatMessage;
  prev?: ChatMessage;
  selfUsername: string;
  assetBase: string;
  /** Consecutive portal invites — same Jitsi URL; rendered as one card. */
  inviteGroup?: ChatMessage[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const group = inviteGroup;
  const isSelf = msg.user.username === selfUsername;
  const portalInvite = portalInviteInfo(msg);
  const inviteKind = portalInvite?.kind ?? null;
  const inviteUrl = portalInvite?.url ?? null;
  const showCallInvite = portalInvite !== null;
  const inviteLatestAt = group?.length ? group[group.length - 1].at : msg.at;
  const inviteFirstAt = group?.length ? group[0].at : msg.at;
  const inviteInJoinWindow =
    showCallInvite && isPortalInviteJoinWindow(inviteLatestAt);
  const allSelfInGroup = group
    ? group.every((m) => m.user.username === selfUsername)
    : isSelf;
  const groupedWithPrev =
    !portalInvite &&
    !group &&
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

  const inviteOnly = showCallInvite;
  return (
    <div
      className={
        inviteOnly
          ? `min-w-0 ${groupedWithPrev ? "mt-0.5" : "mt-2"} pl-11`
          : `flex gap-3 ${groupedWithPrev ? "mt-0.5" : "mt-4"}`
      }
    >
      {!inviteOnly && (
        <div className="w-8 shrink-0">
          {!groupedWithPrev && <Avatar name={msg.user.username} size={32} />}
        </div>
      )}
      <div className={inviteOnly ? "min-w-0" : "flex-1 min-w-0"}>
        {!groupedWithPrev && !showCallInvite && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className={`text-[13px] font-semibold ${
                isSelf ? "text-[#5b5fc7]" : "text-text-primary"
              }`}
            >
              {msg.user.name ?? msg.user.username}
            </span>
            <span className="text-text-tertiary text-[11px]">
              {new Date(msg.at).toLocaleTimeString(localeTag, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        {inviteKind && inviteUrl ? (
          inviteInJoinWindow ? (
            <CallInviteSlimRow
              kind={inviteKind}
              joinUrl={inviteUrl}
              at={inviteLatestAt}
              fromSelf={allSelfInGroup}
              senderLabel={
                group && group.length > 1
                  ? formatInviteSenderLabel(group, allSelfInGroup)
                  : (msg.user.name ?? msg.user.username)
              }
              sameRoomCount={
                group && group.length > 1 ? group.length : undefined
              }
            />
          ) : (
            <CallInviteHistoryLine
              kind={inviteKind}
              joinUrl={inviteUrl}
              firstAt={inviteFirstAt}
              lastAt={inviteLatestAt}
              fromSelf={allSelfInGroup}
              senderLabel={
                group && group.length > 1
                  ? formatInviteSenderLabel(group, allSelfInGroup)
                  : (msg.user.name ?? msg.user.username)
              }
              sameRoomCount={
                group && group.length > 1 ? group.length : undefined
              }
            />
          )
        ) : msg.text ? (
          <div
            className="text-[13px] leading-relaxed text-text-primary whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: renderMessageBody(msg.text) }}
          />
        ) : null}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-1 space-y-1.5">
            {msg.attachments.map((a, i) => {
              const rawLink = a.titleLink;
              if (
                showCallInvite &&
                attachmentLooksLikeMeetLinkPreview(rawLink)
              ) {
                return null;
              }
              const imgUrl = a.imageUrl
                ? resolveRcAssetUrl(a.imageUrl, assetBase)
                : null;
              const fileUrl = rawLink
                ? resolveRcAssetUrl(rawLink, assetBase)
                : null;
              if (
                fileUrl &&
                attachmentLooksLikeMeetLinkPreview(fileUrl)
              ) {
                return (
                  <p key={i} className="text-[11px] text-text-quaternary">
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-text-secondary hover:underline"
                    >
                      {t("chat.bubble.meetingLink")}
                    </a>
                    {a.title ? (
                      <span className="text-text-quaternary"> · {a.title}</span>
                    ) : null}
                  </p>
                );
              }
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
                      {a.title || t("chat.bubble.fileFallback")}
                    </a>
                  ) : (
                    <span className="text-text-tertiary">
                      {a.title || t("chat.bubble.attachmentFallback")}
                    </span>
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


function NewChatModal({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (username: string) => void;
}) {
  const tr = useT();
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
    const searchTimer = setTimeout(async () => {
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
      clearTimeout(searchTimer);
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
          <h3 className="font-semibold text-[13px] flex-1">{tr("chat.newDmModal.title")}</h3>
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
            placeholder={tr("chat.newDmModal.placeholder")}
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              <Loader2 size={16} className="spin inline mr-1" />{" "}
              {tr("chat.newDmModal.searching")}
            </div>
          )}
          {!loading && q.length >= 2 && results.length === 0 && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              {tr("chat.newDmModal.noResults")}
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
  const t = useT();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [teamId, setTeamId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = useMemo(() => slugify(name), [name]);

  // Filter teams to those visible in this workspace, but always allow "no team".
  const wsTeams = useMemo(
    () => teams.filter((tm) => tm.workspace === workspace),
    [teams, workspace],
  );

  const submit = async () => {
    setError(null);
    if (slug.length < 2) {
      setError(t("chat.newChannelModal.errorMinLength"));
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
          setError(t("chat.newChannelModal.errorDuplicateName"));
        } else {
          setError(
            j.error ??
              t("chat.newChannelModal.errorGeneric").replace(
                "{status}",
                String(r.status),
              ),
          );
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
            {t("chat.newChannelModal.title").replace("{workspace}", workspaceLabel)}
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
              {t("chat.newChannelModal.nameLabel")}
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("chat.newChannelModal.namePlaceholder")}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              maxLength={64}
            />
            {slug && slug !== name && (
              <p className="text-[11px] text-text-tertiary mt-1">
                {t("chat.newChannelModal.slugSavedAsPrefix")}{" "}
                <span className="font-mono">#{slug}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              {t("chat.newChannelModal.topicLabel")}
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("chat.newChannelModal.topicPlaceholder")}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              maxLength={200}
            />
          </div>

          {wsTeams.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                {t("chat.newChannelModal.teamLabel")}
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
              >
                <option value="">{t("chat.newChannelModal.noTeamOption")}</option>
                {wsTeams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.displayName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-text-tertiary mt-1">
                {t("chat.newChannelModal.teamHint")}
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
                  {t("chat.settings.public")}
                </div>
                <p className="text-[11px] text-text-tertiary">
                  {t("chat.newChannelModal.publicHint").replace(
                    "{workspace}",
                    workspaceLabel,
                  )}
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
                  {t("chat.settings.private")}
                </div>
                <p className="text-[11px] text-text-tertiary">
                  {t("chat.inviteOnlySidebarHint")}
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
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={submitting || slug.length < 2}
            className="px-3 py-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] disabled:opacity-50 text-white text-[12px] font-medium flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={12} className="spin" />}
            {t("chat.newChannelModal.createButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

type DrawerTab = "members" | "files" | "settings";

function ChannelSettingsDrawer({
  room,
  selfUsername,
  rocketChatWebBase,
  initialTab,
  allowedTabs,
  onClose,
  onUpdated,
  onArchived,
}: {
  room: ChatRoom;
  selfUsername: string;
  rocketChatWebBase: string;
  initialTab?: DrawerTab;
  allowedTabs?: DrawerTab[];
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
  onArchived: () => void | Promise<void>;
}) {
  type Tab = DrawerTab;
  const t = useT();
  const tabsToShow: Tab[] = allowedTabs ?? ["members", "files", "settings"];
  const [tab, setTab] = useState<Tab>(
    initialTab && tabsToShow.includes(initialTab) ? initialTab : tabsToShow[0],
  );
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
  const narrow = useIsNarrowScreen();
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const drawerInner = (
    <>
      <div className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2 bg-bg-elevated">
        <div className="w-8 h-8 rounded bg-[#5b5fc7]/20 flex items-center justify-center shrink-0">
          {type === "d" ? (
            <UserIcon size={14} className="text-[#5b5fc7]" />
          ) : type === "p" ? (
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
          title={t("chat.drawer.closeTitle")}
        >
          <X size={15} />
        </button>
      </div>

      <div className="border-b border-stroke-1 flex">
        {(
          [
            ["members", t("chat.tab.members"), UsersIcon],
            ["files", t("chat.tab.files"), FileText],
            ["settings", t("chat.tab.settings"), Settings],
          ] as const
        )
          .filter(([key]) => tabsToShow.includes(key))
          .map(([key, label, Icon]) => (
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
    </>
  );

  if (narrow && portalReady && typeof document !== "undefined") {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[248] bg-black/50 touch-manipulation"
          onClick={onClose}
          aria-label={t("chat.drawer.closeAria")}
        />
        <aside
          className="fixed inset-y-0 right-0 z-[250] flex w-full max-w-[min(100vw,480px)] flex-col border-l border-stroke-1 bg-bg-chrome shadow-2xl pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] min-h-0"
          role="dialog"
          aria-modal="true"
        >
          {drawerInner}
        </aside>
      </>,
      document.body,
    );
  }

  return (
    <aside className="w-[min(100%,420px)] sm:w-[400px] shrink-0 border-l border-stroke-1 bg-bg-chrome flex flex-col shadow-2xl min-h-0">
      {drawerInner}
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
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);

  const remove = async (username: string) => {
    if (
      !confirm(
        t("chat.members.confirmRemove").replace("{username}", username),
      )
    )
      return;
    onError(null);
    const r = await fetch(
      `/api/chat/channels/${encodeURIComponent(roomId)}/members?username=${encodeURIComponent(username)}&type=${roomType}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      onError(
        j.error === "forbidden"
          ? t("chat.members.forbiddenRemove")
          : (j.error ??
              t("chat.members.errorStatus").replace("{status}", String(r.status))),
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
          {t("chat.members.invite")}
        </button>
      )}

      {loading && members.length === 0 && (
        <div className="text-text-tertiary text-xs flex items-center justify-center py-8">
          <Loader2 size={14} className="spin mr-2" />
          {t("chat.members.loading")}
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
                    aria-label={t("chat.members.ownerAria")}
                  />
                )}
                {m.isModerator && !m.isOwner && (
                  <Shield
                    size={11}
                    className="text-sky-400"
                    aria-label={t("chat.members.moderator")}
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
                className="p-1.5 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 opacity-[0.52] group-hover:opacity-100 transition-opacity"
                title={t("chat.members.removeTooltip").replace(
                  "{username}",
                  m.username,
                )}
              >
                <UserMinus size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!loading && members.length === 0 && (
        <div className="text-text-tertiary text-xs text-center py-8">
          {t("chat.members.none")}
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
  const tr = useT();
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
    const debounceTimer = window.setTimeout(async () => {
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
      window.clearTimeout(debounceTimer);
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
            ? tr("chat.members.inviteForbidden")
            : j.error === "user-not-found"
              ? tr("chat.members.userNotFound").replace("{username}", username)
              : (j.error ??
                  tr("chat.members.errorStatus").replace(
                    "{status}",
                    String(r.status),
                  )),
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
            {tr("chat.members.inviteModalTitle")}
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
            placeholder={tr("chat.members.searchPlaceholder")}
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[13px] py-2 px-3 outline-none focus:border-stroke-2"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              <Loader2 size={16} className="spin inline mr-1" />{" "}
              {tr("chat.members.searching")}
            </div>
          )}
          {!loading && q.length >= 2 && results.length === 0 && (
            <div className="p-4 text-text-tertiary text-xs text-center">
              {tr("chat.members.noResults")}
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
                    {tr("chat.members.member")}
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
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const countLabel =
    files.length === 1
      ? t("chat.files.channelCountOne").replace("{count}", String(files.length))
      : t("chat.files.channelCountMany").replace("{count}", String(files.length));

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span>{countLabel}</span>
        <button
          onClick={() => void onRefresh()}
          className="p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title={t("chat.refreshRooms")}
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {loading && files.length === 0 && (
        <div className="text-text-tertiary text-xs flex items-center justify-center py-8">
          <Loader2 size={14} className="spin mr-2" />
          {t("chat.files.loadingLabel")}
        </div>
      )}
      {!loading && files.length === 0 && (
        <div className="text-text-tertiary text-xs text-center py-8 px-4 leading-relaxed">
          {t("chat.files.empty")}
          <br />
          <span className="text-[11px]">{t("chat.files.emptyDetail")}</span>
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
                        {new Date(f.uploadedAt).toLocaleDateString(localeTag)}
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
  const tr = useT();
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
        onError(
          j.error ??
            tr("chat.members.errorStatus").replace("{status}", String(r.status)),
        );
        return;
      }
      await onUpdated();
    } finally {
      setSavingTopic(false);
    }
  };

  const togglePrivacy = async () => {
    const targetWord =
      room.type === "p"
        ? tr("chat.settings.visibilityPublicWord")
        : tr("chat.settings.visibilityPrivateWord");
    if (
      !confirm(
        tr("chat.settings.visibilityConfirm").replace("{target}", targetWord),
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
        onError(
          j.error ??
            tr("chat.members.errorStatus").replace("{status}", String(r.status)),
        );
        return;
      }
      await onUpdated();
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const archive = async () => {
    if (!confirm(tr("chat.settings.archiveConfirm"))) return;
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
        onError(
          j.error ??
            tr("chat.members.errorStatus").replace("{status}", String(r.status)),
        );
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
          {tr("chat.settings.sectionDescription")}
        </h4>
        <textarea
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={!canEdit}
          placeholder={tr("chat.settings.topicPlaceholder")}
          className="w-full bg-bg-elevated border border-stroke-1 rounded-md text-[12.5px] py-2 px-3 outline-none focus:border-stroke-2 resize-none disabled:opacity-60"
          maxLength={250}
        />
        {canEdit && dirtyTopic && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setTopic(room.topic ?? "")}
              className="px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-overlay rounded-md"
            >
              {tr("chat.settings.discard")}
            </button>
            <button
              onClick={() => void saveTopic()}
              disabled={savingTopic}
              className="px-3 py-1.5 rounded-md bg-[#5b5fc7] hover:bg-[#4f52b2] disabled:opacity-50 text-white text-[12px] font-medium flex items-center gap-1.5"
            >
              {savingTopic && <Loader2 size={11} className="spin" />}
              {tr("chat.settings.save")}
            </button>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          {tr("chat.settings.visibility")}
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
              {room.type === "p"
                ? tr("chat.settings.private")
                : tr("chat.settings.public")}
            </div>
            <p className="text-[11px] text-text-tertiary">
              {room.type === "p"
                ? tr("chat.settings.privateHint")
                : tr("chat.settings.publicHint")}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => void togglePrivacy()}
              disabled={togglingPrivacy}
              className="px-2.5 py-1 text-[11px] rounded-md border border-stroke-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50 flex items-center gap-1"
            >
              {togglingPrivacy && <Loader2 size={10} className="spin" />}
              {tr("chat.settings.toggleVisibility").replace(
                "{target}",
                room.type === "p"
                  ? tr("chat.settings.visibilityPublicWord")
                  : tr("chat.settings.visibilityPrivateWord"),
              )}
            </button>
          )}
        </div>
      </section>

      {canEdit && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            {tr("chat.settings.dangerZone")}
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
            {tr("chat.settings.archive")}
          </button>
          <p className="text-[10.5px] text-text-tertiary mt-1.5">
            {tr("chat.settings.archiveHint")}
          </p>
        </section>
      )}

      {!canEdit && (
        <p className="text-[11px] text-text-tertiary italic">
          {tr("chat.settings.restricted")}
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
