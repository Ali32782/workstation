"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { OPPORTUNITY_STAGE_NEW } from "@/lib/crm/opportunity-stages";

type LeadCompanyAddress = {
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressCity?: string | null;
  addressPostcode?: string | null;
  addressState?: string | null;
  addressCountry?: string | null;
};

type LeadCompanyLink = {
  primaryLinkUrl?: string | null;
  primaryLinkLabel?: string | null;
};

type Lead = {
  opportunityId: string;
  opportunityName: string;
  opportunityStage: string;
  opportunitySource: string | null;
  opportunityCreatedAt: string;
  company: {
    id: string;
    name: string;
    domain: string | null;
    domainName: LeadCompanyLink | null;
    address: LeadCompanyAddress | null;
    phone: string | null;
    generalEmail: string | null;
    bookingSystem: string | null;
    leadSource: string | null;
    googleRating: number | null;
    googleReviewCount: number | null;
    employeeCountPhysio: number | null;
    ownerName: string | null;
    ownerEmail: string | null;
    leadTherapistName: string | null;
    leadTherapistEmail: string | null;
    specializations: string | null;
    languages: string | null;
    tenant: string | null;
  };
};

type Segment = {
  id: number;
  name: string;
  contactCount: number;
  isPublished: boolean;
};

type InboxResponse = {
  workspace: string;
  filter: { source: string; stage: string };
  defaultSegmentId: number | null;
  mauticConfigured: boolean;
  segments: Segment[];
  leads: Lead[];
};

type ApproveResult = {
  ok: true;
  pushed: number;
  peopleCount: number;
  segmentId: number;
  errors: { personId: string; email: string | null; error: string }[];
};

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; message: string };

const LEAD_SOURCE_OPTIONS = [
  { value: "google-maps-scraper", label: "Google-Maps-Scraper" },
  { value: "web-form", label: "Web-Formular" },
] as const;

