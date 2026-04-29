"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings as SettingsIcon, Folders } from "lucide-react";
import { useT } from "@/components/LocaleProvider";

export function ProjectsSettingsClient({
  workspaceId,
  workspaceName,
  accent,
  planePublicBase,
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
  planePublicBase: string;
}) {
  const t = useT();
  const base = planePublicBase.replace(/\/$/, "");
  const planeProfileHref = `${base}/profile/`;
  const ssoHref = `/api/plane/sso?ws=${encodeURIComponent(workspaceId)}`;

  return (
    <div className="min-h-full px-6 py-6 max-w-2xl">
      <div className="mb-4 flex items-center gap-2 text-[12px] text-text-tertiary">
        <Link
          href={`/${workspaceId}/projects`}
          className="inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ArrowLeft size={12} />
          {t("nav.projects", "Projects")}
        </Link>
        <span className="opacity-50">·</span>
        <span className="inline-flex items-center gap-1">
          <SettingsIcon size={12} />
          {t("projects.settings.crumbSettings")}
        </span>
      </div>

      <header className="rounded-xl border border-stroke-1 bg-bg-elevated p-6 mb-6">
        <div className="flex items-start gap-4">
          <span
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `${accent}22`,
              color: accent,
            }}
          >
            <Folders size={26} />
          </span>
          <div className="min-w-0">
            <h1 className="text-text-primary text-lg font-semibold">
              {t("common.settings", "Settings")} · {workspaceName}
            </h1>
            <p className="text-text-tertiary text-[13px] mt-2 leading-relaxed">{t("projects.settings.lead")}</p>
          </div>
        </div>
      </header>

      <ul className="space-y-2 text-[13px]">
        <li>
          <Link
            href={`/${workspaceId}/projects`}
            className="flex items-center gap-2 rounded-lg border border-stroke-1 bg-bg-base px-4 py-3 hover:border-stroke-2 hover:bg-bg-elevated transition-colors"
          >
            <span className="flex-1 text-text-primary">{t("projects.settings.link.portalViews")}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/${workspaceId}/projects/plane`}
            className="flex items-center gap-2 rounded-lg border border-stroke-1 bg-bg-base px-4 py-3 hover:border-stroke-2 hover:bg-bg-elevated transition-colors"
          >
            <span className="flex-1 text-text-primary">{t("projects.settings.link.planeHub")}</span>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </Link>
        </li>
        <li>
          <a
            href={ssoHref}
            className="flex items-center gap-2 rounded-lg border border-stroke-1 bg-bg-base px-4 py-3 hover:border-stroke-2 hover:bg-bg-elevated transition-colors"
            style={{ borderColor: `${accent}40` }}
          >
            <span className="flex-1 text-text-primary">{t("projects.settings.link.openPlane")}</span>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </a>
        </li>
        <li>
          <a
            href={planeProfileHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-stroke-1 bg-bg-base px-4 py-3 hover:border-stroke-2 hover:bg-bg-elevated transition-colors"
          >
            <span className="flex-1 text-text-primary">{t("projects.settings.link.profile")}</span>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </a>
        </li>
      </ul>

      <p className="mt-6 text-[11px] text-text-quaternary leading-relaxed">
        {t("projects.settings.instance")}: <code className="text-text-tertiary">{base}</code>
      </p>
    </div>
  );
}
