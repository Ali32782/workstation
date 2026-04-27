import { NextRequest, NextResponse } from "next/server";
import {
  buildHelpdeskPreview,
  type TicketDraft,
  type TicketField,
} from "@/lib/helpdesk/import";
import {
  createTicket,
  loadMeta,
  searchUsers,
  addTicketTag,
  updateTicket,
  getZammadUserIdByEmail,
} from "@/lib/helpdesk/zammad";
import {
  resolveHelpdeskSession,
  type HelpdeskSession,
} from "@/lib/helpdesk/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: HelpdeskSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
  if (r.kind === "unauthenticated") {
    return {
      err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  if (r.kind === "forbidden") {
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  }
  if (r.kind === "not_configured") {
    return {
      err: NextResponse.json(
        { error: r.message, workspace: r.workspace, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  return { session: r.session };
}

type PreviewBody = {
  mode: "preview";
  text: string;
  delimiter?: string;
  mapping?: Record<string, TicketField>;
};

type ExecuteBody = {
  mode: "execute";
  drafts: TicketDraft[];
};

type ImportBody = PreviewBody | ExecuteBody;

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const session = g.session;

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.mode === "preview") {
    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const preview = buildHelpdeskPreview({
      text: body.text,
      delimiter: body.delimiter,
      mapping: body.mapping,
    });
    return NextResponse.json({ preview });
  }

  if (body.mode === "execute") {
    const drafts = (body.drafts ?? []).filter((d) => d.errors.length === 0);

    // Resolve human-readable labels to Zammad numeric IDs once. The CSV likely
    // repeats the same group / priority / state across hundreds of rows so a
    // single Map lookup per row beats hammering Zammad with one search call
    // per ticket.
    const meta = await loadMeta(session.tenant);
    const groupByName = new Map(
      meta.groups.map((g) => [g.name.toLowerCase(), g.id]),
    );
    const priorityByName = new Map(
      meta.priorities.map((p) => [p.name.toLowerCase(), p.id]),
    );
    const stateByName = new Map(meta.states.map((s) => [s.name.toLowerCase(), s.id]));
    const agentByEmail = new Map(
      meta.agents.map((a) => [a.email.toLowerCase(), a.id]),
    );
    const agentByLogin = new Map(
      meta.agents.map((a) => [a.login.toLowerCase(), a.id]),
    );

    const ownerCache = new Map<string, number | null>();
    const resolveOwner = async (label: string | undefined) => {
      if (!label) return null;
      const key = label.trim().toLowerCase();
      if (ownerCache.has(key)) return ownerCache.get(key) ?? null;
      let id: number | null = null;
      if (key.includes("@")) {
        id = agentByEmail.get(key) ?? (await getZammadUserIdByEmail(key));
      } else if (agentByLogin.has(key)) {
        id = agentByLogin.get(key) ?? null;
      } else {
        // Last resort: search.
        try {
          const found = await searchUsers(label, 5);
          id = found[0]?.id ?? null;
        } catch {
          id = null;
        }
      }
      ownerCache.set(key, id);
      return id;
    };

    let created = 0;
    const errors: { rowIndex: number; error: string }[] = [];

    for (const d of drafts) {
      try {
        const groupId = d.group
          ? groupByName.get(d.group.trim().toLowerCase())
          : undefined;
        const priorityId = d.priority
          ? priorityByName.get(d.priority.trim().toLowerCase())
          : undefined;
        const stateId = d.state
          ? stateByName.get(d.state.trim().toLowerCase())
          : undefined;
        const ownerId = await resolveOwner(d.owner);

        const ticket = await createTicket(session.tenant, {
          title: d.title,
          body: d.body || d.title,
          customerEmail: d.customerEmail,
          customerName: d.customerName,
          groupId,
          priorityId,
        });
        if (!ticket) {
          errors.push({ rowIndex: d.rowIndex, error: "create returned null" });
          continue;
        }

        // Apply state + owner via update mutation if needed (createTicket only
        // sets group + priority + customer).
        if (stateId || ownerId) {
          const patch: Parameters<typeof updateTicket>[2] = {};
          if (stateId) patch.state_id = stateId;
          if (ownerId) patch.owner_id = ownerId;
          await updateTicket(session.tenant, ticket.id, patch);
        }

        // Apply tags.
        if (d.tags && d.tags.length > 0) {
          for (const tag of d.tags) {
            try {
              await addTicketTag(session.tenant, ticket.id, tag);
            } catch {
              // tag failures are non-fatal — continue with next tag/ticket
            }
          }
        }
        created++;
      } catch (e) {
        errors.push({
          rowIndex: d.rowIndex,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return NextResponse.json({ created, errors });
  }

  return NextResponse.json({ error: "invalid mode" }, { status: 400 });
}
