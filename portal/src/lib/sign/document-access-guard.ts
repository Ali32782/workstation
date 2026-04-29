import "server-only";

import { NextResponse } from "next/server";

import { getPortalPrivateOwners } from "@/lib/sign/document-privacy-store";
import {
  canViewDocumentInPortal,
  sessionIsPortalAdmin,
} from "@/lib/sign/document-portal-access";

/**
 * Returns a 404 response if the viewer may not access this document in the
 * portal (e.g. another user's private upload). Use 404 to avoid leaking ids.
 */
export async function blockIfSignDocumentInaccessible(
  workspace: string,
  documentId: number,
  viewerUsername: string,
): Promise<NextResponse | null> {
  const privateOwners = await getPortalPrivateOwners(workspace);
  if (
    canViewDocumentInPortal({
      documentId,
      viewerUsername,
      privateOwners,
      isPortalAdmin: sessionIsPortalAdmin(viewerUsername),
    })
  ) {
    return null;
  }
  return NextResponse.json(
    { error: "Dokument nicht gefunden oder keine Berechtigung." },
    { status: 404 },
  );
}
