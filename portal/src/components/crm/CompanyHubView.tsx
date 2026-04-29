import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Globe,
  Mail,
  HeadphonesIcon,
  FolderOpen,
  Kanban,
  ExternalLink,
  PenLine,
  FileText,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import type { CompanyDetail } from "@/lib/crm/types";
import { companyFilesSearchHint, companySiteDomain } from "@/lib/crm/company-domain";
import { CompanyAttributionSection } from "@/components/crm/CompanyAttributionSection";

/**
 * Cross-app „Company Hub“ — eine Übersichtsseite mit Tieflinks in Mail,
 * Helpdesk, Files und Projekte. CRM bleibt Quelle der Wahrheit; hier nur
 * Navigation + Kontext.
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

  const tiles: {
    title: string;
    description: string;
    href: string;
    icon: typeof Mail;
    external?: boolean;
  }[] = [
    {
      title: "CRM · Detail",
      description: "Gleiche Firma im dreispaltigen CRM öffnen.",
      href: crmBack,
      icon: Building2,
    },
    {
      title: "Mail",
      description: email
        ? "Entwurf im Portal mit der hinterlegten Adresse starten."
        : domain
          ? `Liste filtern nach „@${domain}“ (nach dem Öffnen aktiv).`
          : "Postfach öffnen — Suchfeld manuell nutzen.",
      href: mailHref,
      icon: Mail,
    },
    {
      title: "Helpdesk",
      description:
        "Tickets mit Suchwort (Firmenname) laden — genauer in der Ticketliste.",
      href: helpdeskHref,
      icon: HeadphonesIcon,
    },
    {
      title: "Files",
      description: filesHint
        ? `Vollsuche mit „${filesHint.length > 36 ? `${filesHint.slice(0, 36)}…` : filesHint}“.`
        : "Cloud öffnen — Suche manuell.",
      href: filesHref,
      icon: FolderOpen,
    },
    {
      title: "Office",
      description:
        "Vorlagen & Texte bearbeiten; PDF aus Office exportieren und zu Sign bringen.",
      href: `/${workspaceId}/office?crmCompany=${encodeURIComponent(company.id)}`,
      icon: FileText,
    },
    {
      title: "Unterschrift (Sign)",
      description:
        "PDF hochladen oder aus Office bringen — Verknüpfung mit dieser Firma für Nachvollziehbarkeit.",
      href: `/${workspaceId}/sign?crmCompany=${encodeURIComponent(company.id)}`,
      icon: PenLine,
    },
    {
      title: "Twenty (CRM Roh)",
      description: "Native Twenty-Oberfläche.",
      href: twentyPublicUrl,
      icon: ExternalLink,
      external: true,
    },
  ];

  return (
    <div className="min-h-full px-4 py-6 max-w-3xl mx-auto">
      <div className="mb-5 flex items-center gap-2 text-[12px] text-text-tertiary">
        <Link
          href={crmBack}
          className="inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ArrowLeft size={12} />
          Zurück zum CRM
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
              Company-Hub · Querschnitt Mail, Tickets, Files, Sign, Projekte
            </p>
            {domain && (
              <p className="text-[12px] text-text-secondary mt-2 inline-flex items-center gap-1.5">
                <Globe size={12} className="text-text-tertiary" />
                <span className="font-mono">{domain}</span>
              </p>
            )}
            {(company.phone || company.generalEmail) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
                {company.phone && <span>Tel. {company.phone}</span>}
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
        Schnellzugriff
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
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
                  {t.title}
                  {t.external && (
                    <ExternalLink size={11} className="text-text-tertiary" />
                  )}
                </div>
                <p className="text-text-tertiary text-[11.5px] mt-0.5 leading-snug">
                  {t.description}
                </p>
              </div>
            </>
          );
          const className =
            "flex items-start gap-3 rounded-lg border border-stroke-1 bg-bg-elevated px-4 py-3 hover:border-stroke-2 transition-colors text-left w-full";
          return (
            <li key={t.href + t.title}>
              {t.external ? (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              ) : (
                <Link href={t.href} className={className}>
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
