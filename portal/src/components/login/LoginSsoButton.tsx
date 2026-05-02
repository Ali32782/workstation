"use client";

import { useT } from "@/components/LocaleProvider";

export function LoginSsoButton() {
  const t = useT();
  return (
    <button
      type="submit"
      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#2860a8] to-[#1e4d8c] hover:from-[#3372be] hover:to-[#205594] active:from-[#1e4d8c] active:to-[#173f73] transition-colors text-white font-medium py-3.5 text-sm shadow-[0_4px_18px_-4px_rgba(30,77,140,0.6)] focus:outline-none focus:ring-2 focus:ring-[#4a7fc1] focus:ring-offset-2 focus:ring-offset-bg-elevated"
    >
      <span className="inline-flex items-center justify-center gap-2.5">
        <ShieldIcon />
        {t("login.cta")}
      </span>
    </button>
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
