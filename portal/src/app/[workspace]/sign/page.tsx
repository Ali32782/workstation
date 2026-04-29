import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { SignClient } from "@/components/sign/SignClient";
import { documensoPublicUrl } from "@/lib/sign/config";
import { userMayOpenDocumensoNativeUi } from "@/lib/sign/documenso-native-ui-access";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: workspaceParam } = await params;
  const sp = (await searchParams) ?? {};
  const crmCompanyRaw = sp.crmCompany;
  const signLinkCompanyId =
    typeof crmCompanyRaw === "string" && /^[0-9a-f-]{36}$/i.test(crmCompanyRaw.trim())
      ? crmCompanyRaw.trim()
      : null;

  const docRaw = sp.doc;
  const openDocumentId =
    typeof docRaw === "string" && /^\d{1,12}$/.test(docRaw.trim())
      ? Number(docRaw.trim())
      : null;
  const openDocumentIdSafe =
    openDocumentId != null && openDocumentId > 0 ? openDocumentId : null;

  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const isAdmin = isAdminUsername(session?.user?.username);
  const documensoNativeUiEnabled = userMayOpenDocumensoNativeUi(
    session?.user?.username,
  );

  return (
    <SignClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      documensoUrl={documensoPublicUrl()}
      isAdmin={isAdmin}
      documensoNativeUiEnabled={documensoNativeUiEnabled}
      signLinkCompanyId={signLinkCompanyId}
      openDocumentId={openDocumentIdSafe}
    />
  );
}
