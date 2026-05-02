import {
  Briefcase,
  LifeBuoy,
  MessageSquare,
  PhoneCall,
  Ticket as TicketIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { Messages } from "@/lib/i18n/messages";
import type { CallContext } from "@/lib/calls/types";

type TT = (key: keyof Messages) => string;

/** Human-readable seconds → "1m 03s" / "1h 04m" formatter. */
export function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

export function contextIcon(context: CallContext): ReactNode {
  switch (context.kind) {
    case "crm":
      return createElement(Briefcase, { size: 12 });
    case "helpdesk":
      return createElement(LifeBuoy, { size: 12 });
    case "chat":
      return createElement(MessageSquare, { size: 12 });
    case "projects":
      return createElement(TicketIcon, { size: 12 });
    case "adhoc":
    default:
      return createElement(PhoneCall, { size: 12 });
  }
}

export function contextLabel(context: CallContext, t: TT): string {
  switch (context.kind) {
    case "crm":
      return context.label ?? t("calls.context.crmContact");
    case "helpdesk":
      return (
        context.label ??
        `${t("calls.context.ticket")} #${context.ticketId}`
      );
    case "chat":
      return context.label ?? t("calls.context.chatRoom");
    case "projects":
      return context.label ?? t("calls.context.projectIssue");
    case "adhoc":
    default:
      return t("calls.context.adhoc");
  }
}
