/**
 * Shared types for Phonestar → portal ring buffer (webhook + poll API).
 * Kept separate from `ring-store.ts` so client components can import safely.
 */

export type PhonestarRingAction =
  | "ticket_created_inbound"
  | "article_deduped_inbound";

export type PhonestarRingEventRecord = {
  id: number;
  at: string;
  workspace: string;
  direction: "inbound";
  action: PhonestarRingAction;
  caller: string;
  ticketId: number;
  ticketNumber?: string;
  title: string;
};
