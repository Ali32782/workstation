"use client";

import { useState, useTransition } from "react";
import { Building2, Check, Copy, Loader2, X } from "lucide-react";

import {
  provisionClient,
  type CreateClientResult,
} from "../client-actions";

export function CreateClientForm() {
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateClientResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function autoSlug(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 31);
  }

  function reset() {
    setSlug("");
    setSlugDirty(false);
    setDisplayName("");
    setAdminEmail("");
    setResult(null);
    setError(null);
  }

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await provisionClient({
          slug: slug.trim().toLowerCase(),
          displayName: displayName.trim(),
          adminEmail: adminEmail.trim(),
        });
        setResult(r);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function copy(s: string, idx: number) {
    navigator.clipboard.writeText(s);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-warning/40 bg-warning/5 p-4">
          <div className="text-text-primary text-sm font-semibold mb-1">
            {result.message}
          </div>
          <div className="text-text-tertiary text-xs">
            Slug: <code className="text-text-primary">{result.slug}</code>
          </div>
        </div>
        <ol className="space-y-2">
          {result.steps.map((step, i) => (
            <li
              key={i}
              className="rounded-md border border-stroke-1 bg-bg-elevated p-3"
            >
              <div className="flex items-start gap-2">
                <span className="text-text-quaternary text-xs font-mono mt-0.5 shrink-0">
                  {i + 1}.
                </span>
                <code className="flex-1 text-text-primary text-xs font-mono whitespace-pre-wrap break-all">
                  {step}
                </code>
                {step.startsWith("ssh") || step.startsWith("cd") ? (
                  <button
                    type="button"
                    onClick={() => copy(step, i)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-bg-base border border-stroke-1 text-text-secondary text-xs hover:text-text-primary"
                  >
                    {copiedIdx === i ? <Check size={11} /> : <Copy size={11} />}
                    {copiedIdx === i ? "Kopiert" : "Copy"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-md bg-text-primary text-bg-base text-sm font-medium hover:opacity-90"
        >
          Weiteren Client anlegen
        </button>
      </div>
    );
  }

  const canSubmit =
    slug.trim().length >= 2 &&
    displayName.trim().length > 0 &&
    adminEmail.trim().length > 0 &&
    !pending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Praxis-Name" required>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!slugDirty) setSlug(autoSlug(e.target.value));
            }}
            placeholder='z.B. "Physio Meier AG"'
            className="input"
          />
        </Field>
        <Field label="Slug" required hint="Wird Teil aller Subdomains.">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugDirty(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="z.B. physiomeier"
              className="input font-mono flex-1"
            />
          </div>
        </Field>
      </div>

      <Field label="Admin-Email" required hint="Empfänger für Welcome-Mail mit Login-Daten.">
        <input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="info@physio-meier.ch"
          className="input"
        />
      </Field>

      {slug && (
        <div className="rounded-md bg-bg-elevated border border-stroke-1 px-3 py-2.5 text-xs space-y-0.5">
          <div className="text-text-quaternary uppercase tracking-wider text-[10px] mb-1">
            Wird angelegt
          </div>
          <Row label="Realm" value={`practice-${slug}`} />
          <Row label="Files" value={`https://files.${slug}.kineo360.work`} />
          <Row label="Chat" value={`https://chat.${slug}.kineo360.work`} />
          <Row label="Auth" value={`https://auth.${slug}.kineo360.work`} />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger flex items-start gap-2">
          <X size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-text-primary text-bg-base text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
          Provisioning starten
        </button>
        <span className="text-text-quaternary text-xs">
          Aktuell zeigt das Tool den manuellen Befehl. Auto-Run via Job-Runner ist Phase 2.
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-text-secondary text-xs font-medium">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && (
        <span className="text-text-quaternary text-[11px]">{hint}</span>
      )}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-text-quaternary w-12 shrink-0">{label}</span>
      <code className="text-text-secondary font-mono break-all">{value}</code>
    </div>
  );
}
