"use client";

import { useState, useTransition } from "react";
import {
  KeyRound,
  Loader2,
  PowerOff,
  Power,
  Trash2,
  X,
  Check,
  Copy,
} from "lucide-react";

import { TEAMS, type TeamId } from "@/lib/onboarding-config";
import {
  deleteMember,
  resetMemberPassword,
  setMemberEnabled,
  type MemberRow,
  type CreateMemberStep,
} from "../actions";

export function MembersTable({ members }: { members: MemberRow[] }) {
  if (members.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-text-tertiary text-sm">
        Noch keine Mitglieder. Lege oben dein erstes Mitglied an.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-quaternary text-[10px] uppercase tracking-wider border-b border-stroke-1">
            <th className="text-left font-semibold px-5 py-2.5">Mitglied</th>
            <th className="text-left font-semibold px-3 py-2.5">Workspaces</th>
            <th className="text-left font-semibold px-3 py-2.5">Status</th>
            <th className="text-right font-semibold px-5 py-2.5">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke-1">
          {members.map((m) => (
            <MemberRowItem key={m.username} member={m} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRowItem({ member }: { member: MemberRow }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    title: string;
    steps: CreateMemberStep[];
    tempPassword?: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");

  function toggleEnabled() {
    startTransition(async () => {
      try {
        const res = await setMemberEnabled({
          username: member.username,
          enable: !member.enabled,
        });
        setFeedback({
          title: `@${res.username} ${member.enabled ? "deaktiviert" : "aktiviert"}`,
          steps: res.steps,
        });
      } catch (e) {
        setFeedback({
          title: "Fehler",
          steps: [{ step: "Aktion", ok: false, detail: (e as Error).message }],
        });
      }
    });
  }

  function resetPw() {
    startTransition(async () => {
      try {
        const res = await resetMemberPassword({ username: member.username });
        setFeedback({
          title: `Passwort für @${res.username} zurückgesetzt`,
          steps: res.steps,
          tempPassword: res.temporaryPassword,
        });
      } catch (e) {
        setFeedback({
          title: "Fehler",
          steps: [{ step: "Aktion", ok: false, detail: (e as Error).message }],
        });
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      try {
        const res = await deleteMember({
          username: member.username,
          alsoDeleteMailboxes: true,
        });
        setFeedback({
          title: `@${res.username} gelöscht`,
          steps: res.steps,
        });
        setConfirmDelete(false);
      } catch (e) {
        setFeedback({
          title: "Fehler",
          steps: [{ step: "Aktion", ok: false, detail: (e as Error).message }],
        });
      }
    });
  }

  function copyPw() {
    if (!feedback?.tempPassword) return;
    navigator.clipboard.writeText(feedback.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <tr className="hover:bg-bg-elevated/40 transition-colors">
        <td className="px-5 py-3 align-top">
          <div className="text-text-primary font-medium">
            {fullName || member.username}
          </div>
          <div className="text-text-tertiary text-xs font-mono">
            @{member.username}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-col gap-1">
            {member.teams.length === 0 && (
              <span className="text-text-quaternary text-xs italic">
                keine Group-Membership
              </span>
            )}
            {member.teams.map((t) => (
              <TeamBadge
                key={t.team}
                teamId={t.team}
                email={t.mailbox.email}
                mailboxExists={t.mailbox.exists}
              />
            ))}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          {member.enabled ? (
            <span className="inline-flex items-center gap-1.5 text-success text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Aktiv
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-text-quaternary text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-text-quaternary" />
              Deaktiviert
            </span>
          )}
        </td>
        <td className="px-5 py-3 align-top">
          <div className="flex items-center justify-end gap-1">
            <IconBtn
              title="Passwort zurücksetzen"
              onClick={resetPw}
              disabled={pending}
            >
              <KeyRound size={13} />
            </IconBtn>
            <IconBtn
              title={member.enabled ? "Deaktivieren" : "Aktivieren"}
              onClick={toggleEnabled}
              disabled={pending}
            >
              {member.enabled ? <PowerOff size={13} /> : <Power size={13} />}
            </IconBtn>
            <IconBtn
              title="Löschen"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              danger
            >
              <Trash2 size={13} />
            </IconBtn>
          </div>
        </td>
      </tr>

      {(feedback || confirmDelete) && (
        <tr>
          <td colSpan={4} className="px-5 pb-4">
            {confirmDelete && !feedback && (
              <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">
                <div className="text-danger font-medium mb-1">
                  @{member.username} wirklich löschen?
                </div>
                <div className="text-text-tertiary text-xs mb-2.5">
                  Löscht Keycloak-User im Realm <code>main</code> + Migadu-Mailboxen
                  unter allen zugeordneten Workspace-Domains. Kann nicht rückgängig
                  gemacht werden.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={doDelete}
                    disabled={pending}
                    className="px-3 py-1.5 rounded text-xs bg-danger text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    {pending && <Loader2 size={11} className="animate-spin" />}
                    Endgültig löschen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={pending}
                    className="px-3 py-1.5 rounded text-xs bg-bg-elevated border border-stroke-1 text-text-secondary hover:text-text-primary"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <div className="rounded-md border border-stroke-1 bg-bg-elevated p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-text-primary font-medium">
                    {feedback.title}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="text-text-quaternary hover:text-text-secondary"
                  >
                    <X size={14} />
                  </button>
                </div>
                {feedback.tempPassword && (
                  <div className="bg-bg-base rounded p-2.5 mb-2.5">
                    <div className="text-text-quaternary text-[10px] uppercase tracking-wider mb-0.5">
                      Neues Initial-Passwort
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 rounded bg-bg-elevated text-text-primary text-xs font-mono break-all">
                        {feedback.tempPassword}
                      </code>
                      <button
                        type="button"
                        onClick={copyPw}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-bg-elevated border border-stroke-1 text-text-secondary text-xs"
                      >
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                        {copied ? "Kopiert" : "Kopieren"}
                      </button>
                    </div>
                  </div>
                )}
                <ul className="space-y-1">
                  {feedback.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      {s.ok ? (
                        <Check size={11} className="text-success mt-0.5 shrink-0" />
                      ) : (
                        <X size={11} className="text-danger mt-0.5 shrink-0" />
                      )}
                      <span className="text-text-secondary">
                        <span className="text-text-primary">{s.step}:</span>{" "}
                        {s.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TeamBadge({
  teamId,
  email,
  mailboxExists,
}: {
  teamId: TeamId;
  email: string;
  mailboxExists: boolean | "unknown";
}) {
  const team = TEAMS[teamId];
  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: team.accent }}
      />
      <span className="text-text-secondary">{team.label}</span>
      <span className="text-text-quaternary font-mono">· {email}</span>
      <span
        className="inline-flex items-center gap-0.5"
        title={
          mailboxExists === true
            ? "Mailbox existiert in Migadu"
            : mailboxExists === false
              ? "Keine Migadu-Mailbox gefunden"
              : "Migadu-Status unbekannt"
        }
      >
        {mailboxExists === true && (
          <Check size={10} className="text-success" />
        )}
        {mailboxExists === false && (
          <X size={10} className="text-warning" />
        )}
        {mailboxExists === "unknown" && (
          <span className="text-text-quaternary text-[10px]">?</span>
        )}
      </span>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded border border-stroke-1 bg-bg-elevated text-text-tertiary hover:text-text-primary hover:border-stroke-2 transition-colors disabled:opacity-40 ${
        danger ? "hover:text-danger hover:border-danger/40" : ""
      }`}
    >
      {children}
    </button>
  );
}
