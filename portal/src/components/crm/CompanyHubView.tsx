"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  Building2,
  Globe,
  Mail,
  HeadphonesIcon,
  FolderOpen,
  ExternalLink,
  PenLine,
  FileText,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import type { CompanyDetail } from "@/lib/crm/types";
import { companyFilesSearchHint, companySiteDomain } from "@/lib/crm/company-domain";
import { CompanyAttributionSection } from "@/components/crm/CompanyAttributionSection";
import { useT } from "@/components/LocaleProvider";

/**
 * Cross-app company hub — shortcuts into Mail, Helpdesk, Files, Office, Sign,
 * and Twenty. CRM remains source of truth; this surface is navigation + context.
 */
export function CompanyHubView({
  workspaceId,
  workspaceName,
  accent,
  company,
  twentyPublicUrl,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  company: CompanyDetail;
  /** Public Twenty origin (TWENTY_URL), no trailing slash */
  twentyPublicUrl: string;
}) {
  const t = useT();
  const domain = companySiteDomain(company);
  const crmBack = `/${workspaceId}/crm?company=${encodeURIComponent(company.id)}`;

  const mailBase = `/${workspaceId}/mail`;
  const email = company.generalEmail?.trim();
  const mailHref = email
    ? `${mailBase}?compose=1&to=${encodeURIComponent(email)}`
    : domain
      ? `${mailBase}?q=${encodeURIComponent(`@${domain}`)}`
      : mailBase;

  const safeName = company.name.trim().slice(0, 200);
  const helpdeskHref =
    safeName.length > 0
      ? `/${workspaceId}/helpdesk?q=${encodeURIComponent(safeName)}`
      : `/${workspaceId}/helpdesk`;

  const filesHint = companyFilesSearchHint(domain, company.name);
  const filesHref = filesHint
    ? `/${workspaceId}/files?q=${encodeURIComponent(filesHint)}`
    : `/${workspaceId}/files`;

  const tiles = useMemo(() => {
    const mailDesc = email
      ? t("crm.companyHub.tileMailDescCompose")
      : domain
        ? t("crm.companyHub.tileMailDescDomain").replace("{domain}", domain)
        : t("crm.companyHub.tileMailDescInbox");

    const filesDesc = filesHint
      ? t("crm.companyHub.tileFilesDescSearch").replace(
          "{hint}",
          filesHint.length > 36 ? `${filesHint.slice(0, 36)}…` : filesHint,
        )
      : t("crm.companyHub.tileFilesDescManual");

    const tileList: {
      title: string;
      description: string;
      href: string;
      icon: typeof Mail;
      external?: boolean;
    }[] = [
      {
        title: t("crm.companyHub.tileCrmTitle"),
        description: t("crm.companyHub.tileCrmDesc"),
        href: crmBack,
        icon: Building2,
      },
      {
        title: t("nav.mail"),
        description: mailDesc,
        href: mailHref,
        icon: Mail,
      },
      {
        title: t("nav.helpdesk"),
        description: t("crm.companyHub.tileHelpdeskDesc"),
        href: helpdeskHref,
        icon: HeadphonesIcon,
      },
      {
        title: t("nav.files"),
        description: filesDesc,
        href: filesHref,
        icon: FolderOpen,
      },
      {
        title: t("nav.office"),
        description: t("crm.companyHub.tileOfficeDesc"),
        href: `/${workspaceId}/office?crmCompany=${encodeURIComponent(company.id)}`,
        icon: FileText,
      },
      {
        title: t("crm.companyHub.tileSignTitle"),
        description: t("crm.companyHub.tileSignDesc"),
        href: `/${workspaceId}/sign?crmCompany=${encodeURIComponent(company.id)}`,
        icon: PenLine,
      },
      {
        title: t("crm.companyHub.tileTwentyTitle"),
        description: t("crm.companyHub.tileTwentyDesc"),
        href: twentyPublicUrl,
        icon: ExternalLink,
        external: true,
      },
    ];
    return tileList;
  }, [
    t,
    crmBack,
    mailHref,
    helpdeskHref,
    filesHref,
    filesHint,
    twentyPublicUrl,
    email,
    domain,
    workspaceId,
    company.id,
  ]);

  return (
    <div className="min-h-full px-4 py-6 max-w-3xl mx-auto">
      <div className="mb-5 flex items-center gap-2 text-[12px] text-text-tertiary">
        <Link
          href={crmBack}
          className="inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ArrowLeft size={12} />
          {t("crm.nav.backToCrm")}
        </Link>
        <span className="opacity-40">·</span>
        <span>{workspaceName}</span>
      </div>

      <header
        className="rounded-xl border border-stroke-1 bg-bg-elevated p-5 mb-6"
        style={{ borderColor: `${accent}35` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold text-white shrink-0"
            style={{ background: accent }}
          >
            {company.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-text-primary text-xl font-semibold leading-tight">
              {company.name}
            </h1>
            <p className="text-text-tertiary text-[13px] mt-1">
              {t("crm.companyHub.tagline")}
            </p>
            {domain && (
              <p className="text-[12px] text-text-secondary mt-2 inline-flex items-center gap-1.5">
                <Globe size={12} className="text-text-tertiary" />
                <span className="font-mono">{domain}</span>
              </p>
            )}
            {(company.phone || company.generalEmail) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
                {company.phone && (
                  <span>
                    {t("crm.companyHub.phoneShort")} {company.phone}
                  </span>
                )}
                {company.generalEmail && (
                  <a
                    href={`mailto:${company.generalEmail}`}
                    className="text-info hover:underline"
                  >
                    {company.generalEmail}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <CompanyAttributionSection
        workspaceId={workspaceId}
        companyId={company.id}
        accent={accent}
      />

      <h2 className="text-text-primary text-sm font-semibold mb-3">
        {t("crm.companyHub.quickLinksHeading")}
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const inner = (
            <>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${accent}18`, color: accent }}
              >
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-text-primary text-[13px] font-medium flex items-center gap-1">
                  {tile.title}
                  {tile.external && (
                    <ExternalLink size={11} className="text-text-tertiary" />
                  )}
                </div>
                <p className="text-text-tertiary text-[11.5px] mt-0.5 leading-snug">
                  {tile.description}
                </p>
              </div>
            </>
          );
          const className =
            "flex items-start gap-3 rounded-lg border border-stroke-1 bg-bg-elevated px-4 py-3 hover:border-stroke-2 transition-colors text-left w-full";
          return (
            <li key={tile.href + tile.title}>
              {tile.external ? (
                <a
                  href={tile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              ) : (
                <Link href={tile.href} className={className}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
