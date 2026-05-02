"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Megaphone } from "lucide-react";
import type {
  CompanyAttributionRecord,
  UtmTouchPayload,
} from "@/lib/marketing/attribution-types";
import type { WorkspaceId } from "@/lib/workspaces";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

function touchHasContent(t?: UtmTouchPayload | null): boolean {
  if (!t) return false;
  return Boolean(
    t.utm_source ||
      t.utm_medium ||
      t.utm_campaign ||
      t.utm_term ||
      t.utm_content ||
      t.referrer ||
      t.landingPath,
  );
}

function touchesDiffer(
  a?: UtmTouchPayload | null,
  b?: UtmTouchPayload | null,
): boolean {
  if (!a || !b) return false;
  if (a.capturedAt !== b.capturedAt) return true;
  return (
    a.utm_source !== b.utm_source ||
    a.utm_medium !== b.utm_medium ||
    a.utm_campaign !== b.utm_campaign ||
    a.utm_term !== b.utm_term ||
    a.utm_content !== b.utm_content ||
    a.referrer !== b.referrer ||
    a.landingPath !== b.landingPath
  );
}

function row(
  label: string,
  value: string | null | undefined,
): ReactNode {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    <div className="grid grid-cols-[100px,1fr] gap-x-2 gap-y-0.5 text-[11px]">
      <span className="text-text-quaternary">{label}</span>
      <span className="text-text-secondary font-mono truncate" title={v}>
        {v}
      </span>
    </div>
  );
}

function touchBlock(
  heading: string,
  payload: CompanyAttributionRecord["firstTouch"],
  localeFmt: string,
): ReactNode {
  if (!payload) return null;
  const rows = [
    row("source", payload.utm_source),
    row("medium", payload.utm_medium),
    row("campaign", payload.utm_campaign),
    row("term", payload.utm_term),
    row("content", payload.utm_content),
    row("Referrer", payload.referrer),
    row("Landing", payload.landingPath),
  ].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-stroke-1/80 bg-bg-base/50 px-3 py-2 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-text-quaternary font-medium">
        {heading}{" "}
        <span className="font-normal text-text-tertiary normal-case">
          · {new Date(payload.capturedAt).toLocaleString(localeFmt)}
        </span>
      </p>
      <div className="space-y-1">{rows}</div>
    </div>
  );
}

export function CompanyAttributionSection({
  workspaceId,
  companyId,
  accent,
}: {
  workspaceId: WorkspaceId;
  companyId: string;
  accent: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const localeFmt = localeTag(locale);
  const [data, setData] = useState<CompanyAttributionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/marketing/attribution?ws=${encodeURIComponent(workspaceId)}&companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as {
        attribution?: CompanyAttributionRecord | null;
        error?: string;
      };
      if (!r.ok) {
        setData(null);
        return;
      }
      setData(j.attribution ?? null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasData =
    data &&
    (touchHasContent(data.firstTouch) || touchHasContent(data.lastTouch));

  return (
    <section
      className="rounded-xl border border-stroke-1 bg-bg-elevated p-4 mb-6"
      style={{ borderColor: `${accent}28` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Megaphone size={16} />
        </div>
        <div>
          <h2 className="text-text-primary text-sm font-semibold">
            {t("crm.attribution.heading")}
          </h2>
          <p className="text-[10.5px] text-text-tertiary">
            {t("crm.attribution.subheading")}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-[12px] text-text-tertiary">{t("crm.attribution.loading")}</p>
      ) : !hasData ? (
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          {t("crm.attribution.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {touchBlock(
            t("crm.attribution.firstTouch"),
            data!.firstTouch,
            localeFmt,
          )}
          {touchesDiffer(data!.firstTouch, data!.lastTouch)
            ? touchBlock(
                t("crm.attribution.lastTouch"),
                data!.lastTouch,
                localeFmt,
              )
            : null}
        </div>
      )}
    </section>
  );
}
