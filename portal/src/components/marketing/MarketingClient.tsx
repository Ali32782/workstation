"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Settings as SettingsIcon,
  ArrowRight,
  Play,
  Pause,
  Copy,
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
import { useLocale } from "@/components/LocaleProvider";
import { localeTag, type Messages } from "@/lib/i18n/messages";

type Section = "overview" | "contacts" | "segments" | "campaigns" | "emails";

const NAV_SECTIONS: { id: Section; icon: React.ElementType }[] = [
  { id: "overview", icon: Megaphone },
  { id: "contacts", icon: UsersIcon },
  { id: "segments", icon: Layers },
  { id: "campaigns", icon: Send },
  { id: "emails", icon: Mail },
];

function relativeTime(
  iso: string | null,
  localeFmt: string,
  tr: (key: keyof Messages) => string,
): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return tr("helpdesk.time.justNow");
  if (diff < 3600)
    return `${Math.floor(diff / 60)} ${tr("helpdesk.time.mins")}`;
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} ${tr("helpdesk.time.hours")}`;
  if (diff < 86400 * 7)
    return `${Math.floor(diff / 86400)} ${tr("helpdesk.time.days")}`;
  return new Date(iso).toLocaleDateString(localeFmt);
}

function fullName(
  c: MauticContact,
  tr: (key: keyof Messages) => string,
): string {
  const f = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return f || c.email || tr("marketing.contactFallback").replace("{id}", String(c.id));
}

export function MarketingClient({
  workspaceId,
  workspaceName,
  accent,
  mauticUrl,
  initialSection,
  initialQuery,
  initialContactId,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  mauticUrl: string;
  /** Deep-link from Cmd+K / bookmarks (`?section=&q=&contact=`). */
  initialSection?: Section;
  initialQuery?: string;
  initialContactId?: string;
}) {
  const [section, setSection] = useState<Section>(
    initialSection ?? (initialContactId ? "contacts" : "overview"),
  );
  const [search, setSearch] = useState(initialQuery ?? "");
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [contacts, setContacts] = useState<MauticContact[]>([]);
  const [segments, setSegments] = useState<MauticSegment[]>([]);
  const [campaigns, setCampaigns] = useState<MauticCampaign[]>([]);
  const [emails, setEmails] = useState<MauticEmail[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialContactId && /^\d+$/.test(initialContactId)
      ? `c-${initialContactId}`
      : null,
  );

  const ws = workspaceId;

  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const navLabels = useMemo(
    () =>
      ({
        overview: t("marketing.section.overview"),
        contacts: t("marketing.section.contacts"),
        segments: t("marketing.section.segments"),
        campaigns: t("marketing.section.campaigns"),
        emails: t("marketing.section.emails"),
      }) satisfies Record<Section, string>,
    [t],
  );

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
        setNotConfigured(ov.body.error ?? t("marketing.notConfiguredBanner"));
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
  }, [ws, search, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const items: RecordListItem[] = useMemo(() => {
    if (section === "contacts") {
      return contacts.map((c) => ({
        id: `c-${c.id}`,
        title: fullName(c, t),
        subtitle:
          [c.email, c.company].filter(Boolean).join(" · ") || c.country || undefined,
        meta: relativeTime(c.lastActive, localeFmt, t),
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
              {t("crm.marketing.pointsAbbrev").replace("{n}", String(c.points))}
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
            label={
              c.isPublished
                ? t("marketing.kpi.campaignActiveSuffix")
                : t("marketing.segment.statusDraft")
            }
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
        meta: relativeTime(e.createdAt, localeFmt, t),
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
  }, [section, contacts, segments, campaigns, emails, accent, localeFmt, t]);

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
        title={t("marketing.title")}
        subtitle={t("marketing.subtitleMautic")}
        icon={<Megaphone size={14} style={{ color: accent }} />}
        accent={accent}
        right={
          <div className="flex items-center gap-0.5">
            <Link
              href={`/${workspaceId}/marketing/settings`}
              title={t("marketing.settingsTooltip")}
              className="p-1 rounded hover:bg-bg-elevated text-text-tertiary"
            >
              <SettingsIcon size={13} />
            </Link>
            <a
              href={mauticUrl}
              target="_blank"
              rel="noreferrer"
              title={t("marketing.openMauticTooltip")}
              className="p-1 rounded hover:bg-bg-elevated text-text-tertiary"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        }
      />
      <nav className="flex-1 min-h-0 overflow-auto py-1">
        {NAV_SECTIONS.map((s) => {
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
              <span className="flex-1 truncate">{navLabels[s.id]}</span>
            </button>
          );
        })}
      </nav>
      {overview && (
        <div className="shrink-0 border-t border-stroke-1 px-3 py-3 grid grid-cols-2 gap-2 text-[11px]">
          <KPI label={t("marketing.kpi.contacts")} value={overview.contacts.total} localeFmt={localeFmt} />
          <KPI label={t("marketing.kpi.active7d")} value={overview.contacts.recent} localeFmt={localeFmt} />
          <KPI label={t("marketing.kpi.segments")} value={overview.segments} localeFmt={localeFmt} />
          <KPI
            label={t("marketing.kpi.campaigns")}
            value={overview.campaigns.active}
            suffix={t("marketing.kpi.campaignActiveSuffix")}
            localeFmt={localeFmt}
          />
        </div>
      )}
    </div>
  );

  const primaryRail = (
    <div className="flex flex-col h-full items-center py-2 gap-1">
      {NAV_SECTIONS.map((s) => {
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
            title={navLabels[s.id]}
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
        title={navLabels[section]}
        subtitle={
          section === "contacts"
            ? t("marketing.visibleCount").replace("{count}", String(contacts.length))
            : section === "segments"
              ? `${segments.length}`
              : section === "campaigns"
                ? `${campaigns.length}`
                : section === "emails"
                  ? `${emails.length}`
                  : navLabels.overview
        }
        right={
          <button
            type="button"
            onClick={reload}
            title={t("marketing.reloadTooltip")}
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
              placeholder={`${t("common.search")}…`}
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
            notConfigured ? t("marketing.notConfiguredBanner") : t("common.noEntries")
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
                  {t("marketing.notConfiguredDetailTitle")}
                </h2>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  {notConfigured}
                </p>
              </div>
            </div>
            <ol className="text-[12px] text-text-secondary space-y-2 list-decimal pl-5 mt-6">
              <li>
                {t("marketing.setup.openUi")}{" "}
                <a
                  href={mauticUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline"
                >
                  {mauticUrl}
                </a>
              </li>
              <li>{t("marketing.setup.adminUser")}</li>
              <li>{t("marketing.setup.apiSettings")}</li>
              <li>{t("marketing.setup.portalUser")}</li>
              <li>{t("marketing.setup.envKeys")}</li>
            </ol>
          </div>
        }
      />
    );
  } else if (section === "overview") {
    detail = (
      <OverviewDetail
        overview={overview}
        mauticUrl={mauticUrl}
        accent={accent}
        workspaceName={workspaceName}
      />
    );
  } else if (section === "contacts" && selectedContact) {
    detail = (
      <ContactDetail
        contact={selectedContact}
        accent={accent}
        mauticUrl={mauticUrl}
        workspaceId={workspaceId}
      />
    );
  } else if (section === "segments" && selectedSegment) {
    detail = <SegmentDetail segment={selectedSegment} mauticUrl={mauticUrl} />;
  } else if (section === "campaigns" && selectedCampaign) {
    detail = (
      <CampaignDetail
        campaign={selectedCampaign}
        mauticUrl={mauticUrl}
        workspaceId={workspaceId}
        onChanged={(next) => {
          setCampaigns((prev) =>
            prev.map((c) => (c.id === next.id ? next : c)),
          );
        }}
        onCloned={(clone) => {
          setCampaigns((prev) => [clone, ...prev]);
          setSelectedId(`cmp-${clone.id}`);
        }}
      />
    );
  } else if (section === "emails" && selectedEmail) {
    detail = <EmailDetail email={selectedEmail} mauticUrl={mauticUrl} />;
  } else {
    detail = (
      <DetailPane
        main={
          <PaneEmptyState
            icon={<Megaphone size={28} className="text-text-tertiary" />}
            title={t("marketing.pickRecordTitle")}
            hint={t("marketing.pickRecordHint")}
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

function KPI({
  label,
  value,
  suffix,
  localeFmt,
}: {
  label: string;
  value: number;
  suffix?: string;
  localeFmt: string;
}) {
  return (
    <div>
      <p className="text-text-tertiary uppercase tracking-wide text-[9.5px]">{label}</p>
      <p className="text-[15px] font-semibold leading-tight">
        {value.toLocaleString(localeFmt)}{" "}
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
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        {t("marketing.overview.loading")}
      </div>
    );
  }
  if (notConfigured) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-[12px] text-text-tertiary">
        {t("marketing.overview.setupHint")}
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        {t("marketing.overview.noData")}
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2 text-[12px]">
      <Tile label={t("marketing.tile.activeCampaigns")} value={overview.campaigns.active} localeFmt={localeFmt} />
      <Tile label={t("marketing.tile.emailsPublished")} value={overview.emails.published} localeFmt={localeFmt} />
      <Tile
        label={t("marketing.tile.sendsTotal")}
        value={overview.recentSends}
        hint={t("marketing.tile.sendsHint")}
        localeFmt={localeFmt}
      />
      <Tile label={t("marketing.tile.segments")} value={overview.segments} localeFmt={localeFmt} />
      <a
        href={mauticUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-stroke-1 text-[12px] hover:bg-bg-elevated"
      >
        <ExternalLink size={12} /> {t("marketing.openMauticUi")}
      </a>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  localeFmt,
}: {
  label: string;
  value: number;
  hint?: string;
  localeFmt: string;
}) {
  return (
    <div className="rounded border border-stroke-1 bg-bg-chrome px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="text-[16px] font-semibold leading-tight">
        {value.toLocaleString(localeFmt)}
      </p>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

function OverviewDetail({
  overview,
  mauticUrl,
  accent,
  workspaceName,
}: {
  overview: MarketingOverview | null;
  mauticUrl: string;
  accent: string;
  workspaceName: string;
}) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  return (
    <DetailPane
      header={
        <PaneHeader
          title={t("marketing.detail.overviewTitle")}
          subtitle={`${t("marketing.detail.overviewSubtitle")} · ${workspaceName}`}
          icon={<Megaphone size={14} style={{ color: accent }} />}
          accent={accent}
          right={
            <a
              href={mauticUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> {t("marketing.subtitleMautic")}
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-3xl">
          {!overview ? (
            <p className="text-[12.5px] text-text-tertiary">{t("marketing.noOverview")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <BigKpi
                label={t("marketing.kpi.contacts")}
                value={overview.contacts.total}
                sub={t("marketing.bigKpi.contactsSub").replace(
                  "{recent}",
                  String(overview.contacts.recent),
                )}
                localeFmt={localeFmt}
              />
              <BigKpi
                label={t("marketing.kpi.segments")}
                value={overview.segments}
                sub={t("marketing.bigKpi.segmentsSub")}
                localeFmt={localeFmt}
              />
              <BigKpi
                label={t("marketing.kpi.campaigns")}
                value={overview.campaigns.active}
                sub={t("marketing.bigKpi.campaignsSub").replace(
                  "{total}",
                  String(overview.campaigns.total),
                )}
                localeFmt={localeFmt}
              />
              <BigKpi
                label={t("marketing.section.emails")}
                value={overview.emails.published}
                sub={t("marketing.bigKpi.emailsSub").replace(
                  "{total}",
                  String(overview.emails.total),
                )}
                localeFmt={localeFmt}
              />
              <BigKpi
                label={t("marketing.bigKpi.sentSub")}
                value={overview.recentSends}
                sub={t("marketing.bigKpi.sentHint")}
                localeFmt={localeFmt}
              />
            </div>
          )}
          <div className="mt-8">
            <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mb-2">
              {t("marketing.nextStepsTitle")}
            </h3>
            <ul className="text-[12.5px] text-text-secondary space-y-1.5 list-disc pl-5">
              <li>{t("marketing.nextSteps.crmSegments")}</li>
              <li>{t("marketing.nextSteps.drip")}</li>
              <li>{t("marketing.nextSteps.smtp")}</li>
              <li>{t("marketing.nextSteps.form")}</li>
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
  localeFmt,
}: {
  label: string;
  value: number;
  sub?: string;
  localeFmt: string;
}) {
  return (
    <div className="rounded border border-stroke-1 bg-bg-chrome px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="text-[22px] font-semibold leading-tight">
        {value.toLocaleString(localeFmt)}
      </p>
      {sub && <p className="text-[10.5px] text-text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

type CrmCrossLink = {
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    companyId: string | null;
    companyName: string | null;
  } | null;
  workspace?: string;
  deepLink?: string;
  reason?: string;
};

function CrmCrossLinkSection({
  contact,
  workspaceId,
  accent,
}: {
  contact: MauticContact;
  workspaceId: WorkspaceId;
  accent: string;
}) {
  const { t } = useLocale();
  const [data, setData] = useState<CrmCrossLink | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!contact.email) {
      setData({ person: null });
      return;
    }
    setLoading(true);
    setData(null);
    (async () => {
      try {
        const r = await fetch(
          `/api/marketing/contacts/${contact.id}/crm?ws=${workspaceId}&email=${encodeURIComponent(contact.email!)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as CrmCrossLink;
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setData({ person: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contact.id, contact.email, workspaceId]);

  return (
    <SidebarSection title={t("marketing.sidebar.crm")}>
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Loader2 size={11} className="animate-spin" /> {t("marketing.crm.searching")}
        </div>
      )}
      {!loading && data?.person && data.deepLink && (
        <div className="space-y-1.5">
          <Link
            href={data.deepLink}
            className="block rounded-md border border-stroke-1 px-2.5 py-2 hover:bg-bg-elevated"
            style={{ borderColor: `${accent}40` }}
          >
            <p className="text-[12px] font-medium text-text-primary truncate">
              {`${data.person.firstName ?? ""} ${data.person.lastName ?? ""}`.trim() ||
                data.person.email ||
                t("marketing.crm.unnamedPerson")}
            </p>
            {data.person.companyName && (
              <p className="text-[10.5px] text-text-tertiary truncate">
                @{data.person.companyName}
              </p>
            )}
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-text-tertiary">
              <ArrowRight size={10} />
              {t("marketing.crm.openInTwenty").replace(
                "{workspace}",
                data.workspace ?? "",
              )}
            </p>
          </Link>
        </div>
      )}
      {!loading && (!data?.person) && (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {t("marketing.crm.noPersonForEmail").replace(
            "{email}",
            contact.email ?? "—",
          )}
        </p>
      )}
    </SidebarSection>
  );
}

