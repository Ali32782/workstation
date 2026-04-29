import "server-only";

/**
 * Detect Rocket.Chat messages posted by portal `postCallInvite` (and similar).
 */

export function rocketchatMessageLooksLikePortalVideoInvite(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("video-anruf gestartet") ||
    (t.includes("beitreten") && /https?:\/\//.test(text))
  );
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
