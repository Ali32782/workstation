import "server-only";
import { auth } from "@/lib/auth";
import { tFor, type Locale } from "@/lib/i18n/messages";
import { getMailPulse } from "./mail";
import { getTasksPulse } from "./tasks";
import { getIntegrationFeedPulse } from "./integration-feed";
import type { PulseModuleResult, PulseSnapshot, PulseStat } from "./types";

export type { PulseSnapshot, PulseStat, PulseModuleResult } from "./types";

/**
 * Aggregates a "pulse snapshot" for the currently authenticated user inside
 * the given core workspace. Each module is run in parallel; one failing
 * module never breaks the others.
 */
export async function getPulseForCurrentUser(
  coreWorkspace: string,
  locale: Locale,
): Promise<PulseSnapshot> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    const err: PulseModuleResult = { ok: false, error: "no session" };
    return {
      generatedAt: new Date().toISOString(),
      modules: { mail: err, tasks: err, chat: err, feed: err },
    };
  }

  const [mail, tasks, feed] = await Promise.all([
    getMailPulse(email, locale),
    getTasksPulse({ email, coreWorkspace, locale }),
    getIntegrationFeedPulse({ coreWorkspace, locale }),
  ]);

  // Chat: not yet implemented — emit a benign placeholder so the UI keeps
  // its grid layout stable. Replacement path: integration event feed → Pulse;
  // see docs/cross-hub-roadmap.md Phase 0–1.
  const chat: PulseModuleResult = {
    ok: true,
    stats: [
      {
        key: "chat-placeholder",
        label: tFor(locale, "pulse.chat.label"),
        value: "→",
        tone: "neutral",
        href: `/${coreWorkspace}/chat`,
        hint: tFor(locale, "pulse.chat.hint"),
      },
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    modules: { mail, tasks, chat, feed },
  };
}

export function flattenStats(snapshot: PulseSnapshot): PulseStat[] {
  const out: PulseStat[] = [];
  for (const m of [
    snapshot.modules.mail,
    snapshot.modules.tasks,
    snapshot.modules.chat,
    snapshot.modules.feed,
  ]) {
    if (m.ok) out.push(...m.stats);
    else if (m.fallbackStats) out.push(...m.fallbackStats);
  }
  return out;
}
