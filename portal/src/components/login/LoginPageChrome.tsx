"use client";

import Image from "next/image";
import { useT } from "@/components/LocaleProvider";

export function LoginPageChrome({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: string;
}) {
  const t = useT();

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
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
            {t("login.brandBar")}
          </span>
        </div>
        <span className="text-text-quaternary text-xs uppercase tracking-[0.18em]">
          {t("login.internalBadge")}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center gap-7 text-center">
            <Image
              src="/branding/corehub-mark.svg"
              alt=""
              width={140}
              height={140}
              priority
              className="drop-shadow-[0_8px_32px_rgba(30,77,140,0.45)]"
            />
            <div className="flex flex-col items-center gap-3">
              <h1 className="text-text-primary text-4xl sm:text-5xl font-semibold tracking-tight">
                {t("login.heading")}
              </h1>
              <p className="text-text-tertiary text-base max-w-md leading-relaxed">
                {t("login.subtitle")}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <WorkspacePill color="#1e4d8c" label="Corehub" />
              <WorkspacePill color="#059669" label="MedTheris" />
              <WorkspacePill color="#7c3aed" label="Kineo" />
            </div>
          </div>

          <div className="mt-12 mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-stroke-1 bg-bg-elevated/90 backdrop-blur-md p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
              <div className="flex flex-col gap-2">
                <h2 className="text-text-primary text-xl font-semibold">
                  {t("login.cardTitle")}
                </h2>
                <p className="text-text-tertiary text-sm">{t("login.help")}</p>
              </div>

              {error && (
                <div className="mt-5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger text-sm">
                  {t("login.errorPrefix")} {error}
                </div>
              )}

              <div className="mt-6">{children}</div>

              <div className="mt-6 flex items-center gap-3 text-text-quaternary text-[11px] uppercase tracking-wider">
                <span className="h-px flex-1 bg-stroke-1" />
                <span>{t("login.divider")}</span>
                <span className="h-px flex-1 bg-stroke-1" />
              </div>

              <p className="mt-6 text-text-tertiary text-xs text-center">
                {t("login.problems")}{" "}
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
