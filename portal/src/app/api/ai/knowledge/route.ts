import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  parseUsernameList,
  userHasWorkspaceAccess,
} from "@/lib/access-helpers";
import {
  EMPTY_KNOWLEDGE_FIELDS,
  readKnowledge,
  writeKnowledge,
  type WorkspaceKnowledge,
} from "@/lib/ai/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_USERS = parseUsernameList(
  process.env.PORTAL_ADMIN_USERNAMES,
  "ali,johannes",
);

async function gate(
  req: NextRequest,
): Promise<
  | { ok: true; workspace: string; username: string; isAdmin: boolean }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  const ws = req.nextUrl.searchParams.get("ws")?.toLowerCase() ?? "";
  if (!ws) {
    return {
      ok: false,
      res: NextResponse.json({ error: "ws required" }, { status: 400 }),
    };
  }
  const username = (session.user.username ?? "").toLowerCase();
  const isAdmin = ADMIN_USERS.includes(username);
  const groups = (session.groups ?? []) as string[];
  if (!userHasWorkspaceAccess(ws, groups, isAdmin)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `kein Zugriff auf Workspace "${ws}"` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, workspace: ws, username, isAdmin };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return g.res;
  const k = await readKnowledge(g.workspace);
  return NextResponse.json({ knowledge: k });
}

type PutBody = Partial<
  Omit<WorkspaceKnowledge, "workspace" | "updatedAt" | "updatedBy">
>;

export async function PUT(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return g.res;
  // Any workspace member may edit company knowledge — it's curated content,
  // not a credential. Restrict if needed via a second env list later.
  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body fehlt." }, { status: 400 });
  }
  const patch: PutBody = {};
  for (const key of Object.keys(EMPTY_KNOWLEDGE_FIELDS) as Array<
    keyof typeof EMPTY_KNOWLEDGE_FIELDS
  >) {
    const v = body[key];
    if (typeof v === "string") {
      // Soft cap at 16k chars per section so a misclick doesn't blow
      // the prompt budget. The form pre-flights this client-side too.
      patch[key] = v.slice(0, 16_000);
    }
  }
  try {
    const next = await writeKnowledge(g.workspace, patch, g.username || "—");
    return NextResponse.json({ knowledge: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