function ContactDetail({
  contact,
  accent,
  mauticUrl,
  workspaceId,
}: {
  contact: MauticContact;
  accent: string;
  mauticUrl: string;
  workspaceId: WorkspaceId;
}) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  return (
    <DetailPane
      header={
        <PaneHeader
          title={fullName(contact, t)}
          subtitle={
            contact.email ??
            t("marketing.contactFallback").replace("{id}", String(contact.id))
          }
          icon={<UsersIcon size={14} style={{ color: accent }} />}
          accent={accent}
          right={
            <a
              href={`${mauticUrl}/s/contacts/view/${contact.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
            >
              <ExternalLink size={12} /> {t("marketing.detail.openInMautic")}
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mb-2">
            {t("marketing.contact.fieldsHeading")}
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
                {t("marketing.sidebar.tags")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded text-[10.5px] border border-stroke-1 text-text-secondary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
          {contact.segments.length > 0 && (
            <>
              <h3 className="text-[12px] uppercase tracking-wide text-text-tertiary mt-6 mb-2">
                {t("marketing.section.segments")}
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
          <SidebarSection title={t("marketing.sidebar.properties")}>
            <PropertyList
              rows={[
                { label: t("marketing.contact.pointsLabel"), value: <>{contact.points}</> },
                { label: t("marketing.contact.stageLabel"), value: contact.stage ?? "—" },
                {
                  label: t("marketing.activity.last"),
                  value: relativeTime(contact.lastActive, localeFmt, t),
                },
                { label: "ID", value: <code>{contact.id}</code> },
              ]}
            />
          </SidebarSection>
          <CrmCrossLinkSection
            contact={contact}
            workspaceId={workspaceId}
            accent={accent}
          />
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
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
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
              <ExternalLink size={12} /> {t("marketing.detail.openInMautic")}
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            {segment.description ?? t("marketing.segment.noDescription")}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <BigKpi label={t("marketing.kpi.contacts")} value={segment.contactCount} localeFmt={localeFmt} />
            <BigKpi
              label={t("common.status")}
              value={segment.isPublished ? 1 : 0}
              sub={
                segment.isPublished
                  ? t("marketing.segment.statusPublished")
                  : t("marketing.segment.statusDraft")
              }
              localeFmt={localeFmt}
            />
          </div>
        </div>
      }
    />
  );
}

function CampaignDetail({
  campaign,
  mauticUrl,
  workspaceId,
  onChanged,
  onCloned,
}: {
  campaign: MauticCampaign;
  mauticUrl: string;
  workspaceId: WorkspaceId;
  onChanged: (next: MauticCampaign) => void;
  onCloned: (clone: MauticCampaign) => void;
}) {
  const [busy, setBusy] = useState<null | "toggle" | "clone">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);

  const togglePublished = async () => {
    if (busy) return;
    setBusy("toggle");
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(
        `/api/marketing/campaigns/${campaign.id}?ws=${workspaceId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isPublished: !campaign.isPublished }),
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        campaign?: MauticCampaign;
        error?: string;
      };
      if (!r.ok || !body.campaign) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      onChanged(body.campaign);
      setInfo(
        body.campaign.isPublished
          ? t("marketing.campaign.activatedToast")
          : t("marketing.campaign.pausedToast"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const cloneIt = async () => {
    if (busy) return;
    setBusy("clone");
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(
        `/api/marketing/campaigns/${campaign.id}/clone?ws=${workspaceId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        campaign?: MauticCampaign;
        eventsCopied?: boolean;
        error?: string;
      };
      if (!r.ok || !body.campaign) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      onCloned(body.campaign);
      setInfo(
        body.eventsCopied
          ? t("marketing.campaign.cloneFull")
          : t("marketing.campaign.cloneMeta"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DetailPane
      header={
        <PaneHeader
          title={campaign.name}
          subtitle={campaign.category ?? t("marketing.campaign.noCategory")}
          icon={<Send size={14} />}
          right={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePublished}
                disabled={busy !== null}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                  campaign.isPublished
                    ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                    : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                } disabled:opacity-50`}
                title={
                  campaign.isPublished
                    ? t("marketing.campaign.pauseTooltip")
                    : t("marketing.campaign.startHint")
                }
              >
                {busy === "toggle" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : campaign.isPublished ? (
                  <Pause size={12} />
                ) : (
                  <Play size={12} />
                )}
                {campaign.isPublished ? t("marketing.campaign.pause") : t("marketing.campaign.start")}
              </button>
              <button
                type="button"
                onClick={cloneIt}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated disabled:opacity-50"
                title={t("marketing.campaign.duplicateTooltip")}
              >
                {busy === "clone" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Copy size={12} />
                )}
                {t("marketing.campaign.duplicate")}
              </button>
              <a
                href={`${mauticUrl}/s/campaigns/view/${campaign.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-stroke-1 hover:bg-bg-elevated"
              >
                <ExternalLink size={12} /> {t("marketing.campaign.editor")}
              </a>
            </div>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-[11.5px] p-2.5 leading-relaxed">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-[11.5px] p-2.5 leading-relaxed">
              {info}
            </div>
          )}
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            {campaign.description ?? t("marketing.segment.noDescription")}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <BigKpi label={t("marketing.kpi.contacts")} value={campaign.contactCount} localeFmt={localeFmt} />
            <BigKpi
              label={t("common.status")}
              value={campaign.isPublished ? 1 : 0}
              sub={
                campaign.isPublished
                  ? t("marketing.kpi.campaignActiveSuffix")
                  : t("marketing.segment.statusDraft")
              }
              localeFmt={localeFmt}
            />
          </div>
          <p className="mt-6 text-[11.5px] text-text-tertiary">{t("marketing.builderHint")}</p>
        </div>
      }
    />
  );
}

function EmailDetail({ email, mauticUrl }: { email: MauticEmail; mauticUrl: string }) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
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
              <ExternalLink size={12} /> {t("marketing.email.designerInMautic")}
            </a>
          }
        />
      }
      main={
        <div className="px-6 py-6 max-w-2xl">
          <div className="grid grid-cols-3 gap-3">
            <BigKpi label={t("marketing.bigKpi.sentSub")} value={email.sentCount} localeFmt={localeFmt} />
            <BigKpi label={t("marketing.email.opened")} value={email.readCount} localeFmt={localeFmt} />
            <BigKpi
              label={t("marketing.email.openRate")}
              value={Math.round(email.readPercent ?? 0)}
              sub="%"
              localeFmt={localeFmt}
            />
          </div>
          <PropertyList
            rows={[
              { label: t("marketing.email.typeLabel"), value: email.type },
              {
                label: t("common.status"),
                value: email.isPublished ? (
                  <StatusPill label={t("marketing.email.statusPublished")} tone="success" />
                ) : (
                  <StatusPill label={t("marketing.segment.statusDraft")} tone="neutral" />
                ),
              },
              {
                label: t("marketing.email.createdLabel"),
                value: relativeTime(email.createdAt, localeFmt, t),
              },
            ]}
          />
        </div>
      }
    />
  );
}
