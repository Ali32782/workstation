/**
 * Canonical `opportunity.stage` values the Portal uses for inbound flows.
 * These must exist in the Twenty workspace enum — align with Sales via
 * `docs/playbooks/TWENTY-DEAL-STAGES-ALIGNMENT.md`.
 */
export const OPPORTUNITY_STAGE_NEW = "NEW";
export const OPPORTUNITY_STAGE_QUALIFIED = "QUALIFIED";
export const OPPORTUNITY_STAGE_LOST = "LOST";

/** Default column order for pipeline boards (company Deals tab + /crm/pipeline). */
export const DEFAULT_OPPORTUNITY_KANBAN_STAGES: { id: string; label: string }[] =
  [
    { id: OPPORTUNITY_STAGE_NEW, label: "Neu" },
    { id: OPPORTUNITY_STAGE_QUALIFIED, label: "Qualifiziert" },
    { id: "SCREENING", label: "Screening" },
    { id: "MEETING", label: "Termin" },
    { id: "PROPOSAL", label: "Angebot" },
    { id: "CUSTOMER", label: "Kunde" },
    { id: "WON", label: "Gewonnen" },
    { id: OPPORTUNITY_STAGE_LOST, label: "Verloren" },
  ];
