import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listCompanies,
  listPeople,
  listAllOpportunities,
} from "@/lib/crm/twenty";
import { resolveCrmSession } from "@/lib/crm/session";
import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import { listTickets } from "@/lib/helpdesk/zammad";
import { searchFiles } from "@/lib/cloud/webdav";
import { resolveProjectsSession } from "@/lib/projects/session";
import { searchIssuesShallow } from "@/lib/projects/plane";
import { resolveSignSession } from "@/lib/sign/session";
import {
  searchDocumentsForCmdK,
} from "@/lib/sign/document-portal-access";
import { getPortalPrivateOwners } from "@/lib/sign/document-privacy-store";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { listContacts } from "@/lib/marketing/mautic";
import { readRecentIntegrationEvents } from "@/lib/integrations/event-feed-store";
import {
  integrationHitMatchesQuery,
  toIntegrationCmdKHit,
} from "@/lib/integrations/event-feed-cmdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/search?ws=…&q=…
 *
 * Cross-app search for Cmd+K: CRM companies/people/deals, eSign documents
 * (Documenso), Mautic contacts (Marketing), Helpdesk tickets, Nextcloud
 * filenames, Plane issues (shallow), plus recent integration webhook events
 * (empty query = latest only; with query = substring match prepended).
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  type Hit = {
    type:
      | "company"
      | "person"
      | "deal"
      | "sign"
      | "marketing"
      | "ticket"
      | "file"
      | "issue"
      | "integration";
    id: string;
    label: string;
    sublabel?: string;
    href: string;
  };

  function signStatusDe(
    s: "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED",
  ): string {
    switch (s) {
      case "DRAFT":
        return "Entwurf";
      case "PENDING":
        return "In Signatur";
      case "COMPLETED":
        return "Erledigt";
      case "REJECTED":
        return "Abgelehnt";
    }
  }

  const crm = await resolveCrmSession(ws);
  if (crm.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (crm.kind === "forbidden") {
    return NextResponse.json({ error: crm.message }, { status: 403 });
  }

  const palette: Hit[] = [];
  const workspaceId =
    crm.kind === "ok" ? crm.session.workspace : (ws ?? "").toLowerCase() || "kineo";
  const sessionAuth = await auth();

  /** Latest webhook/integration activity for Cmd+K (same workspace). */
  async function integrationPaletteMatches(): Promise<Hit[]> {
    try {
      const recent = await readRecentIntegrationEvents(workspaceId, q ? 48 : 18);
      const hits = recent.map((e) => toIntegrationCmdKHit(workspaceId, e));
      if (!q) return hits as Hit[];
      return hits.filter((h) => integrationHitMatchesQuery(h, q)).slice(0, 8) as Hit[];
    } catch {
      return [];
    }
  }

  if (!q) {
    const feedOnly = await integrationPaletteMatches();
    return NextResponse.json({ results: feedOnly });
  }

  const feedHits = await integrationPaletteMatches();

  if (crm.kind === "ok") {
    const tenant = crm.session.tenant;
    const [companies, people, deals] = await Promise.all([
      listCompanies(tenant, { search: q, limit: 8 }).catch(() => ({
        items: [],
        nextCursor: null as string | null,
      })),
      listPeople(tenant, { search: q, limit: 8 }).catch(() => ({
        items: [],
        nextCursor: null as string | null,
      })),
      listAllOpportunities(tenant, { search: q, first: 8 }).catch(() => []),
    ]);

    for (const c of companies.items) {
      palette.push({
        type: "company",
        id: c.id,
        label: c.name || "(ohne Name)",
        sublabel:
          [c.city, c.country].filter(Boolean).join(", ") ||
          c.domain ||
          c.generalEmail ||
          "",
        href: `/${workspaceId}/crm?company=${c.id}`,
      });
    }
    for (const p of people.items) {
      const name =
        `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "(ohne Name)";
      palette.push({
        type: "person",
        id: p.id,
        label: name,
        sublabel: [p.email, p.companyName].filter(Boolean).join(" · "),
        href: `/${workspaceId}/crm?person=${p.id}`,
      });
    }
    for (const o of deals) {
      palette.push({
        type: "deal",
        id: o.id,
        label: o.name?.trim() || "(ohne Namen)",
        sublabel: [o.stage, o.companyName].filter(Boolean).join(" · "),
        href: o.companyId
          ? `/${workspaceId}/crm?company=${o.companyId}&deal=${o.id}`
          : `/${workspaceId}/crm/pipeline?deal=${o.id}`,
      });
    }
  }

  const sg = await resolveSignSession(ws);
  if (sg.kind === "ok" && q.length >= 2) {
    try {
      const privateOwners = await getPortalPrivateOwners(sg.session.workspace);
      const docs = await searchDocumentsForCmdK(
        sg.session.tenant,
        q,
        {
          viewerUsername: sg.session.username,
          isPortalAdmin: isAdminUsername(sessionAuth?.user?.username),
          privateOwners,
        },
        6,
      );
      for (const d of docs) {
        palette.push({
          type: "sign",
          id: String(d.id),
          label: d.title?.trim() || "(ohne Titel)",
          sublabel: signStatusDe(d.status),
          href: `/${workspaceId}/sign?doc=${d.id}`,
        });
      }
    } catch {
      /* optional */
    }
  }

  const mk = await resolveMarketingSession(ws);
  if (mk.kind === "ok" && q.length >= 2) {
    try {
      const { contacts } = await listContacts({ search: q, limit: 6, start: 0 });
      for (const c of contacts) {
        const name =
          `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() ||
          c.email ||
          `Kontakt #${c.id}`;
        const qEnc = encodeURIComponent(q);
        palette.push({
          type: "marketing",
          id: `mc-${c.id}`,
          label: name,
          sublabel: [c.email, c.company, c.segments?.[0]]
            .filter(Boolean)
            .join(" · "),
          href: `/${workspaceId}/marketing?section=contacts&q=${qEnc}&contact=${c.id}`,
        });
      }
    } catch {
      /* optional */
    }
  }

  const hd = await resolveHelpdeskSession(ws);
  if (hd.kind === "ok") {
    try {
      const tickets = await listTickets(hd.session.tenant, {
        query: q,
        state: "all",
        perPage: 6,
      });
      for (const t of tickets.slice(0, 6)) {
        palette.push({
          type: "ticket",
          id: String(t.id),
          label: `#${t.number}: ${t.title}`,
          sublabel: [t.stateName, t.groupName].filter(Boolean).join(" · "),
          href: `/${workspaceId}/helpdesk?ticket=${t.id}`,
        });
      }
    } catch {
      /* optional */
    }
  }

  const uname = sessionAuth?.user?.username;
  if (uname && q.length >= 2) {
    try {
      const fileHits = await searchFiles({
        workspace: ((ws ?? "corehub") as string).toLowerCase(),
        user: uname,
        query: q,
        limit: 8,
        accessToken: sessionAuth?.accessToken,
      });
      for (const f of fileHits.slice(0, 8)) {
        const qSeg = (f.name.length >= 2 ? f.name : q).slice(0, 200);
        palette.push({
          type: "file",
          id: `file:${f.path}`,
          label: f.name,
          sublabel: f.type === "folder" ? `Ordner · ${f.path}` : f.path,
          href: `/${workspaceId}/files?q=${encodeURIComponent(qSeg)}`,
        });
      }
    } catch {
      /* optional */
    }
  }

  const pj = await resolveProjectsSession(ws);
  if (pj.kind === "ok") {
    try {
      const iss = await searchIssuesShallow(pj.session.workspaceSlug, q, {
        maxHits: 6,
        maxProjects: 8,
      });
      for (const row of iss) {
        const label = `${row.projectIdentifier}-${row.issue.sequenceId}: ${row.issue.name}`;
        palette.push({
          type: "issue",
          id: row.issue.id,
          label,
          sublabel: row.projectName,
          href: `/${workspaceId}/projects?project=${encodeURIComponent(row.projectId)}&issue=${encodeURIComponent(row.issue.id)}`,
        });
      }
    } catch {
      /* optional */
    }
  }

  return NextResponse.json({ results: [...feedHits, ...palette] });
}
