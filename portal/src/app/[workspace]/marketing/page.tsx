import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { MarketingClient } from "@/components/marketing/MarketingClient";
import { mauticPublicUrl } from "@/lib/marketing/mautic";

const MARKETING_SECTIONS = new Set([
  "overview",
  "contacts",
  "segments",
  "campaigns",
  "emails",
]);

export default async function MarketingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: workspaceParam } = await params;
  const sp = (await searchParams) ?? {};
  const cRaw = sp.contact;
  const initialContactId =
    typeof cRaw === "string" && /^\d{1,12}$/.test(cRaw.trim())
      ? cRaw.trim()
      : undefined;
  const secRaw = sp.section;
  let initialSection:
    | "overview"
    | "contacts"
    | "segments"
    | "campaigns"
    | "emails"
    | undefined =
    typeof secRaw === "string" && MARKETING_SECTIONS.has(secRaw)
      ? (secRaw as "overview" | "contacts" | "segments" | "campaigns" | "emails")
      : undefined;
  if (!initialSection && initialContactId) initialSection = "contacts";
  const qRaw = sp.q;
  const initialQuery = typeof qRaw === "string" ? qRaw : undefined;

  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  return (
    <MarketingClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      mauticUrl={mauticPublicUrl()}
      initialSection={initialSection}
      initialQuery={initialQuery}
      initialContactId={initialContactId}
    />
  );
}
