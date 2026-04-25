import "server-only";

export type ChatRoomType = "c" | "p" | "d";

export type ChatRoom = {
  id: string;
  type: ChatRoomType;
  name: string;
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
