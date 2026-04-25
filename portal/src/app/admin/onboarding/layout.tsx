import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { WORKSPACES } from "@/lib/workspaces";
import { TopBar } from "@/components/TopBar";
import { AdminSidebar } from "./AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const username = session.user.username;
  if (!isAdminUsername(username)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-6">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-warning/10 text-warning mb-5">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-text-primary text-xl font-semibold mb-2">
            Kein Admin-Zugriff
          </h1>
          <p className="text-text-tertiary text-sm mb-5">
            Das Onboarding-Tool ist nur für Portal-Admins zugänglich. Dein User{" "}
            <span className="text-text-primary font-mono">@{username}</span> ist
            nicht in der Allowlist.
          </p>
          <Link
            href="/corehub/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-bg-elevated border border-stroke-1 text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            Zurück zum Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <TopBar
        workspace={WORKSPACES.corehub}
        user={{
          name: session.user.name ?? "Unbekannt",
          username: session.user.username,
          email: session.user.email ?? undefined,
        }}
        isAdmin
        groups={session.groups ?? []}
      />
      <div className="flex flex-1 min-h-0">
        <AdminSidebar />
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
