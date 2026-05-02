"use client";

/**
 * Per-workspace error boundary. Catches anything that throws below
 * `app/[workspace]/layout.tsx`, so the user's TopBar + Sidebar stay
 * intact while only the inner content is replaced with a friendly
 * fallback.
 *
 * The matching root-level boundary is `app/global-error.tsx`; this one
 * here is purely about per-page failures (e.g. a CRM API call timing
 * out and the component throwing instead of returning empty state).
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "@/components/LocaleProvider";
import { reportClient } from "@/lib/error-report";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    reportClient(error, {
      scope: "workspace-error",
      extra: { digest: error.digest ?? null },
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full rounded-xl border border-stroke-1 bg-bg-elevated px-5 py-6">
        <div className="flex items-start gap-3 mb-3">
          <span className="shrink-0 w-9 h-9 rounded-lg bg-amber-500/15 text-amber-300 flex items-center justify-center">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-text-primary font-semibold text-sm leading-tight">
              {t("error.workspaceTitle")}
            </h2>
            <p className="text-text-tertiary text-[12.5px] mt-1 leading-relaxed">
              {t("error.workspaceLead")}
            </p>
          </div>
        </div>
        {error.digest && (
          <p className="text-[11px] text-text-quaternary font-mono mb-4">
            ID: {error.digest}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-overlay hover:bg-bg-overlay/70 text-text-primary text-[12.5px] border border-stroke-1"
          >
            <RefreshCw size={12} />
            {t("error.retry")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="text-[12.5px] text-text-tertiary hover:text-text-primary"
          >
            {t("error.reloadPage")}
          </button>
        </div>
      </div>
    </div>
  );
}
