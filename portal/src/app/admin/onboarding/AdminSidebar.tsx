"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ShieldCheck, ArrowLeft, Radar, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

// 'Clients'-Tab is intentionally hidden — internes Tool, keine externen Tenants.
// Code unter /admin/onboarding/clients/* bleibt für späteren Wiedergebrauch erhalten.
const ITEMS = [
  {
    href: "/admin/onboarding/members",
    label: "Mitglieder",
    description: "Internes Team",
    icon: Users,
  },
  {
    href: "/admin/onboarding/scraper",
    label: "Lead-Scraper",
    description: "MedTheris-Pipeline",
    icon: Radar,
  },
  {
    href: "/admin/onboarding/sign",
    label: "Sign / Documenso",
    description: "Team-Tokens pro Workspace",
    icon: PenLine,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-60 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
      <div className="px-3 py-4 border-b border-stroke-1 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center text-white font-bold text-sm shrink-0 bg-warning/80">
          <ShieldCheck size={18} />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-text-primary text-sm font-semibold truncate">
            Onboarding
          </span>
          <span className="text-text-tertiary text-[11px] truncate">
            Admin · Provisioning
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="mb-3">
          <div className="px-3 pt-2 pb-1.5">
            <span className="text-text-quaternary text-[10px] font-semibold uppercase tracking-wider">
              Verwalten
            </span>
          </div>
          <ul className="flex flex-col gap-px px-1.5">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-colors",
                      isActive
                        ? "bg-bg-elevated text-text-primary"
                        : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
                    )}
                  >
                    <Icon
                      size={16}
                      className="shrink-0 mt-0.5"
                      style={{
                        color: isActive
                          ? "var(--color-warning)"
                          : "var(--color-text-tertiary)",
                      }}
                    />
                    <div className="flex flex-col min-w-0 leading-tight">
                      <span className="text-sm">{item.label}</span>
                      <span className="text-text-quaternary text-[11px]">
                        {item.description}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="border-t border-stroke-1 px-3 py-2.5">
        <Link
          href="/corehub/dashboard"
          className="flex items-center gap-2 text-text-quaternary hover:text-text-tertiary text-[11px] transition-colors"
        >
          <ArrowLeft size={12} />
          Zurück zum Portal
        </Link>
      </div>
    </nav>
  );
}
