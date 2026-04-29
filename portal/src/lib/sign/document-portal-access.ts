import "server-only";

import { isAdminUsername } from "@/lib/admin-allowlist";
import type { SignTenantConfig } from "@/lib/sign/config";
import { listDocuments as listDocumentsRaw } from "@/lib/sign/documenso";
import type { DocumentSummary, SignStatus, SignTotals } from "@/lib/sign/types";

const MAX_DOCUMENSO_PAGES = 40;
const PAGE_SIZE = 50;

export function canViewDocumentInPortal(args: {
  documentId: number;
  viewerUsername: string;
  privateOwners: Map<number, string>;
  isPortalAdmin: boolean;
}): boolean {
  const owner = args.privateOwners.get(args.documentId);
  if (!owner) return true;
  if (args.isPortalAdmin) return true;
  return owner === args.viewerUsername.toLowerCase();
}

function enrichPrivate(
  d: DocumentSummary,
  privateOwners: Map<number, string>,
): DocumentSummary {
  return {
    ...d,
    portalPrivate: privateOwners.has(d.id),
  };
}

/**
 * Collects visible documents by scanning Documenso list pages (capped), then
 * applies client-style pagination on the filtered array. Suitable for teams
 * with up to roughly `MAX_DOCUMENSO_PAGES * PAGE_SIZE` rows in Documenso.
 */
export async function listDocumentsVisible(
  tenant: SignTenantConfig,
  input: {
    query?: string;
    status?: SignStatus;
    page: number;
    perPage?: number;
  },
  ctx: {
    viewerUsername: string;
    isPortalAdmin: boolean;
    privateOwners: Map<number, string>;
  },
): Promise<{
  items: DocumentSummary[];
  totalPages: number;
  currentPage: number;
  count: number;
}> {
  const perPage = Math.min(100, Math.max(1, input.perPage ?? 50));
  const page = Math.max(1, input.page);
  const allVisible: DocumentSummary[] = [];
  let docPage = 1;

  while (docPage <= MAX_DOCUMENSO_PAGES) {
    const batch = await listDocumentsRaw(tenant, {
      query: input.query,
      status: input.status,
      page: docPage,
      perPage: PAGE_SIZE,
    });
    for (const item of batch.items) {
      if (
        canViewDocumentInPortal({
          documentId: item.id,
          viewerUsername: ctx.viewerUsername,
          privateOwners: ctx.privateOwners,
          isPortalAdmin: ctx.isPortalAdmin,
        })
      ) {
        allVisible.push(
          enrichPrivate(item, ctx.privateOwners),
        );
      }
    }
    if (docPage >= batch.totalPages) break;
    docPage++;
  }

  const count = allVisible.length;
  const totalPages = Math.max(1, Math.ceil(count / perPage));
  const slice = allVisible.slice((page - 1) * perPage, page * perPage);

  return {
    items: slice,
    totalPages,
    currentPage: page,
    count,
  };
}

/** One-shot Documenso query for Cmd+K — keine vollständige Workspace-Scan. */
export async function searchDocumentsForCmdK(
  tenant: SignTenantConfig,
  query: string,
  ctx: {
    viewerUsername: string;
    isPortalAdmin: boolean;
    privateOwners: Map<number, string>;
  },
  limit = 6,
): Promise<DocumentSummary[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const batch = await listDocumentsRaw(tenant, {
    query: q,
    page: 1,
    perPage: Math.min(20, Math.max(limit * 2, 8)),
  });
  const out: DocumentSummary[] = [];
  for (const item of batch.items) {
    if (
      canViewDocumentInPortal({
        documentId: item.id,
        viewerUsername: ctx.viewerUsername,
        privateOwners: ctx.privateOwners,
        isPortalAdmin: ctx.isPortalAdmin,
      })
    ) {
      out.push(enrichPrivate(item, ctx.privateOwners));
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function getTotalsVisible(
  tenant: SignTenantConfig,
  ctx: {
    viewerUsername: string;
    isPortalAdmin: boolean;
    privateOwners: Map<number, string>;
  },
): Promise<SignTotals> {
  const statuses: SignStatus[] = ["DRAFT", "PENDING", "COMPLETED", "REJECTED"];
  const counts = await Promise.all(
    statuses.map((status) =>
      countVisibleForStatus(tenant, status, ctx),
    ),
  );
  return {
    draft: counts[0],
    pending: counts[1],
    completed: counts[2],
    rejected: counts[3],
  };
}

async function countVisibleForStatus(
  tenant: SignTenantConfig,
  status: SignStatus,
  ctx: {
    viewerUsername: string;
    isPortalAdmin: boolean;
    privateOwners: Map<number, string>;
  },
): Promise<number> {
  let n = 0;
  let docPage = 1;
  while (docPage <= MAX_DOCUMENSO_PAGES) {
    const batch = await listDocumentsRaw(tenant, {
      status,
      page: docPage,
      perPage: PAGE_SIZE,
    });
    for (const item of batch.items) {
      if (
        canViewDocumentInPortal({
          documentId: item.id,
          viewerUsername: ctx.viewerUsername,
          privateOwners: ctx.privateOwners,
          isPortalAdmin: ctx.isPortalAdmin,
        })
      )
        n++;
    }
    if (docPage >= batch.totalPages) break;
    docPage++;
  }
  return n;
}

export function sessionIsPortalAdmin(username: string | undefined | null): boolean {
  return isAdminUsername(username);
}
