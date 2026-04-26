import "server-only";

export type ChatRoomType = "c" | "p" | "d";

export type ChatRoom = {
  id: string;
  type: ChatRoomType;
  /** Slug-style internal name (`kineo-escherwyss`). */
  name: string;
  /** Display name (Rocket.Chat `fname`, falls back to `name`). */
  displayName: string;
  topic?: string;
  unread: number;
  lastMessage?: {
    text: string;
    at: string;
    by: string;
  };
  membersCount?: number;
  // For DMs the "name" we show is the other participant
  dmPartnerUsername?: string;
  /** Team grouping: id of the parent team (if this room belongs to one). */
  teamId?: string;
  /** True if this room IS the team's main channel (renders as "Allgemein"). */
  teamMain?: boolean;
  /**
   * Workspace tag (`kineo` | `corehub` | `medtheris` | …) — derived from RC
   * customField `workspace`. Used to filter rooms per portal workspace.
   * Untagged rooms (legacy / DMs) get `null`.
   */
  workspace: string | null;
};

/**
 * Rocket.Chat "Team": a group of channels that all share the same team id.
 * Returned alongside rooms so the UI can render a Microsoft-Teams-style
 * collapsible hierarchy (Team → main channel + sub-channels).
 */
export type ChatTeam = {
  id: string;
  /** Slug name (`kineo-physiotherapie`). */
  name: string;
  /** Display label (`Kineo Physiotherapie`). */
  displayName: string;
  workspace: string | null;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  text: string;
  html?: string;
  at: string;
  editedAt?: string;
  user: {
    id: string;
    username: string;
    name?: string;
  };
  attachments?: Array<{
    title?: string;
    titleLink?: string;
    description?: string;
    imageUrl?: string;
    /** file | audio | video | image — from Rocket.Chat */
    type?: string;
  }>;
  isSystem?: boolean;
  // Reply / thread
  threadParentId?: string;
};

export type ChatUserSummary = {
  id: string;
  username: string;
  name?: string;
  status?: "online" | "away" | "busy" | "offline";
  email?: string;
};
