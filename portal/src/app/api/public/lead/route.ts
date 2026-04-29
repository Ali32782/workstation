import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PublicLeadInput } from "@/lib/crm/public-lead";
import { submitPublicLead } from "@/lib/crm/public-lead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function allowedOriginList(): string[] {
  return (process.env.LEAD_FORM_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};

  const same = new URL(req.url).origin;
  const list = allowedOriginList();
  const ok = origin === same || list.includes(origin);
  if (!ok) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function verifyLeadFormSecret(
  authHeader: string | null,
  bodyToken: unknown,
): boolean {
  const expected = process.env.PUBLIC_LEAD_FORM_SECRET?.trim();
  if (!expected) return false;

  let provided: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    provided = authHeader.slice(7).trim();
  } else if (typeof bodyToken === "string" && bodyToken.trim()) {
    provided = bodyToken.trim();
  }
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function OPTIONS(req: NextRequest) {
  const h = corsHeaders(req);
  return new NextResponse(null, { status: 204, headers: h });
}

export async function POST(req: NextRequest) {
  const h = corsHeaders(req);

  const configured = Boolean(process.env.PUBLIC_LEAD_FORM_SECRET?.trim());
  if (!configured) {
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 503, headers: h },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: h });
  }

  if (!verifyLeadFormSecret(req.headers.get("authorization"), body.token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: h });
  }

  const input: PublicLeadInput = {
    workspace: typeof body.workspace === "string" ? body.workspace : undefined,
    companyName: typeof body.companyName === "string" ? body.companyName : "",
    firstName: typeof body.firstName === "string" ? body.firstName : "",
    lastName: typeof body.lastName === "string" ? body.lastName : "",
    email: typeof body.email === "string" ? body.email : "",
    phone: typeof body.phone === "string" ? body.phone : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    website: typeof body.website === "string" ? body.website : undefined,
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : undefined,
    attribution:
      body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
        ? (body.attribution as PublicLeadInput["attribution"])
        : undefined,
  };

  const result = await submitPublicLead(input);
  if (!result.ok) {
    const msg =
      result.code === "validation"
        ? "validation_error"
        : result.code === "workspace_required"
          ? "workspace_required"
          : result.code === "crm_not_configured"
            ? "crm_not_configured"
            : result.code === "rejected"
              ? "validation_error"
              : "upstream_error";

    return NextResponse.json({ error: msg, code: result.code }, { status: result.status, headers: h });
  }

  return NextResponse.json(
    {
      ok: true,
      companyId: result.companyId,
      personId: result.personId,
      opportunityId: result.opportunityId,
    },
    { headers: h },
  );
}
