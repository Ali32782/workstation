/**
 * Detect Rocket.Chat messages posted by portal `postCallInvite` (and similar).
 * Safe to import from client components (pure string helpers).
 */

export type PortalCallInviteKind = "video" | "voice";

/** Classify portal-style Jitsi invites; `null` if not a known invite shape. */
export function portalCallInviteKind(text: string): PortalCallInviteKind | null {
  const t = text.toLowerCase();
  if (t.includes("sprach-anruf gestartet") || t.includes("sprach-anruf —")) {
    return "voice";
  }
  if (t.includes("video-anruf gestartet") || t.includes("video-anruf —")) {
    return "video";
  }
  if (/\bsprach-anruf\b/.test(t) && /https?:\/\//.test(text)) return "voice";
  if (/\bvideo-anruf\b/.test(t) && /https?:\/\//.test(text)) return "video";
  if (t.includes("beitreten") && /https?:\/\//.test(text)) {
    if (/meet\.|jitsi|corehub-/i.test(text)) return "video";
  }
  return null;
}

export type MeetAttachment = { titleLink?: string };

/**
 * Rocket.Chat often puts the Jitsi URL only in a link-preview attachment; the
 * msg text may be empty or different from our `postCallInvite` copy.
 */
export function extractMeetUrlFromAttachments(
  attachments: MeetAttachment[] | undefined,
): string | null {
  if (!attachments?.length) return null;
  for (const a of attachments) {
    const tl = a.titleLink?.trim();
    if (!tl) continue;
    const low = tl.toLowerCase();
    if (/meet\.|jitsi|corehub-/.test(low)) return stripTrail(tl);
  }
  return null;
}

/** True when this attachment is (likely) an auto-generated Jitsi/meet preview. */
export function attachmentLooksLikeMeetLinkPreview(
  titleLink: string | undefined,
): boolean {
  if (!titleLink?.trim()) return false;
  return /meet\.|jitsi|corehub-/i.test(titleLink);
}

export function rocketchatMessageLooksLikePortalVideoInvite(text: string): boolean {
  return portalCallInviteKind(text) !== null;
}

export function extractMeetUrlFromRocketchatMessage(text: string): string | null {
  const md = text.match(/\]\((https?:\/\/[^)\s]+)\)/);
  if (md?.[1]) return stripTrail(md[1]);
  const bases = [
    process.env.JITSI_PUBLIC_BASE,
    process.env.JITSI_PUBLIC_URL,
    "meet.kineo360.work",
    "meet.",
    "jitsi",
  ].filter(Boolean) as string[];
  const bare = text.match(/https?:\/\/[^\s)\]<>"']+/g);
  if (!bare?.length) return null;
  for (const u of bare) {
    const lower = u.toLowerCase();
    if (bases.some((b) => lower.includes(b.replace(/^https?:\/\//, "").toLowerCase())))
      return stripTrail(u);
  }
  for (const u of bare) {
    if (/meet\.|jitsi|corehub-/.test(u)) return stripTrail(u);
  }
  return stripTrail(bare[0]!);
}

function stripTrail(u: string): string {
  return u.replace(/[.,;:\]]+$/g, "");
}