export function LeadInboxClient({
  tenants,
  defaultWs,
  defaultSegmentId,
}: {
  tenants: string[];
  defaultWs: string;
  defaultSegmentId: number | null;
}) {
  const [ws, setWs] = useState(defaultWs);
  const [source, setSource] =
    useState<(typeof LEAD_SOURCE_OPTIONS)[number]["value"]>("google-maps-scraper");
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<number | null>(defaultSegmentId);
  const [actionState, setActionState] = useState<{
    leadId: string;
    kind: "approve" | "reject";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  /** Welle 1.3 — Final-Check vor Approve → Mautic */
  const [approveWizard, setApproveWizard] = useState<Lead | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardAck, setWizardAck] = useState(false);

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = toastIdRef.current++;
    setToasts((cur) => [...cur, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        ws,
        source,
        stage: OPPORTUNITY_STAGE_NEW,
      });
      const r = await fetch(`/api/admin/leads/inbox?${q.toString()}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as InboxResponse | { error: string };
      if (!r.ok || "error" in j) {
        throw new Error("error" in j ? j.error : `HTTP ${r.status}`);
      }
      setData(j);
      // Sync the default segment from the server unless the user already
      // picked one in this session.
      setSegmentId((cur) => cur ?? j.defaultSegmentId);
      setSelectedId((cur) => {
        if (cur && j.leads.some((l) => l.opportunityId === cur)) return cur;
        return j.leads[0]?.opportunityId ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ws, source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => data?.leads.find((l) => l.opportunityId === selectedId) ?? null,
    [data, selectedId],
  );

  async function handleApprove(lead: Lead) {
    if (!segmentId) {
      pushToast(
        "error",
        "Bitte oben ein Mautic-Segment wählen, bevor du übernimmst.",
      );
      return;
    }
    setActionState({ leadId: lead.opportunityId, kind: "approve" });
    try {
      const r = await fetch(
        `/api/admin/leads/${encodeURIComponent(lead.opportunityId)}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws, segmentId }),
        },
      );
      const j = (await r.json()) as ApproveResult | { error: string };
      if (!r.ok || "error" in j) {
        throw new Error("error" in j ? j.error : `HTTP ${r.status}`);
      }
      pushToast(
        "success",
        `${lead.company.name}: ${j.pushed}/${j.peopleCount} Personen ins Segment.`,
      );
      // Optimistically drop the lead from the list — it no longer matches the
      // stage=NEW filter.
      setData((cur) =>
        cur
          ? {
              ...cur,
              leads: cur.leads.filter(
                (l) => l.opportunityId !== lead.opportunityId,
              ),
            }
          : cur,
      );
      if (selectedId === lead.opportunityId) setSelectedId(null);
      closeApproveWizard();
    } catch (e) {
      pushToast(
        "error",
        `Übernehmen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setActionState(null);
    }
  }

  function openApproveWizard(lead: Lead) {
    if (!segmentId) {
      pushToast(
        "error",
        "Bitte oben ein Mautic-Segment wählen, bevor du den Final-Check startest.",
      );
      return;
    }
    setWizardAck(false);
    setWizardStep(1);
    setApproveWizard(lead);
  }

  function closeApproveWizard() {
    setApproveWizard(null);
  }

  async function handleReject(lead: Lead) {
    setActionState({ leadId: lead.opportunityId, kind: "reject" });
    try {
      const r = await fetch(
        `/api/admin/leads/${encodeURIComponent(lead.opportunityId)}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ws, reason: rejectReason || undefined }),
        },
      );
      const j = (await r.json()) as { ok?: true; error?: string };
      if (!r.ok || j.error) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      pushToast("success", `${lead.company.name}: verworfen (LOST).`);
      setData((cur) =>
        cur
          ? {
              ...cur,
              leads: cur.leads.filter(
                (l) => l.opportunityId !== lead.opportunityId,
              ),
            }
          : cur,
      );
      if (selectedId === lead.opportunityId) setSelectedId(null);
      setRejectReason("");
    } catch (e) {
      pushToast(
        "error",
        `Verwerfen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setActionState(null);
    }
  }

  return (
    <div className="space-y-4">
      {approveWizard && (
        <ApproveFinalCheckWizard
          lead={approveWizard}
          step={wizardStep}
          setStep={setWizardStep}
          ack={wizardAck}
          setAck={setWizardAck}
          segmentName={
            data?.segments.find((s) => s.id === segmentId)?.name ?? "—"
          }
          onClose={closeApproveWizard}
          onConfirm={() => void handleApprove(approveWizard)}
          busy={
            actionState?.leadId === approveWizard.opportunityId &&
            actionState.kind === "approve"
          }
        />
      )}
      {/* ─── Toolbar: workspace + segment + refresh ─── */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-stroke-1 bg-bg-chrome px-4 py-3">
        <Field label="Workspace">
          <select
            value={ws}
            onChange={(e) => setWs(e.target.value)}
            className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5"
          >
            {tenants.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quelle">
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as (typeof LEAD_SOURCE_OPTIONS)[number]["value"])
            }
            className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5"
          >
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mautic-Segment">
          <select
            value={segmentId ?? ""}
            onChange={(e) =>
              setSegmentId(e.target.value ? Number(e.target.value) : null)
            }
            className="bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 min-w-[260px]"
            disabled={!data?.mauticConfigured}
          >
            <option value="">— wählen —</option>
            {(data?.segments ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.contactCount}){s.isPublished ? "" : " · entwurf"}
              </option>
            ))}
          </select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 bg-bg-base text-text-secondary text-xs hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Aktualisieren
          </button>
        </div>
        {data && (
          <p className="basis-full text-text-quaternary text-[11px] mt-1">
            Filter: stage={data.filter.stage}, source={data.filter.source}.{" "}
            {data.leads.length} offene Leads.
            {!data.mauticConfigured && (
              <span className="text-warning ml-2">Mautic offline — Übernehmen deaktiviert.</span>
            )}
          </p>
        )}
      </div>

      {/* ─── Two-pane layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 min-h-[400px]">
        {/* List */}
        <div className="rounded-md border border-stroke-1 bg-bg-chrome overflow-hidden">
          <div className="px-4 py-2.5 border-b border-stroke-1 text-text-tertiary text-[11px] uppercase tracking-wide">
            Inbox ({data?.leads.length ?? 0})
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-stroke-1">
            {error && (
              <div className="px-4 py-6 text-warning text-sm flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {loading && !data && (
              <div className="px-4 py-10 text-text-tertiary text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Lade Leads …
              </div>
            )}
            {data && data.leads.length === 0 && !loading && (
              <div className="px-4 py-10 text-text-tertiary text-sm">
                {data.filter.source === "web-form"
                  ? "Keine Web-Form-Leads in NEW. Prüfe PUBLIC_LEAD_FORM_SECRET, POST /api/public/lead und Twenty-Workspace."
                  : "Inbox ist leer. Sobald der Scraper neue Leads findet, erscheinen sie hier."}
              </div>
            )}
            {data?.leads.map((lead) => {
              const isActive = selectedId === lead.opportunityId;
              return (
                <button
                  key={lead.opportunityId}
                  type="button"
                  onClick={() => setSelectedId(lead.opportunityId)}
                  className={
                    "w-full text-left px-4 py-3 transition-colors " +
                    (isActive
                      ? "bg-bg-elevated"
                      : "hover:bg-bg-elevated/50")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-text-primary text-sm font-medium truncate">
                      {lead.company.name || "(ohne Name)"}
                    </span>
                    <span className="text-text-quaternary text-[10px] shrink-0">
                      {fmtDate(lead.opportunityCreatedAt)}
                    </span>
                  </div>
                  <div className="text-text-tertiary text-xs mt-0.5 truncate">
                    {[lead.company.address?.addressCity, lead.company.bookingSystem]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                  {lead.company.googleRating != null && (
                    <div className="mt-1 inline-flex items-center gap-1 text-text-quaternary text-[10px]">
                      <Star size={10} className="text-warning" />
                      {lead.company.googleRating.toFixed(1)}
                      {lead.company.googleReviewCount != null &&
                        ` · ${lead.company.googleReviewCount} Reviews`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="rounded-md border border-stroke-1 bg-bg-chrome overflow-hidden flex flex-col">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm px-6 py-12 text-center">
              {data && data.leads.length > 0
                ? "Wähle links einen Lead zur Prüfung."
                : "Keine Leads zur Prüfung."}
            </div>
          )}
          {selected && (
            <div className="flex flex-col h-full">
              <div className="px-5 py-4 border-b border-stroke-1">
                <h3 className="text-text-primary text-lg font-semibold">
                  {selected.company.name || "(ohne Name)"}
                </h3>
                <div className="text-text-tertiary text-xs mt-0.5">
                  {selected.opportunityName} · stage={selected.opportunityStage}
                  {selected.opportunitySource &&
                    ` · source=${selected.opportunitySource}`}
                </div>
              </div>

              <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                <KV
                  label="Adresse"
                  value={fmtAddress(selected.company.address)}
                  icon={<MapPin size={12} />}
                />
                <KV
                  label="Domain"
                  value={
                    selected.company.domainName?.primaryLinkUrl ||
                    selected.company.domain
                  }
                  href={
                    selected.company.domainName?.primaryLinkUrl ??
                    selected.company.domain ??
                    undefined
                  }
                />
                <KV
                  label="Telefon"
                  value={selected.company.phone}
                  icon={<Phone size={12} />}
                  href={
                    selected.company.phone
                      ? `tel:${selected.company.phone}`
                      : undefined
                  }
                />
                <KV
                  label="Allgemeine E-Mail"
                  value={selected.company.generalEmail}
                  icon={<Mail size={12} />}
                  href={
                    selected.company.generalEmail
                      ? `mailto:${selected.company.generalEmail}`
                      : undefined
                  }
                />
                <KV
                  label="Booking-System"
                  value={selected.company.bookingSystem}
                />
                <KV
                  label="Lead-Source"
                  value={selected.company.leadSource}
                />
                <KV
                  label="Inhaber/in"
                  value={selected.company.ownerName}
                />
                <KV
                  label="Inhaber-E-Mail"
                  value={selected.company.ownerEmail}
                  href={
                    selected.company.ownerEmail
                      ? `mailto:${selected.company.ownerEmail}`
                      : undefined
                  }
                />
                <KV
                  label="Lead-Therapeut/in"
                  value={selected.company.leadTherapistName}
                />
                <KV
                  label="Spezialisierungen"
                  value={selected.company.specializations}
                />
                <KV
                  label="Sprachen"
                  value={selected.company.languages}
                />
                <KV label="Tenant" value={selected.company.tenant} />
                {selected.company.googleRating != null && (
                  <KV
                    label="Google-Rating"
                    value={`${selected.company.googleRating.toFixed(1)}${
                      selected.company.googleReviewCount != null
                        ? ` (${selected.company.googleReviewCount} Reviews)`
                        : ""
                    }`}
                  />
                )}
              </div>

              {/* Reject reason input */}
              <div className="px-5 py-3 border-t border-stroke-1 space-y-2">
                <label className="block text-text-tertiary text-[11px] uppercase tracking-wide">
                  Verwerfen — Grund (optional, wird als Note auf der Company gespeichert)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  placeholder="z. B. Doublette / falsche Branche / kein Booking-System"
                  className="w-full bg-bg-base border border-stroke-1 text-text-primary text-sm rounded-md px-2.5 py-1.5 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="px-5 py-4 border-t border-stroke-1 flex flex-wrap items-center justify-between gap-3">
                <div className="text-text-quaternary text-[11px]">
                  Übernehmen pusht alle Personen mit E-Mail in
                  Segment&nbsp;
                  <strong className="text-text-secondary">
                    {data?.segments.find((s) => s.id === segmentId)?.name ??
                      "—"}
                  </strong>
                  .
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReject(selected)}
                    disabled={actionState !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 bg-bg-base text-text-secondary text-sm hover:text-text-primary disabled:opacity-50"
                  >
                    {actionState?.leadId === selected.opportunityId &&
                    actionState.kind === "reject" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Verwerfen
                  </button>
                  <button
                    type="button"
                    onClick={() => openApproveWizard(selected)}
                    disabled={
                      actionState !== null ||
                      !segmentId ||
                      !data?.mauticConfigured
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  >
                    {actionState?.leadId === selected.opportunityId &&
                    actionState.kind === "approve" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Übernehmen → Funnel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Toasts ─── */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "flex items-start gap-2 max-w-md px-3 py-2.5 rounded-md shadow-lg border text-sm " +
              (t.kind === "success"
                ? "bg-success/10 border-success/30 text-success"
                : "bg-warning/10 border-warning/30 text-warning")
            }
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
            )}
            <span className="text-text-secondary">{t.message}</span>
            <button
              type="button"
              onClick={() =>
                setToasts((cur) => cur.filter((x) => x.id !== t.id))
              }
              className="text-text-quaternary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApproveFinalCheckWizard({
  lead,
  step,
  setStep,
  ack,
  setAck,
  segmentName,
  onClose,
  onConfirm,
  busy,
}: {
  lead: Lead;
  step: number;
  setStep: (n: number) => void;
  ack: boolean;
  setAck: (v: boolean) => void;
  segmentName: string;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const c = lead.company;
  const hasName = Boolean((c.name ?? "").trim());
  const hasAddr = Boolean(
    (c.address?.addressCity ?? "").trim() ||
      (c.address?.addressStreet1 ?? "").trim(),
  );
  const hasContact = Boolean(
    (c.phone ?? "").trim() ||
      (c.generalEmail ?? "").trim() ||
      (c.ownerEmail ?? "").trim() ||
      (c.leadTherapistEmail ?? "").trim(),
  );
  const hasWeb =
    Boolean((c.domainName?.primaryLinkUrl ?? "").trim()) ||
    Boolean((c.domain ?? "").trim());

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55">
      <div className="w-full max-w-lg rounded-xl border border-stroke-1 bg-bg-elevated shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-stroke-1 flex items-center justify-between gap-2">
          <h2 className="text-text-primary font-semibold text-base">
            Final-Check — in den Funnel übernehmen
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-quaternary hover:text-text-primary hover:bg-bg-overlay"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center gap-1 text-[11px] text-text-quaternary">
            <span
              className={step >= 1 ? "text-emerald-400 font-medium" : ""}
            >
              ① Daten
            </span>
            <span>→</span>
            <span
              className={step >= 2 ? "text-emerald-400 font-medium" : ""}
            >
              ② Funnel
            </span>
            <span>→</span>
            <span
              className={step >= 3 ? "text-emerald-400 font-medium" : ""}
            >
              ③ Bestätigen
            </span>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-text-secondary text-sm">
                Prüfe die Pflichtsignale für{" "}
                <strong>{c.name || "(ohne Name)"}</strong>.
              </p>
              <ul className="space-y-2 text-[12px]">
                <CheckRow ok={hasName} label="Firmenname gesetzt" />
                <CheckRow ok={hasAddr} label="Adresse / Ort vorhanden" />
                <CheckRow ok={hasWeb} label="Website / Domain vorhanden" />
                <CheckRow
                  ok={hasContact}
                  label="Telefon oder E-Mail (Firma / Ansprechpartner)"
                />
              </ul>
              {!hasContact && (
                <p className="text-warning text-[11px] leading-snug">
                  Ohne erkennbaren Kontakt kann der Mautic-Push 0 Personen
                  treffen — trotzdem fortfahren nur nach manueller Prüfung.
                </p>
              )}
              <label className="flex items-start gap-2 text-[12px] text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-stroke-2"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  Ich habe die Daten gesichtet; Tippfehler und Dubletten sind
                  soweit erkennbar ausgeschlossen.
                </span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2 text-sm text-text-secondary">
              <p>
                Ziel-Mautic-Segment:{" "}
                <strong className="text-text-primary">{segmentName}</strong>
              </p>
              <p className="text-text-tertiary text-[12px] leading-snug">
                Alle Personen mit E-Mail an der Firma werden upsertet und dem
                Segment zugeordnet. Opportunity-Stage wird auf QUALIFIED
                gesetzt.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2 text-sm text-text-secondary">
              <p>
                <strong className="text-text-primary">{c.name}</strong> jetzt
                in Mautic-Segment „{segmentName}“ übernehmen?
              </p>
              <p className="text-text-quaternary text-[11px]">
                Dieser Vorgang kann rückgängig gemacht werden, indem du die
                Opportunity in Twenty wieder anpasst — Mautic-Kontakte
                bleiben bestehen.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-stroke-1 flex items-center justify-between gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-text-secondary text-sm hover:bg-bg-overlay"
              disabled={busy}
            >
              Zurück
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && (!ack || !hasName)) return;
                  setStep(step + 1);
                }}
                disabled={
                  busy ||
                  (step === 1 && (!ack || !hasName)) ||
                  (step === 1 && !hasAddr) ||
                  (step === 1 && !hasWeb)
                }
                className="px-4 py-1.5 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50"
                title={
                  step === 1 && !ack
                    ? "Bestätigung erforderlich"
                    : step === 1 && (!hasAddr || !hasWeb)
                      ? "Adresse und Website müssen vorliegen"
                      : undefined
                }
              >
                Weiter
              </button>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Jetzt übernehmen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
      ) : (
        <AlertCircle size={14} className="text-warning shrink-0" />
      )}
      <span className={ok ? "text-text-secondary" : "text-warning"}>
        {label}
      </span>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-text-quaternary text-[10px] uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function KV({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  icon?: React.ReactNode;
}) {
  const isEmpty = !value || value === "";
  return (
    <div className="min-w-0">
      <div className="text-text-quaternary text-[10px] uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      {isEmpty ? (
        <div className="text-text-quaternary text-sm italic">—</div>
      ) : href ? (
        <a
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="text-text-primary text-sm hover:underline inline-flex items-center gap-1 break-all"
        >
          {value}
          {href.startsWith("http") && (
            <ExternalLink size={11} className="text-text-quaternary" />
          )}
        </a>
      ) : (
        <div className="text-text-primary text-sm break-words">{value}</div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtAddress(a: LeadCompanyAddress | null): string | null {
  if (!a) return null;
  const parts = [
    [a.addressStreet1, a.addressStreet2].filter(Boolean).join(" "),
    [a.addressPostcode, a.addressCity].filter(Boolean).join(" "),
    [a.addressState, a.addressCountry].filter(Boolean).join(", "),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
