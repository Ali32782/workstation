import { Info } from "lucide-react";

import { SignTenantsPanel } from "./SignTenantsPanel";

export const dynamic = "force-dynamic";

export default function SignTenantsPage() {
  const documensoUrl =
    process.env.DOCUMENSO_URL ?? "https://sign.kineo360.work";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold mb-1">
          Sign / Documenso
        </h1>
        <p className="text-text-tertiary text-sm">
          Pro Workspace ein eigenes Documenso-Team — der Portal-Sign-Bereich
          authentifiziert sich mit einem team-scoped API-Token. Bisher musste
          dieser Token in der Server-<code>.env</code> hinterlegt werden; ab
          jetzt können Admins den Token direkt hier hinterlegen, ohne
          Container-Neustart oder SSH.
        </p>
      </div>

      <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm flex items-start gap-2 text-info">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div className="text-text-secondary leading-relaxed">
          <span className="text-info font-medium">Reihenfolge:</span> ENV-Variable{" "}
          <code className="text-text-primary">DOCUMENSO_TEAM_&lt;X&gt;_TOKEN</code>{" "}
          gewinnt, anschließend kommt der hier hinterlegte Token zum Zug. So
          überschreiben Host-Admins notfalls jede UI-Konfiguration. Die hier
          eingegebenen Tokens werden in einem persistenten Volume
          (<code className="text-text-primary">/data/sign-tenants.json</code>)
          gespeichert und überleben Container-Rebuilds.
        </div>
      </div>

      <SignTenantsPanel />

      <div className="text-text-quaternary text-xs leading-relaxed">
        Documenso-Instanz:{" "}
        <a
          href={documensoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-info hover:underline"
        >
          {documensoUrl}
        </a>
      </div>
    </div>
  );
}
