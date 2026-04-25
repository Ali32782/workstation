"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, UserPlus, X, ChevronDown } from "lucide-react";

import { TEAM_LIST, type TeamId } from "@/lib/onboarding-config";
import { createMember, type CreateMemberResult } from "../actions";

export function CreateMemberForm({
  migaduConfigured,
}: {
  migaduConfigured: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [teams, setTeams] = useState<TeamId[]>(["corehub"]);
  const [primaryDomainTeam, setPrimaryDomainTeam] = useState<TeamId>("corehub");
  const [createMailboxes, setCreateMailboxes] = useState(migaduConfigured);
  const [requireResetAndOtp, setRequireResetAndOtp] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateMemberResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function autoUsername(first: string) {
    return first
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 32);
  }

  function toggleTeam(t: TeamId) {
    setTeams((prev) => {
      const next = prev.includes(t)
        ? prev.filter((x) => x !== t)
        : [...prev, t];
      // Keep primaryDomainTeam consistent with the selection.
      if (!next.includes(primaryDomainTeam) && next.length > 0) {
        setPrimaryDomainTeam(next[0]);
      }
      return next;
    });
  }

  function reset() {
    setResult(null);
    setError(null);
    setFirstName("");
    setLastName("");
    setUsername("");
    setUsernameDirty(false);
    setTeams(["corehub"]);
    setPrimaryDomainTeam("corehub");
  }

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await createMember({
          username: username.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          teams,
          primaryDomainTeam,
          createMailboxes: createMailboxes && migaduConfigured,
          requireResetAndOtp,
        });
        setResult(res);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (result) {
    return (
      <ResultPanel result={result} onReset={reset} copied={copied} setCopied={setCopied} />
    );
  }

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    username.trim().length > 0 &&
    teams.length > 0 &&
    !pending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Vorname" required>
          <input
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              if (!usernameDirty) setUsername(autoUsername(e.target.value));
            }}
            placeholder="z.B. Markus"
            className="input"
          />
        </Field>
        <Field label="Nachname" required>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="z.B. Meier"
            className="input"
          />
        </Field>
      </div>

      <Field
        label="Username"
        required
        hint="Kleinschreibung, 2-32 Zeichen, a-z 0-9 . _ - · wird auch der Local-Part der Mail."
      >
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsernameDirty(true);
            setUsername(e.target.value.toLowerCase());
          }}
          placeholder="z.B. markus"
          className="input font-mono"
        />
      </Field>

      <Field
        label="Workspaces"
        required
        hint="Mehrfach-Auswahl möglich. User wird Member der entsprechenden Top-Level-Group im Realm 'main'."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TEAM_LIST.map((team) => {
            const active = teams.includes(team.id);
            const previewEmail = username
              ? `${username}@${team.mailDomain}`
              : `…@${team.mailDomain}`;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => toggleTeam(team.id)}
                className="text-left rounded-md border px-3 py-2.5 transition-colors"
                style={{
                  borderColor: active ? team.accent : "var(--color-stroke-1)",
                  background: active
                    ? `${team.accent}1a`
                    : "var(--color-bg-elevated)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: team.accent }}
                  />
                  <span className="text-text-primary text-sm font-medium">
                    {team.label}
                  </span>
                  {active && (
                    <Check size={13} className="ml-auto" style={{ color: team.accent }} />
                  )}
                </div>
                <div className="text-text-quaternary text-[11px] font-mono truncate">
                  {previewEmail}
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="Primäre Mail-Domain"
        required
        hint="Diese Adresse wird als Profil-Email in Keycloak gesetzt und überall als Standard angezeigt."
      >
        <div className="flex flex-wrap gap-2">
          {TEAM_LIST.filter((t) => teams.includes(t.id)).map((team) => {
            const active = primaryDomainTeam === team.id;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setPrimaryDomainTeam(team.id)}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-mono transition-colors"
                style={{
                  borderColor: active ? team.accent : "var(--color-stroke-1)",
                  background: active
                    ? `${team.accent}1a`
                    : "var(--color-bg-elevated)",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: team.accent }}
                />
                {username || "vorname"}@{team.mailDomain}
                {active && <Check size={12} style={{ color: team.accent }} />}
              </button>
            );
          })}
          {teams.length === 0 && (
            <span className="text-text-quaternary text-xs">
              Wähle erst mindestens einen Workspace.
            </span>
          )}
        </div>
      </Field>

      <details className="rounded-md border border-stroke-1 bg-bg-elevated">
        <summary className="px-3 py-2 cursor-pointer text-text-secondary text-sm flex items-center gap-2">
          <ChevronDown size={14} />
          Erweiterte Optionen
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-2">
          <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={requireResetAndOtp}
              onChange={(e) => setRequireResetAndOtp(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Erstpasswort temporär · User muss bei erstem Login Passwort ändern und TOTP einrichten
              <span className="block text-text-quaternary text-xs">
                Empfohlen. Wenn deaktiviert, ist das Initialpasswort permanent gesetzt.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={createMailboxes}
              disabled={!migaduConfigured}
              onChange={(e) => setCreateMailboxes(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Migadu-Mailbox automatisch anlegen
              <span className="block text-text-quaternary text-xs">
                {migaduConfigured
                  ? "Eine Mailbox pro ausgewählter Workspace-Domain."
                  : "Migadu API-Key fehlt — Option deaktiviert."}
              </span>
            </span>
          </label>
        </div>
      </details>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger flex items-start gap-2">
          <X size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-text-primary text-bg-base text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Mitglied anlegen
        </button>
        <span className="text-text-quaternary text-xs">
          {teams.length} Workspace{teams.length === 1 ? "" : "s"} ·{" "}
          {createMailboxes && migaduConfigured ? "+ Mailboxen" : "ohne Mailbox"}
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

function ResultPanel({
  result,
  onReset,
  copied,
  setCopied,
}: {
  result: CreateMemberResult;
  onReset: () => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const allOk = result.steps.every((s) => s.ok);

  function copyPassword() {
    navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-md border p-4"
        style={{
          borderColor: allOk
            ? "var(--color-success)"
            : "var(--color-warning)",
          background: allOk
            ? "color-mix(in srgb, var(--color-success) 8%, transparent)"
            : "color-mix(in srgb, var(--color-warning) 8%, transparent)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Check
            size={16}
            style={{
              color: allOk ? "var(--color-success)" : "var(--color-warning)",
            }}
          />
          <h3 className="text-text-primary text-base font-semibold">
            {allOk
              ? `@${result.username} angelegt`
              : `@${result.username} angelegt — mit Hinweisen`}
          </h3>
        </div>

        <div className="bg-bg-base rounded-md p-3 mt-3 space-y-2">
          <div>
            <div className="text-text-quaternary text-[11px] uppercase tracking-wider mb-0.5">
              Initial-Passwort (1× kopieren, nicht erneut anzeigbar)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded bg-bg-elevated text-text-primary text-sm font-mono break-all">
                {result.temporaryPassword}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-bg-elevated border border-stroke-1 hover:border-stroke-2 text-text-secondary text-xs transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
          <div>
            <div className="text-text-quaternary text-[11px] uppercase tracking-wider mb-0.5">
              Primäre Mail
            </div>
            <code className="text-text-primary text-sm font-mono">
              {result.primaryEmail}
            </code>
          </div>
          <div>
            <div className="text-text-quaternary text-[11px] uppercase tracking-wider mb-0.5">
              Login-URL
            </div>
            <a
              href={result.loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-primary text-sm hover:underline"
            >
              {result.loginUrl}
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-stroke-1 bg-bg-elevated">
        <div className="px-4 py-2.5 border-b border-stroke-1 text-text-secondary text-xs font-semibold uppercase tracking-wider">
          Schritte
        </div>
        <ul className="divide-y divide-stroke-1">
          {result.steps.map((s, i) => (
            <li
              key={i}
              className="px-4 py-2.5 flex items-start gap-2.5 text-sm"
            >
              {s.ok ? (
                <Check size={14} className="text-success mt-0.5 shrink-0" />
              ) : (
                <X size={14} className="text-danger mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-text-primary font-medium">{s.step}</div>
                <div className="text-text-tertiary text-xs">{s.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 rounded-md bg-text-primary text-bg-base text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Weiteres Mitglied anlegen
        </button>
      </div>
    </div>
  );
}
