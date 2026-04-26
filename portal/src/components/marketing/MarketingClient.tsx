"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Users as UsersIcon,
  Mail,
  Layers,
  Send,
  ExternalLink,
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  Building2,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import {
  ThreePaneLayout,
  PaneHeader,
  PaneEmptyState,
} from "@/components/ui/ThreePaneLayout";
import {
  DetailPane,
  PropertyList,
  SidebarSection,
} from "@/components/ui/DetailPane";
import { RecordList, type RecordListItem } from "@/components/ui/RecordList";
import { StatusPill } from "@/components/ui/Pills";
import type { WorkspaceId } from "@/lib/workspaces";
import type {
  MarketingOverview,
  MauticCampaign,
  MauticContact,
  MauticEmail,
  MauticSegment,
} from "@/lib/marketing/types";

type Section = "overview" | "contacts" | "segments" | "campaigns" | "emails";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Übersicht", icon: Megaphone },
  { id: "contacts", label: "Kontakte", icon: UsersIcon },
  { id: "segments", label: "Segmente", icon: Layers },
  { id: "campaigns", label: "Kampagnen", icon: Send },
  { id: "emails", label: "Mails", icon: Mail },
];

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function fullName(c: MauticContact): string {
  const f = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return f || c.email || `Kontakt #${c.id}`;
}

