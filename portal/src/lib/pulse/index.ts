import "server-only";
import { auth } from "@/lib/auth";
import { getMailPulse } from "./mail";
import { getTasksPulse } from "./tasks";
import type { PulseModuleResult, PulseSnapshot, PulseStat } from "./types";

export type { PulseSnapshot, PulseStat, PulseModuleResult } from "./types";

/**
 * Aggregates a "pulse snapshot" for the currently authenticated user inside
 * the given core workspace. Each module is run in parallel; one failing
 * module never breaks the others.
 */
export async function getPulseForCurrentUser(
  coreWorkspace: string,
): Promise<PulseSnapshot> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    const err: PulseModuleResult = { ok: false, error: "no session" };
    return {
      generatedAt: new Date().toISOString(),
      modules: { mail: err, tasks: err, chat: err },
    };
  }

  const [mail, tasks] = await Promise.all([
    getMailPulse(email),
    getTasksPulse({ email, coreWorkspace }),
  ]);

  // Chat: not yet implemented — emit a benign placeholder so the UI keeps
  // its grid layout stable.
  const chat: PulseModuleResult = {
    ok: true,
    stats: [
      {
        key: "chat-placeholder",
        label: "Chat",
        value: "→",
        tone: "neutral",
        href: "/" + coreWorkspace + "/apps/chat",
        hint: "Live-Counter folgt",
      },
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    modules: { mail, tasks, chat },
  };
}

export function flattenStats(snapshot: PulseSnapshot): PulseStat[] {
  const out: PulseStat[] = [];
  for (const m of [snapshot.modules.mail, snapshot.modules.tasks, snapshot.modules.chat]) {
    if (m.ok) out.push(...m.stats);
    else if (m.fallbackStats) out.push(...m.fallbackStats);
  }
  return out;
}
