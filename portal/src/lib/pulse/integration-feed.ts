import "server-only";

import { readRecentIntegrationEvents } from "@/lib/integrations/event-feed-store";
import {
  integrationCmdKLabel,
  integrationEventHref,
} from "@/lib/integrations/event-feed-cmdk";
import type { IntegrationHub } from "@/lib/integrations/event-feed-types";
import { tFor, type Locale, type Messages } from "@/lib/i18n/messages";
import type { PulseModuleResult } from "./types";

function hubLabelKey(hub: IntegrationHub): keyof Messages {
  switch (hub) {
    case "sign":
      return "pulse.feed.hubSign";
    case "helpdesk":
      return "pulse.feed.hubHelpdesk";
    case "crm":
      return "pulse.feed.hubCrm";
    case "projects":
      return "pulse.feed.hubProjects";
    case "office":
      return "pulse.feed.hubOffice";
    case "calendar":
      return "pulse.feed.hubCalendar";
    case "communication":
      return "pulse.feed.hubCommunication";
    default:
      return "pulse.feed.hubDefault";
  }
}

export async function getIntegrationFeedPulse(opts: {
  coreWorkspace: string;
  locale: Locale;
}): Promise<PulseModuleResult> {
  const recent = await readRecentIntegrationEvents(opts.coreWorkspace, 8);
  if (recent.length === 0) {
    return {
      ok: true,
      stats: [
        {
          key: "integration-feed-empty",
          label: tFor(opts.locale, "pulse.feed.label"),
          value: "—",
          tone: "neutral",
          hint: tFor(opts.locale, "pulse.feed.empty"),
        },
      ],
    };
  }

  const tiles = recent.slice(0, 3);
  return {
    ok: true,
    stats: tiles.map((ev) => {
      let tone: "success" | "info" | "neutral" = "neutral";
      if (ev.eventType === "sign.document.completed") tone = "success";
      else if (ev.sourceHub === "helpdesk") tone = "info";

      const hint = integrationCmdKLabel(ev).slice(0, 140);

      return {
        key: `integration-feed-${ev.id}`,
        label: tFor(opts.locale, hubLabelKey(ev.sourceHub)),
        value: "●",
        tone,
        href: integrationEventHref(opts.coreWorkspace, ev),
        hint,
      };
    }),
  };
}
