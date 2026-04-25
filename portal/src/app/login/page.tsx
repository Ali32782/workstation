import { signIn } from "@/lib/auth";
import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg-base text-text-primary">
      {/* Ambient gradient mesh */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 600px at 18% 22%, rgba(30,77,140,0.22), transparent 60%)," +
            "radial-gradient(800px 500px at 82% 78%, rgba(124,58,237,0.16), transparent 65%)," +
            "radial-gradient(700px 500px at 50% 100%, rgba(5,150,105,0.12), transparent 70%)",
        }}
      />
      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top brand bar */}
        <header className="flex items-center justify-between px-8 py-6">
          <div className="flex items-center gap-3">
            <Image
              src="/branding/corehub-mark.svg"
              alt=""
              width={32}
              height={32}
              priority
            />
            <span className="text-text-secondary text-sm tracking-wide">
              Corehub <span className="text-text-quaternary">·</span> Workstation
            </span>
          </div>
          <span className="text-text-quaternary text-xs uppercase tracking-[0.18em]">
            Internal
          </span>
        </header>

        {/* Centered hero + login */}
        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-2xl">
            {/* Hero */}
            <div className="flex flex-col items-center gap-7 text-center">
              <Image
                src="/branding/corehub-mark.svg"
                alt="Corehub Logo"
                width={140}
                height={140}
                priority
                className="drop-shadow-[0_8px_32px_rgba(30,77,140,0.45)]"
              />
              <div className="flex flex-col items-center gap-3">
                <h1 className="text-text-primary text-4xl sm:text-5xl font-semibold tracking-tight">
                  Corehub Workstation
                </h1>
                <p className="text-text-tertiary text-base max-w-md leading-relaxed">
                  Eine Anmeldung. Alle Tools. Ein Arbeitsplatz für{" "}
                  <span className="text-text-secondary">Corehub</span>,{" "}
                  <span className="text-text-secondary">MedTheris</span> und{" "}
                  <span className="text-text-secondary">Kineo</span>.
                </p>
              </div>

              {/* Workspace pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <WorkspacePill color="#1e4d8c" label="Corehub" />
                <WorkspacePill color="#059669" label="MedTheris" />
                <WorkspacePill color="#7c3aed" label="Kineo" />
              </div>
            </div>

            {/* Login card */}
            <div className="mt-12 mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-stroke-1 bg-bg-elevated/90 backdrop-blur-md p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
                <div className="flex flex-col gap-2">
                  <h2 className="text-text-primary text-xl font-semibold">
                    Anmelden
                  </h2>
                  <p className="text-text-tertiary text-sm">
                    Über deinen Kineo360 SSO Account.
                  </p>
                </div>

                {error && (
                  <div className="mt-5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-sm">
                    Login fehlgeschlagen: {error}
                  </div>
                )}

                <form
                  action={async () => {
                    "use server";
                    await signIn("keycloak", {
                      redirectTo: callbackUrl || "/corehub/dashboard",
                    });
                  }}
                  className="mt-6"
                >
                  <button
                    type="submit"
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#2860a8] to-[#1e4d8c] hover:from-[#3372be] hover:to-[#205594] active:from-[#1e4d8c] active:to-[#173f73] transition-colors text-white font-medium py-3.5 text-sm shadow-[0_4px_18px_-4px_rgba(30,77,140,0.6)] focus:outline-none focus:ring-2 focus:ring-[#4a7fc1] focus:ring-offset-2 focus:ring-offset-bg-elevated"
                  >
                    <span className="inline-flex items-center justify-center gap-2.5">
                      <ShieldIcon />
                      Mit Kineo360 SSO anmelden
                    </span>
                  </button>
                </form>

                <div className="mt-6 flex items-center gap-3 text-text-quaternary text-[11px] uppercase tracking-wider">
                  <span className="h-px flex-1 bg-stroke-1" />
                  <span>Sicher via Keycloak</span>
                  <span className="h-px flex-1 bg-stroke-1" />
                </div>

                <p className="mt-6 text-text-tertiary text-xs text-center">
                  Probleme beim Login? Schreib an{" "}
                  <a
                    href="mailto:johannes@corehub.kineo360.work"
                    className="text-text-secondary hover:text-text-primary underline underline-offset-2 decoration-stroke-2"
                  >
                    johannes@corehub.kineo360.work
                  </a>
                </p>
              </div>

              <p className="mt-5 text-center text-text-quaternary text-[11px] tracking-wide">
                © {new Date().getFullYear()} Corehub Technologies LLC ·
                kineo360.work
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function WorkspacePill({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-stroke-1 bg-bg-elevated/60 px-3 py-1.5 text-xs text-text-secondary"
      style={{ borderColor: `${color}33` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}88` }}
      />
      {label}
    </span>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
