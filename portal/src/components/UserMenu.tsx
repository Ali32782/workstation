"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, RefreshCcw, User, Settings } from "lucide-react";
import { signOutAction } from "@/app/actions";

export function UserMenu({
  name,
  username,
  email,
  avatarText,
  workspaceName,
}: {
  name: string;
  username?: string;
  email?: string;
  avatarText: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 hover:bg-bg-elevated rounded-md px-1.5 py-1 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-bg-overlay text-text-primary flex items-center justify-center text-[11px] font-semibold">
          {avatarText}
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-text-primary text-sm font-semibold">
            {name}
          </span>
          <span className="text-text-tertiary text-xs">
            Admin · {workspaceName}
          </span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-stroke-1 bg-bg-elevated shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-stroke-1">
            <div className="text-text-primary text-sm font-medium">{name}</div>
            {username && (
              <div className="text-text-tertiary text-xs">@{username}</div>
            )}
            {email && (
              <div className="text-text-quaternary text-xs truncate">
                {email}
              </div>
            )}
          </div>
          <div className="py-1">
            <a
              href="https://auth.kineo360.work/realms/main/account/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
            >
              <User size={14} />
              Account verwalten
            </a>
            <a
              href="https://auth.kineo360.work/realms/main/account/#/security/signing-in"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
            >
              <Settings size={14} />
              MFA / Passwort
            </a>
          </div>
          <div className="py-1 border-t border-stroke-1">
            <a
              href="/api/portal/full-logout"
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
              title="Beendet die Sessions in allen Apps (Nextcloud, Chat, Code, Plane …) und meldet dich anschlie\u00dfend ab."
            >
              <RefreshCcw size={14} className="mt-0.5 shrink-0" />
              <span className="flex flex-col leading-tight">
                <span className="text-text-primary">Aus allen Apps abmelden</span>
                <span className="text-text-quaternary text-[11px]">
                  Empfohlen f\u00fcr User-Wechsel oder Test-Szenarien
                </span>
              </span>
            </a>
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-danger hover:bg-bg-overlay transition-colors"
                title="Beendet nur die Portal-Session. App-Sessions (Nextcloud, Chat \u2026) bleiben aktiv."
              >
                <LogOut size={14} />
                Nur Portal-Session beenden
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
