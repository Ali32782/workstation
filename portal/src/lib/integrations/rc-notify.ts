import type { IntegrationEventEnvelope } from "@/lib/integrations/event-feed-types";
import { postAdminRoomMessage } from "@/lib/chat/rocketchat";

/** Optional Rocket.Chat fan-out for integration events (admin PAT). */
export async function notifyRocketChatIntegrationEvent(
  envelope: IntegrationEventEnvelope,
): Promise<void> {
  const channel = process.env.INTEGRATION_FEED_ROCKETCHAT_CHANNEL?.trim();
  if (!channel) return;

  const title =
    typeof envelope.payload === "object" &&
    envelope.payload !== null &&
    "title" in envelope.payload &&
    typeof (envelope.payload as { title?: unknown }).title === "string"
      ? (envelope.payload as { title: string }).title
      : undefined;

  const docId =
    typeof envelope.payload === "object" &&
    envelope.payload !== null &&
    "documentId" in envelope.payload
      ? String((envelope.payload as { documentId?: unknown }).documentId ?? "")
      : "";

  const bits = [
    "**Portal · Integration**",
    `\`${envelope.sourceSystem}\` · ${envelope.eventType}`,
    envelope.workspaceId ? `workspace: ${envelope.workspaceId}` : null,
    title ? `_${title}_` : null,
    docId ? `id: ${docId}` : null,
  ].filter(Boolean);

  try {
    await postAdminRoomMessage(channel, bits.join(" · "));
  } catch (e) {
    console.warn(
      "[integration-feed] Rocket.Chat notify failed:",
      e instanceof Error ? e.message : e,
    );
  }
}
