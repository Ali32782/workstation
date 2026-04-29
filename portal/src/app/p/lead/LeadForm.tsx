"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitPublicLeadFromPage } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium py-2.5 px-4 transition-colors"
    >
      {pending ? "Wird gesendet…" : "Absenden"}
    </button>
  );
}

export function LeadForm({ defaultWorkspace }: { defaultWorkspace: string }) {
  const [state, formAction] = useFormState(submitPublicLeadFromPage, undefined);
  const pageUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pageUrlRef.current && typeof window !== "undefined") {
      pageUrlRef.current.value = window.location.href;
    }
  }, []);

  if (state?.ok === true) {
    return (
      <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 text-emerald-100 text-[13px] p-4 text-center">
        Vielen Dank — Ihre Nachricht ist eingegangen.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="workspace" value={defaultWorkspace} />
      <input ref={pageUrlRef} type="hidden" name="pageUrl" value="" />

      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="companyName" className="block text-[11px] font-medium text-slate-400 mb-1">
          Firma / Praxis
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-[11px] font-medium text-slate-400 mb-1">
          Ihr Name
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          placeholder="Vor- und Nachname"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-[11px] font-medium text-slate-400 mb-1">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-[11px] font-medium text-slate-400 mb-1">
          Telefon (optional)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-[11px] font-medium text-slate-400 mb-1">
          Nachricht
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600 resize-y min-h-[100px]"
        />
      </div>

      {state?.ok === false && state.message && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 text-red-200 text-[12px] p-3">
          {state.message}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
