import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-allowlist";
import {
  configuredSignTenants,
  documensoPublicUrl,
  knownSignWorkspaces,
} from "@/lib/sign/config";
import { getTotals } from "@/lib/sign/documenso";
import {
  deleteRuntimeTenant,
  isValidWorkspaceId,
  listRuntimeTenants,
  upsertRuntimeTenant,
  type SignTenantRecord,
} from "@/lib/sign/runtime-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TenantStatus = {
  workspace: string;
  source: "env" | "runtime" | "missing";
  teamUrl: string | null;
  /** Last 4 chars of the active token, never the token itself. */
  tokenFingerprint: string | null;
  provisionedAt: string | null;
  provisionedBy: string | null;
};

function fingerprint(token: string): string {
  if (!token) return "";
  const tail = token.slice(-4);
  return `…${tail}`;
}

async function buildStatuses(): Promise<TenantStatus[]> {
  const fromEnv = new Set(configuredSignTenants());
  const fromRuntime = await listRuntimeTenants();
  const all = new Set<string>([...knownSignWorkspaces(), ...fromEnv, ...Object.keys(fromRuntime)]);
  const out: TenantStatus[] = [];
  for (const ws of all) {
    if (fromEnv.has(ws)) {
      const tokenEnv = process.env[`DOCUMENSO_TEAM_${ws.toUpperCase()}_TOKEN`] ?? "";
      out.push({
        workspace: ws,
        source: "env",
        teamUrl: process.env[`DOCUMENSO_TEAM_${ws.toUpperCase()}_URL`] ?? null,
        tokenFingerprint: tokenEnv ? fingerprint(tokenEnv) : null,
        provisionedAt: null,
        provisionedBy: null,
      });
      continue;
    }
    const rec = fromRuntime[ws as keyof typeof fromRuntime] as
      | SignTenantRecord
      | undefined;
    if (rec) {
      out.push({
        workspace: ws,
        source: "runtime",
        teamUrl: rec.teamUrl,
        tokenFingerprint: fingerprint(rec.apiToken),
        provisionedAt: rec.provisionedAt,
        provisionedBy: rec.provisionedBy,
      });
      continue;
    }
    out.push({
      workspace: ws,
      source: "missing",
      teamUrl: null,
      tokenFingerprint: null,
      provisionedAt: null,
      provisionedBy: null,
    });
  }
  out.sort((a, b) => a.workspace.localeCompare(b.workspace));
  return out;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const statuses = await buildStatuses();
  return NextResponse.json({
    tenants: statuses,
    documensoUrl: documensoPublicUrl(),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const body = (await req.json().catch(() => null)) as
    | {
        workspace?: string;
        apiToken?: string;
        teamUrl?: string | null;
        verify?: boolean;
      }
    | null;
  if (!body?.workspace || !body?.apiToken) {
    return NextResponse.json(
      { error: "workspace und apiToken sind erforderlich" },
      { status: 400 },
    );
  }
  if (!isValidWorkspaceId(body.workspace)) {
    return NextResponse.json(
      {
        error: `Unbekannter Workspace: ${body.workspace}. Erlaubt: ${knownSignWorkspaces().join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (process.env[`DOCUMENSO_TEAM_${body.workspace.toUpperCase()}_TOKEN`]) {
    return NextResponse.json(
      {
        error:
          "Workspace ist bereits per Environment konfiguriert. Entferne den DOCUMENSO_TEAM_<X>_TOKEN aus der .env, um eine UI-Provisionierung zu erlauben.",
      },
      { status: 409 },
    );
  }
  const apiToken = body.apiToken.trim();
  const teamUrl = body.teamUrl ? body.teamUrl.trim() || null : null;

  // Optional connectivity check before persisting. Default ON so we don't
  // silently store dead tokens that turn into useless 401s later.
  const verify = body.verify !== false;
  if (verify) {
    try {
      await getTotals({
        apiToken,
        teamUrl,
        teamId: null,
        source: "runtime",
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            "Documenso lehnt diesen Token ab. Prüfe Token + Team-URL in den Documenso-Team-Settings.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 },
      );
    }
  }

  const record = await upsertRuntimeTenant(body.workspace, {
    apiToken,
    teamUrl,
    provisionedBy: guard.username,
  });
  return NextResponse.json({
    ok: true,
    workspace: body.workspace,
    record: {
      teamUrl: record.teamUrl,
      provisionedAt: record.provisionedAt,
      provisionedBy: record.provisionedBy,
      tokenFingerprint: fingerprint(record.apiToken),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const ws = req.nextUrl.searchParams.get("workspace");
  if (!ws || !isValidWorkspaceId(ws)) {
    return NextResponse.json(
      { error: "workspace param fehlt oder unbekannt" },
      { status: 400 },
    );
  }
  if (process.env[`DOCUMENSO_TEAM_${ws.toUpperCase()}_TOKEN`]) {
    return NextResponse.json(
      {
        error:
          "Workspace ist per Environment gesetzt — bitte direkt in der .env entfernen.",
      },
      { status: 409 },
    );
  }
  const removed = await deleteRuntimeTenant(ws);
  return NextResponse.json({ ok: true, removed });
}
