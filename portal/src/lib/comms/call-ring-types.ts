/**
 * Canonical portal “ring” events for Chat-started Jitsi invites.
 * Persisted in PORTAL_DATA_DIR (short TTL); merged with Mongo `portal.calls`
 * in GET /api/comms/incoming-calls.
 */

export type CallRingEventRecord = {
  id: number;
  at: string;
  /** RC customField workspace; null = any workspace tab for matching recipients */
  workspace: string | null;
  source: "chat_jitsi";
  roomId: string;
  roomName: string;
  joinUrl: string;
  messageId: string;
  initiatorRcUserId: string;
  initiatorUsername: string;
  initiatorName?: string;
  recipientRcUserIds: string[];
  /** Jitsi preset from portal invite copy; missing on older stored events → UI assumes video. */
  callMedia?: "video" | "voice";
};

export type IncomingChatRingDto = {
  ringId: number;
  at: string;
  joinUrl: string;
  roomName: string;
  messageId: string;
  fromLabel: string;
  callMedia?: "video" | "voice";
};
