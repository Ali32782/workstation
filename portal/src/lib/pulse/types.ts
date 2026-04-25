import "server-only";

export type PulseTone = "info" | "warning" | "success" | "neutral";

export type PulseStat = {
  key: string;
  label: string;
  value: string;
  tone: PulseTone;
  href?: string;
  hint?: string;
};

export type PulseModuleResult =
  | { ok: true; stats: PulseStat[] }
  | { ok: false; error: string; fallbackStats?: PulseStat[] };

export type PulseSnapshot = {
  generatedAt: string;
  modules: {
    mail: PulseModuleResult;
    tasks: PulseModuleResult;
    chat: PulseModuleResult;
  };
};
