/** Cross-route handoff when the user accepts an incoming chat ring “here”. */

export const PENDING_CHAT_MEETING_STORAGE_KEY = "portal:pending-chat-meeting-v1";

export type PendingChatMeeting = {
  joinUrl: string;
  callMedia?: "video" | "voice";
  subject: string;
  ringMessageId?: string;
};

export function stashPendingChatMeeting(m: PendingChatMeeting): void {
  try {
    sessionStorage.setItem(PENDING_CHAT_MEETING_STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* noop */
  }
}

export function takePendingChatMeeting(): PendingChatMeeting | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHAT_MEETING_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_CHAT_MEETING_STORAGE_KEY);
    const j = JSON.parse(raw) as PendingChatMeeting;
    if (
      j &&
      typeof j.joinUrl === "string" &&
      j.joinUrl.length > 0 &&
      typeof j.subject === "string"
    ) {
      return j;
    }
  } catch {
    /* noop */
  }
  return null;
}
