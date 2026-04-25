"use client";

import { ExternalLink } from "lucide-react";

import type { ClientTenant } from "../client-actions";

export function ClientsTable({ tenants }: { tenants: ClientTenant[] }) {
  if (tenants.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-text-tertiary text-sm">
        Noch keine Client-Tenants. Lege oben deinen ersten Client an.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-quaternary text-[10px] uppercase tracking-wider border-b border-stroke-1">
            <th className="text-left font-semibold px-5 py-2.5">Tenant</th>
            <th className="text-left font-semibold px-3 py-2.5">Realm</th>
            <th className="text-left font-semibold px-3 py-2.5">Endpoints</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke-1">
          {tenants.map((t) => (
            <tr key={t.slug} className="hover:bg-bg-elevated/40">
              <td className="px-5 py-3 align-top">
                <div className="text-text-primary font-medium">
                  {t.displayName ?? t.slug}
                </div>
                <div className="text-text-tertiary text-xs font-mono">
                  {t.slug}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <code className="text-text-secondary text-xs font-mono">
                  {t.realm}
                </code>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex flex-col gap-1">
                  <Endpoint label="Files" url={t.filesUrl} />
                  <Endpoint label="Chat" url={t.chatUrl} />
                  <Endpoint label="Admin" url={t.authUrl} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary group"
    >
      <span className="text-text-quaternary w-12 shrink-0">{label}</span>
      <span className="font-mono truncate">{url}</span>
      <ExternalLink size={10} className="opacity-0 group-hover:opacity-100" />
    </a>
  );
}