export function MarketingClient({
  workspaceId,
  workspaceName,
  accent,
  mauticUrl,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  mauticUrl: string;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [contacts, setContacts] = useState<MauticContact[]>([]);
  const [segments, setSegments] = useState<MauticSegment[]>([]);
  const [campaigns, setCampaigns] = useState<MauticCampaign[]>([]);
  const [emails, setEmails] = useState<MauticEmail[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ws = workspaceId;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(null);
    try {
      const fetchJsonStatus = async <T,>(url: string): Promise<{ status: number; body: T }> => {
        const r = await fetch(url);
        const body = (await r.json().catch(() => ({}))) as T;
        return { status: r.status, body };
      };
      const [ov, cs, ss, cmps, em] = await Promise.all([
        fetchJsonStatus<{ overview?: MarketingOverview; error?: string; code?: string }>(
          `/api/marketing/overview?ws=${ws}`,
        ),
        fetchJsonStatus<{ contacts?: MauticContact[]; error?: string }>(
          `/api/marketing/contacts?ws=${ws}&limit=100${search ? `&q=${encodeURIComponent(search)}` : ""}`,
        ),
        fetchJsonStatus<{ segments?: MauticSegment[] }>(
          `/api/marketing/segments?ws=${ws}`,
        ),
        fetchJsonStatus<{ campaigns?: MauticCampaign[] }>(
          `/api/marketing/campaigns?ws=${ws}`,
        ),
        fetchJsonStatus<{ emails?: MauticEmail[] }>(
          `/api/marketing/emails?ws=${ws}`,
        ),
      ]);
      if (ov.status === 503 && ov.body.code === "not_configured") {
        setNotConfigured(ov.body.error ?? "Mautic ist noch nicht eingerichtet.");
        setOverview(null);
      } else if (ov.status >= 400) {
        setError(ov.body.error ?? `HTTP ${ov.status}`);
      } else {
        setOverview(ov.body.overview ?? null);
      }
      setContacts(cs.body.contacts ?? []);
      setSegments(ss.body.segments ?? []);
      setCampaigns(cmps.body.campaigns ?? []);
      setEmails(em.body.emails ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ws, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  const items: RecordListItem[] = useMemo(() => {
    if (section === "contacts") {
      return contacts.map((c) => ({
        id: `c-${c.id}`,
        title: fullName(c),
        subtitle:
          [c.email, c.company].filter(Boolean).join(" · ") || c.country || undefined,
        meta: relativeTime(c.lastActive),
        leading: (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-semibold"
            style={{ background: `${accent}22`, color: accent }}
          >
            {(c.firstName?.[0] ?? c.email?.[0] ?? "?").toUpperCase()}
          </div>
        ),
        trailing:
          c.points > 0 ? (
            <span className="text-[10px] font-medium text-text-tertiary">
              {c.points} pts
            </span>
          ) : null,
      }));
    }
    if (section === "segments") {
      return segments.map((s) => ({
        id: `s-${s.id}`,
        title: s.name,
        subtitle: s.description ?? s.alias,
        meta: `${s.contactCount}`,
        leading: <Layers size={14} className="text-text-tertiary mt-0.5" />,
        trailing: s.isPublished ? (
          <CheckCircle2 size={12} className="text-emerald-400" />
        ) : null,
      }));
    }
    if (section === "campaigns") {
      return campaigns.map((c) => ({
        id: `cmp-${c.id}`,
        title: c.name,
        subtitle: c.description ?? c.category ?? undefined,
        meta: `${c.contactCount}`,
        leading: <Send size={14} className="text-text-tertiary mt-0.5" />,
        trailing: (
          <StatusPill
            label={c.isPublished ? "aktiv" : "Entwurf"}
            tone={c.isPublished ? "success" : "neutral"}
          />
        ),
      }));
    }
    if (section === "emails") {
      return emails.map((e) => ({
        id: `e-${e.id}`,
        title: e.name,
        subtitle: e.subject,
        meta: relativeTime(e.createdAt),
        leading: <Mail size={14} className="text-text-tertiary mt-0.5" />,
        trailing:
          e.sentCount > 0 ? (
            <span className="text-[10px] font-medium text-text-tertiary">
              {e.sentCount}× · {e.readPercent ?? 0}%
            </span>
          ) : null,
      }));
    }
    return [];
  }, [section, contacts, segments, campaigns, emails, accent]);

  const selectedContact = useMemo(
    () => contacts.find((c) => `c-${c.id}` === selectedId) ?? null,
    [contacts, selectedId],
  );
  const selectedSegment = useMemo(
    () => segments.find((s) => `s-${s.id}` === selectedId) ?? null,
    [segments, selectedId],
  );
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => `cmp-${c.id}` === selectedId) ?? null,
    [campaigns, selectedId],
  );
  const selectedEmail = useMemo(
    () => emails.find((e) => `e-${e.id}` === selectedId) ?? null,
    [emails, selectedId],
  );

  // ─── Primary pane: section nav + KPI tiles ─────────────────────────────
  const primary = (
    <div className="flex flex-col h-full">
      <PaneHeader
        title="Marketing"
        subtitle="Mautic"
        icon={<Megaphone size={14} style={{ color: accent }} />}
        accent={accent}
        right={
          <a
            href={mauticUrl}
            target="_blank"
            rel="noreferrer"
            title="In Mautic öffnen"
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary"
          >
            <ExternalLink size={13} />
          </a>
        }
      />
      <nav className="flex-1 min-h-0 overflow-auto py-1">
        {SECTIONS.map((s) => {
          const active = section === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSection(s.id);
                setSelectedId(null);
              }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-[12.5px] ${
                active ? "bg-bg-overlay text-text-primary" : "text-text-secondary hover:bg-bg-elevated"
              }`}
              style={active ? { boxShadow: `inset 3px 0 0 0 ${accent}` } : undefined}
            >
              <Icon size={14} className="shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
            </button>
          );
        })}
      </nav>
      {overview && (
        <div className="shrink-0 border-t border-stroke-1 px-3 py-3 grid grid-cols-2 gap-2 text-[11px]">
          <KPI label="Kontakte" value={overview.contacts.total} />
          <KPI label="Aktiv 7d" value={overview.contacts.recent} />
          <KPI label="Segmente" value={overview.segments} />
          <KPI label="Kampagnen" value={overview.campaigns.active} suffix="aktiv" />
        </div>
      )}
    </div>
  );

  const primaryRail = (
    <div className="flex flex-col h-full items-center py-2 gap-1">
      {SECTIONS.map((s) => {
        const active = section === s.id;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSection(s.id);
              setSelectedId(null);
            }}
            title={s.label}
            className={`w-9 h-9 rounded flex items-center justify-center ${
              active ? "bg-bg-overlay text-text-primary" : "text-text-tertiary hover:bg-bg-elevated"
            }`}
            style={active ? { color: accent } : undefined}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );

  // ─── Secondary: list of records for current section ───────────────────
  const secondary = (
    <div className="flex flex-col h-full">
      <PaneHeader
        title={SECTIONS.find((s) => s.id === section)?.label ?? "Marketing"}
        subtitle={
          section === "contacts"
            ? `${contacts.length} sichtbar`
            : section === "segments"
              ? `${segments.length}`
              : section === "campaigns"
                ? `${campaigns.length}`
                : section === "emails"
                  ? `${emails.length}`
                  : "Übersicht"
        }
        right={
          <button
            type="button"
            onClick={reload}
            title="Neu laden"
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        }
      >
        {section === "contacts" && (
          <div className="flex items-center gap-1.5 px-1">
            <Search size={12} className="text-text-tertiary" />
            <input
              type="search"
              placeholder="Suche…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[12px] py-1"
            />
          </div>
        )}
      </PaneHeader>
      {section === "overview" ? (
        <OverviewList
          overview={overview}
          loading={loading}
          notConfigured={notConfigured}
          mauticUrl={mauticUrl}
        />
      ) : (
        <RecordList
          items={items}
          selectedId={selectedId ?? undefined}
          onSelect={(id) => setSelectedId(id)}
          loading={loading}
          accent={accent}
          emptyHint={
            notConfigured
              ? "Mautic ist noch nicht eingerichtet."
              : "Keine Einträge."
          }
        />
      )}
    </div>
  );

  // ─── Detail pane ──────────────────────────────────────────────────────
  let detail: React.ReactNode;
  if (notConfigured) {
    detail = (
      <DetailPane
        main={
          <div className="px-8 py-10 max-w-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={20} className="text-amber-400 mt-1 shrink-0" />
              <div>
                <h2 className="text-[14px] font-semibold mb-2">
                  Mautic ist noch nicht einsatzbereit
                </h2>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  {notConfigured}
                </p>
              </div>
            </div>
            <ol className="text-[12px] text-text-secondary space-y-2 list-decimal pl-5 mt-6">
              <li>
                Mautic-UI öffnen:{" "}
                <a
                  href={mauticUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline"
                >
                  {mauticUrl}
                </a>
              </li>
              <li>Initial-Admin anlegen (DB-Connection ist via Compose schon hinterlegt).</li>
              <li>
                Settings → Configuration → API Settings →{" "}
                <em>API enabled</em> + <em>HTTP basic auth enabled</em> aktivieren.
              </li>
              <li>
                Settings → Users → neuer User <code>portal-bridge</code>, Rolle{" "}
                <em>Administrator</em>.
              </li>
              <li>
                Sein Passwort plus Username in <code>.env</code> als{" "}
                <code>MAUTIC_API_USERNAME</code> /{" "}
                <code>MAUTIC_API_TOKEN</code> eintragen, Stack neu starten.
              </li>
            </ol>
          </div>
        }
      />
    );
  } else if (section === "overview") {
    detail = <OverviewDetail overview={overview} mauticUrl={mauticUrl} accent={accent} />;
  } else if (section === "contacts" && selectedContact) {
    detail = <ContactDetail contact={selectedContact} accent={accent} mauticUrl={mauticUrl} />;
  } else if (section === "segments" && selectedSegment) {
    detail = <SegmentDetail segment={selectedSegment} mauticUrl={mauticUrl} />;
  } else if (section === "campaigns" && selectedCampaign) {
    detail = <CampaignDetail campaign={selectedCampaign} mauticUrl={mauticUrl} />;
  } else if (section === "emails" && selectedEmail) {
    detail = <EmailDetail email={selectedEmail} mauticUrl={mauticUrl} />;
  } else {
    detail = (
      <DetailPane
        main={
          <PaneEmptyState
            icon={<Megaphone size={28} className="text-text-tertiary" />}
            title="Wähle einen Eintrag"
            hint="Editor-/Builder-Funktionen (Mail-Designer, Campaign-Editor, Forms) öffnen sich in Mautic — Klick rechts oben auf das ↗-Symbol."
          />
        }
      />
    );
  }

  return (
    <ThreePaneLayout
      storageKey={`marketing:${workspaceId}`}
      primary={primary}
      primaryRail={primaryRail}
      secondary={secondary}
      detail={detail}
      hasSelection={!!selectedId || section === "overview"}
      onMobileBack={() => setSelectedId(null)}
    />
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KPI({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <p className="text-text-tertiary uppercase tracking-wide text-[9.5px]">{label}</p>
      <p className="text-[15px] font-semibold leading-tight">
        {value.toLocaleString("de-DE")}{" "}
        {suffix && <span className="text-[10px] text-text-tertiary font-normal">{suffix}</span>}
      </p>
    </div>
  );
}

function OverviewList({
  overview,
  loading,
  notConfigured,
  mauticUrl,
}: {
  overview: MarketingOverview | null;
  loading: boolean;
  notConfigured: string | null;
  mauticUrl: string;
}) {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        Lade…
      </div>
    );
  }
  if (notConfigured) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-[12px] text-text-tertiary">
        Mautic muss noch eingerichtet werden — siehe Anleitung rechts.
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        Keine Daten.
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2 text-[12px]">
      <Tile label="Aktive Kampagnen" value={overview.campaigns.active} />
      <Tile label="Mails veröffentlicht" value={overview.emails.published} />
      <Tile label="Versand gesamt" value={overview.recentSends} hint="Summe sentCount aller Mails" />
      <Tile label="Segmente" value={overview.segments} />
      <a
        href={mauticUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-stroke-1 text-[12px] hover:bg-bg-elevated"
      >
        <ExternalLink size={12} /> Mautic-UI öffnen
      </a>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded border border-stroke-1 bg-bg-chrome px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="text-[16px] font-semibold leading-tight">
        {value.toLocaleString("de-DE")}
      </p>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

function OverviewDetail({
  overview,
  mauticUrl,
  accent,
}: {
  overview: MarketingOverview | null;
  mauticUrl: string;
  accent: string;
}) {
  return (
    <DetailPane
      header={
        <PaneHeader
          title="Marketing-Übersicht"
          subtitle="Mautic · MedTheris"
          icon={<Megaphone size={14} style={{ color: accent }} />}
          accent={accent}
          right={
            <a
              href={mauticUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> Mautic
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-3xl">
          {!overview ? (
            <p className="text-[12.5px] text-text-tertiary">
              Keine Übersicht verfügbar.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <BigKpi label="Kontakte" value={overview.contacts.total} sub={`${overview.contacts.recent} aktiv 7d`} />
              <BigKpi label="Segmente" value={overview.segments} sub="Listen" />
              <BigKpi
                label="Kampagnen"
                value={overview.campaigns.active}
                sub={`${overview.campaigns.total} insgesamt`}
              />
              <BigKpi
                label="Mails"
                value={overview.emails.published}
                sub={`${overview.emails.total} insgesamt`}
              />
              <BigKpi
                label="Versendet"
                value={overview.recentSends}
                sub="Summe aller Mails"
              />
            </div>
          )}
          <div className="mt-8">
            <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mb-2">
              Nächste Schritte
            </h3>
            <ul className="text-[12.5px] text-text-secondary space-y-1.5 list-disc pl-5">
              <li>Im Twenty-CRM die Stage-Pipeline mit Mautic-Segmenten verknüpfen.</li>
              <li>3-Step Drip-Campaign in Mautic anlegen (Welcome → Use-Case → Demo).</li>
              <li>SMTP-Sender (Migadu johannes@medtheris.kineo360.work) im Mautic-Channel hinterlegen.</li>
              <li>Form auf der Landing-Page einbetten → Submissions landen automatisch in Mautic-Kontakten.</li>
            </ul>
          </div>
        </div>
      }
    />
  );
}

function BigKpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded border border-stroke-1 bg-bg-chrome px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="text-[22px] font-semibold leading-tight">
        {value.toLocaleString("de-DE")}
      </p>
      {sub && <p className="text-[10.5px] text-text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

function ContactDetail({
  contact,
  accent,
  mauticUrl,
}: {
  contact: MauticContact;
  accent: string;
  mauticUrl: string;
}) {
  return (
    <DetailPane
      header={
        <PaneHeader
          title={fullName(contact)}
          subtitle={contact.email ?? `Kontakt #${contact.id}`}
          icon={<UsersIcon size={14} style={{ color: accent }} />}
          accent={accent}
          right={
            <a
              href={`${mauticUrl}/s/contacts/view/${contact.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> in Mautic
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mb-2">
            Kontaktdaten
          </h3>
          <div className="space-y-1.5 text-[12.5px]">
            {contact.email && <Row icon={<Mail size={12} />} value={contact.email} />}
            {contact.company && <Row icon={<Building2 size={12} />} value={contact.company} />}
            {(contact.city || contact.country) && (
              <Row
                icon={<MapPin size={12} />}
                value={[contact.city, contact.country].filter(Boolean).join(", ")}
              />
            )}
          </div>
          {contact.tags.length > 0 && (
            <>
              <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mt-6 mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded text-[10.5px] border border-stroke-1 text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
          {contact.segments.length > 0 && (
            <>
              <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mt-6 mb-2">
                Segmente
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.segments.map((s) => (
                  <span
                    key={s}
                    className="px-1.5 py-0.5 rounded text-[10.5px]"
                    style={{ background: `${accent}1a`, color: accent }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      }
      rightSidebar={
        <>
          <SidebarSection title="Eigenschaften">
            <PropertyList
              rows={[
                { label: "Punkte", value: <>{contact.points}</> },
                { label: "Stage", value: contact.stage ?? "—" },
                { label: "Letzte Aktivität", value: relativeTime(contact.lastActive) },
                { label: "ID", value: <code>{contact.id}</code> },
              ]}
            />
          </SidebarSection>
        </>
      }
    />
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-text-secondary">
      <span className="text-text-tertiary">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function SegmentDetail({
  segment,
  mauticUrl,
}: {
  segment: MauticSegment;
  mauticUrl: string;
}) {
  return (
    <DetailPane
      header={
        <PaneHeader
          title={segment.name}
          subtitle={segment.alias}
          icon={<Layers size={14} />}
          right={
            <a
              href={`${mauticUrl}/s/segments/view/${segment.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> in Mautic
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            {segment.description ?? "Keine Beschreibung."}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <BigKpi label="Kontakte" value={segment.contactCount} />
            <BigKpi label="Status" value={segment.isPublished ? 1 : 0} sub={segment.isPublished ? "veröffentlicht" : "Entwurf"} />
          </div>
        </div>
      }
    />
  );
}

function CampaignDetail({
  campaign,
  mauticUrl,
}: {
  campaign: MauticCampaign;
  mauticUrl: string;
}) {
  return (
    <DetailPane
      header={
        <PaneHeader
          title={campaign.name}
          subtitle={campaign.category ?? "Ohne Kategorie"}
          icon={<Send size={14} />}
          right={
            <a
              href={`${mauticUrl}/s/campaigns/view/${campaign.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> Editor in Mautic
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            {campaign.description ?? "Keine Beschreibung."}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <BigKpi label="Kontakte" value={campaign.contactCount} />
            <BigKpi
              label="Status"
              value={campaign.isPublished ? 1 : 0}
              sub={campaign.isPublished ? "aktiv" : "Entwurf"}
            />
          </div>
          <p className="mt-6 text-[11.5px] text-text-tertiary">
            Drip-Sequenzen, Verzweigungen & Mail-Templates editierst du im
            Mautic-Builder. Der Portal-Hub zeigt nur den Überblick.
          </p>
        </div>
      }
    />
  );
}

function EmailDetail({ email, mauticUrl }: { email: MauticEmail; mauticUrl: string }) {
  return (
    <DetailPane
      header={
        <PaneHeader
          title={email.name}
          subtitle={email.subject}
          icon={<Mail size={14} />}
          right={
            <a
              href={`${mauticUrl}/s/emails/view/${email.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> Designer in Mautic
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <div className="grid grid-cols-3 gap-3">
            <BigKpi label="Versendet" value={email.sentCount} />
            <BigKpi label="Geöffnet" value={email.readCount} />
            <BigKpi
              label="Open-Rate"
              value={Math.round(email.readPercent ?? 0)}
              sub="%"
            />
          </div>
          <PropertyList
            rows={[
              { label: "Typ", value: email.type },
              {
                label: "Status",
                value: email.isPublished ? (
                  <StatusPill label="veröffentlicht" tone="success" />
                ) : (
                  <StatusPill label="Entwurf" tone="neutral" />
                ),
              },
              { label: "Erstellt", value: relativeTime(email.createdAt) },
            ]}
          />
        </div>
      }
    />
  );
}
