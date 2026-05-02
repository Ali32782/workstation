"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Triangle,
  XCircle,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

type TenantStatus = {
  workspace: string;
  source: "env" | "runtime" | "missing";
  teamUrl: string | null;
  tokenFingerprint: string | null;
  provisionedAt: string | null;
  provisionedBy: string | null;
};

type TenantsResponse = {
  tenants: TenantStatus[];
  documensoUrl: string;
};

function fmtAbs(iso: string | null, localeFmt: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(localeFmt, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function badgeFor(source: TenantStatus["source"]): {
  label: string;
  cls: string;
  icon: typeof CheckCircle2;
} {
  switch (source) {
    case "env":
      return {
        label: "ENV",
        cls: "bg-info/10 text-info border-info/30",
        icon: Lock,
      };
    case "runtime":
      return {
        label: "UI",
        cls: "bg-success/10 text-success border-success/30",
        icon: CheckCircle2,
      };
    case "missing":
      return {
        label: "FEHLT",
        cls: "bg-warning/10 text-warning border-warning/30",
        icon: Triangle,
      };
  }
}

function workspaceLabel(ws: string): string {
  switch (ws) {
    case "corehub":
      return "Corehub";
    case "medtheris":
      return "MedTheris";
    case "kineo":
      return "Kineo";
    default:
      return ws;
  }
}

export function SignTenantsPanel() {
  const { locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [teamUrlInput, setTeamUrlInput] = useState("");
  const [verify, setVerify] = useState(true);
  const [flash, setFlash] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/sign/tenants", { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${r.status}`);
      }
      const j = (await r.json()) as TenantsResponse;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const beginEdit = useCallback((t: TenantStatus) => {
    setEditing(t.workspace);
    setTokenInput("");
    setTeamUrlInput(t.teamUrl ?? t.workspace);
    setFlash(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setTokenInput("");
    setTeamUrlInput("");
    setFlash(null);
  }, []);

  const submit = useCallback(async () => {
    if (!editing) return;
    if (!tokenInput.trim()) {
      setFlash({ kind: "err", msg: "Token darf nicht leer sein." });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/sign/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: editing,
          apiToken: tokenInput,
          teamUrl: teamUrlInput,
          verify,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          j?.details ? `${j.error}: ${j.details}` : j?.error || `HTTP ${r.status}`,
        );
      }
      setFlash({ kind: "ok", msg: `${workspaceLabel(editing)} gespeichert.` });
      setEditing(null);
      setTokenInput("");
      setTeamUrlInput("");
      await refresh();
    } catch (e) {
      setFlash({
        kind: "err",
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [editing, tokenInput, teamUrlInput, verify, refresh]);

  const onDelete = useCallback(
    async (workspace: string) => {
      if (
        !confirm(
          `Token für ${workspaceLabel(workspace)} aus dem Runtime-Store entfernen?`,
        )
      )
        return;
      setBusyDelete(workspace);
      setFlash(null);
      try {
        const r = await fetch(
          `/api/admin/sign/tenants?workspace=${encodeURIComponent(workspace)}`,
          { method: "DELETE" },
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setFlash({ kind: "ok", msg: `${workspaceLabel(workspace)} entfernt.` });
        await refresh();
      } catch (e) {
        setFlash({
          kind: "err",
          msg: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusyDelete(null);
      }
    },
    [refresh],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-stroke-1 bg-bg-elevated p-4">
        <div className="flex items-start gap-3 mb-3">
          <ShieldCheck size={18} className="text-info mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-text-primary text-sm font-medium mb-1">
              So holst du den Token aus Documenso
            </div>
            <ol className="text-text-tertiary text-[13px] leading-relaxed list-decimal list-inside space-y-0.5">
              <li>
                Documenso öffnen:{" "}
                {data?.documensoUrl ? (
                  <a
                    href={data.documensoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-info hover:underline inline-flex items-center gap-1"
                  >
                    {data.documensoUrl}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="text-text-quaternary">
                    DOCUMENSO_URL nicht gesetzt
                  </span>
                )}
              </li>
              <li>Team auswählen → Settings → API Tokens → „Create Token".</li>
              <li>
                Token (<code className="text-text-secondary">api_…</code>) kopieren
                und unten beim entsprechenden Workspace einfügen.
              </li>
              <li>
                Optional: <span className="text-text-secondary">Team-URL-Slug</span>{" "}
                anpassen, wenn der Slug von workspace-id abweicht (Default:
                workspace-id).
              </li>
            </ol>
          </div>
        </div>
      </div>

      {flash && (
        <div
          className={`rounded-md border p-2.5 text-sm flex items-start gap-2 ${
            flash.kind === "ok"
              ? "border-success/30 bg-success/5 text-success"
              : "border-danger/30 bg-danger/5 text-danger"
          }`}
        >
          {flash.kind === "ok" ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={14} className="mt-0.5 shrink-0" />
          )}
          <span className="leading-relaxed">{flash.msg}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-text-primary text-sm font-semibold">Workspaces</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-50 text-xs transition-colors"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Neu laden
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger flex items-start gap-2">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        {data?.tenants?.map((t) => {
          const badge = badgeFor(t.source);
          const BIcon = badge.icon;
          const isEditing = editing === t.workspace;
          return (
            <div
              key={t.workspace}
              className="rounded-md border border-stroke-1 bg-bg-chrome"
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary text-sm font-medium">
                      {workspaceLabel(t.workspace)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}
                    >
                      <BIcon size={10} />
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-text-tertiary text-[11px] mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {t.teamUrl && (
                      <span>
                        Team-URL:{" "}
                        <code className="text-text-secondary">/t/{t.teamUrl}</code>
                      </span>
                    )}
                    {t.tokenFingerprint && (
                      <span>
                        Token: <code className="text-text-secondary">{t.tokenFingerprint}</code>
                      </span>
                    )}
                    {t.provisionedAt && (
                      <span>
                        seit {fmtAbs(t.provisionedAt, localeFmt)}
                        {t.provisionedBy ? ` · @${t.provisionedBy}` : ""}
                      </span>
                    )}
                    {t.source === "missing" && (
                      <span className="text-warning">
                        Kein Token hinterlegt — Sign meldet „nicht eingerichtet".
                      </span>
                    )}
                    {t.source === "env" && (
                      <span>
                        Quelle:{" "}
                        <code className="text-text-secondary">
                          DOCUMENSO_TEAM_{t.workspace.toUpperCase()}_TOKEN
                        </code>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.source !== "env" && !isEditing && (
                    <button
                      type="button"
                      onClick={() => beginEdit(t)}
                      className="px-2 py-1 rounded-md bg-info/10 hover:bg-info/15 text-info border border-info/20 text-xs"
                    >
                      {t.source === "runtime" ? "Token ersetzen" : "Provisionieren"}
                    </button>
                  )}
                  {t.source === "runtime" && !isEditing && (
                    <button
                      type="button"
                      onClick={() => onDelete(t.workspace)}
                      disabled={busyDelete === t.workspace}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-danger hover:bg-danger/5 disabled:opacity-50"
                      aria-label="Token entfernen"
                    >
                      {busyDelete === t.workspace ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  )}
                  {t.source === "env" && (
                    <span className="text-text-quaternary text-[10px] uppercase tracking-wide">
                      via .env
                    </span>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-stroke-1 bg-bg-base px-3 py-3 space-y-3">
                  <div>
                    <label className="block text-text-secondary text-xs font-medium mb-1">
                      Documenso API Token
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-bg-chrome border border-stroke-1 focus:border-info text-text-primary text-sm font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-xs font-medium mb-1">
                      Team-URL-Slug{" "}
                      <span className="text-text-quaternary font-normal">
                        (z.B. „{t.workspace}")
                      </span>
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={t.workspace}
                      value={teamUrlInput}
                      onChange={(e) => setTeamUrlInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-bg-chrome border border-stroke-1 focus:border-info text-text-primary text-sm font-mono outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-text-secondary text-xs">
                    <input
                      type="checkbox"
                      checked={verify}
                      onChange={(e) => setVerify(e.target.checked)}
                      className="accent-info"
                    />
                    Vor dem Speichern gegen Documenso testen (empfohlen)
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={busy || !tokenInput.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-info text-white hover:bg-info/90 disabled:opacity-50 text-xs font-medium"
                    >
                      {busy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-elevated text-xs disabled:opacity-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && data?.tenants?.length === 0 && (
          <div className="text-text-quaternary text-sm">
            Keine Workspaces gefunden — sollte nicht vorkommen.
          </div>
        )}
      </div>
    </div>
  );
}
