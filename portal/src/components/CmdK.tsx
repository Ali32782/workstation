"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Building2,
  User,
  TrendingUp,
  Headphones,
  FolderOpen,
  Kanban,
  PenLine,
  X,
  Loader2,
  CornerDownLeft,
} from "lucide-react";

type Hit = {
  type:
    | "company"
    | "person"
    | "deal"
    | "sign"
    | "ticket"
    | "file"
    | "issue";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
};

/**
 * Global Cmd+K (⌘K / Ctrl+K) command palette.
 *
 * Mounts once at the workspace shell level and listens globally for the
 * shortcut. Routes inputs through `/api/search` — see that handler for
 * which sources are wired in. The modal stays mounted at all times to
 * avoid the typical first-keystroke jank; it's only `hidden` when
 * closed.
 *
 * Keyboard model:
 *   ⌘/Ctrl + K  → open
 *   Esc         → close
 *   ↑ / ↓       → move highlight
 *   Enter       → navigate to highlighted hit
 *   Tab/Shift+Tab cycle the highlight, mirroring macOS Spotlight.
 *
 * The search input is debounced to 200ms — the underlying GraphQL +
 * Twenty round-trips usually return in 60-150ms so anything shorter
 * just spams the network without user-visible benefit.
 */
export function CmdK({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global hotkey ⌘/Ctrl+K. We *don't* swallow the shortcut while typing
  // in textareas/inputs — that's the whole point of having a global
  // search; the user can pivot from any field. Esc / Enter handling
  // lives below on the input itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset state on close so re-opening is always pristine.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setHighlight(0);
      return;
    }
    // Defer focus so the input is in the DOM before we touch it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Close palette when the user navigates anywhere — pathnames change
  // on Link clicks too, so this also handles the "result clicked"
  // case without a manual setOpen(false).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const url = new URL("/api/search", window.location.origin);
        url.searchParams.set("ws", workspaceId);
        url.searchParams.set("q", q);
        const r = await fetch(url, { cache: "no-store" });
        if (!alive) return;
        if (!r.ok) {
          setResults([]);
          setHighlight(0);
          return;
        }
        const j = (await r.json()) as { results?: Hit[] };
        const list = Array.isArray(j.results) ? j.results : [];
        setResults(list as Hit[]);
        setHighlight(0);
      } catch {
        if (!alive) return;
        setResults([]);
      } finally {
        if (alive) setBusy(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, open, workspaceId]);

  const onPick = useCallback(
    (hit: Hit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  const groups = useMemo(() => {
    const cos = results.filter((r) => r.type === "company");
    const ps = results.filter((r) => r.type === "person");
    const deals = results.filter((r) => r.type === "deal");
    const signs = results.filter((r) => r.type === "sign");
    const tickets = results.filter((r) => r.type === "ticket");
    const files = results.filter((r) => r.type === "file");
    const issues = results.filter((r) => r.type === "issue");
    return { cos, ps, deals, signs, tickets, files, issues };
  }, [results]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Globale Suche"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.currentTarget === e.target) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl bg-bg-elevated border border-stroke-1 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stroke-1">
          <Search size={16} className="text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Firmen, Personen, Deals, Signatur, Tickets, Files, Plane …"
            className="flex-1 bg-transparent border-0 outline-none text-[14px] text-text-primary placeholder:text-text-tertiary"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) =>
                  Math.min(h + 1, Math.max(0, results.length - 1)),
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const hit = results[highlight];
                if (hit) onPick(hit);
              }
            }}
          />
          {busy && <Loader2 size={14} className="spin text-text-tertiary" />}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded text-text-tertiary hover:text-text-primary"
            title="Schließen (Esc)"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {results.length === 0 && query.trim() && !busy && (
            <div className="px-4 py-6 text-center text-[12px] text-text-tertiary">
              Keine Treffer.
            </div>
          )}
          {!query.trim() && (
            <div className="px-4 py-4 text-[12px] text-text-tertiary">
              <p className="mb-2 font-medium">Tipps:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Firmen, Personen, CRM-Deals, Documenso-Dokumente, Zammad, Nextcloud, Plane</li>
                <li>↑↓ navigieren, ↩ öffnen, Esc schliessen</li>
                <li>⌘/Strg+K öffnet die Suche von überall</li>
              </ul>
            </div>
          )}
          {groups.cos.length > 0 && (
            <Group label="Firmen">
              {groups.cos.map((hit, idx) => {
                const globalIdx = idx; // companies come first in `results`
                return (
                  <Row
                    key={`co-${hit.id}`}
                    hit={hit}
                    icon={<Building2 size={14} className="text-emerald-400" />}
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.ps.length > 0 && (
            <Group label="Personen">
              {groups.ps.map((hit, idx) => {
                const globalIdx = groups.cos.length + idx;
                return (
                  <Row
                    key={`person-${hit.id}`}
                    hit={hit}
                    icon={<User size={14} className="text-sky-400" />}
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.deals.length > 0 && (
            <Group label="Deals">
              {groups.deals.map((hit, idx) => {
                const globalIdx = groups.cos.length + groups.ps.length + idx;
                return (
                  <Row
                    key={`deal-${hit.id}`}
                    hit={hit}
                    icon={
                      <TrendingUp size={14} className="text-teal-400" />
                    }
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.signs.length > 0 && (
            <Group label="Signatur">
              {groups.signs.map((hit, idx) => {
                const globalIdx =
                  groups.cos.length + groups.ps.length + groups.deals.length + idx;
                return (
                  <Row
                    key={`sign-${hit.id}`}
                    hit={hit}
                    icon={<PenLine size={14} className="text-rose-400" />}
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.tickets.length > 0 && (
            <Group label="Helpdesk">
              {groups.tickets.map((hit, idx) => {
                const globalIdx =
                  groups.cos.length +
                  groups.ps.length +
                  groups.deals.length +
                  groups.signs.length +
                  idx;
                return (
                  <Row
                    key={`ticket-${hit.id}`}
                    hit={hit}
                    icon={
                      <Headphones size={14} className="text-violet-400" />
                    }
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.files.length > 0 && (
            <Group label="Dateien">
              {groups.files.map((hit, idx) => {
                const globalIdx =
                  groups.cos.length +
                  groups.ps.length +
                  groups.deals.length +
                  groups.signs.length +
                  groups.tickets.length +
                  idx;
                return (
                  <Row
                    key={`file-${hit.id}`}
                    hit={hit}
                    icon={
                      <FolderOpen size={14} className="text-amber-400" />
                    }
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
          {groups.issues.length > 0 && (
            <Group label="Plane">
              {groups.issues.map((hit, idx) => {
                const globalIdx =
                  groups.cos.length +
                  groups.ps.length +
                  groups.deals.length +
                  groups.signs.length +
                  groups.tickets.length +
                  groups.files.length +
                  idx;
                return (
                  <Row
                    key={`issue-${hit.id}`}
                    hit={hit}
                    icon={<Kanban size={14} className="text-orange-400" />}
                    selected={highlight === globalIdx}
                    onPick={() => onPick(hit)}
                    onHover={() => setHighlight(globalIdx)}
                  />
                );
              })}
            </Group>
          )}
        </div>
        <div className="px-4 py-2 border-t border-stroke-1 text-[10.5px] text-text-quaternary flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-stroke-1 bg-bg-overlay font-mono">
              ↩
            </kbd>
            öffnen
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-stroke-1 bg-bg-overlay font-mono">
              Esc
            </kbd>
            schliessen
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-stroke-1 bg-bg-overlay font-mono">
              ⌘K
            </kbd>
            globale Suche
          </span>
        </div>
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-text-quaternary">
        {label}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({
  hit,
  icon,
  selected,
  onPick,
  onHover,
}: {
  hit: Hit;
  icon: React.ReactNode;
  selected: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onPick}
        className={`w-full text-left flex items-center gap-2 px-4 py-2 ${
          selected ? "bg-bg-overlay" : "hover:bg-bg-overlay/50"
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-text-primary truncate">
            {hit.label}
          </span>
          {hit.sublabel && (
            <span className="block text-[11px] text-text-tertiary truncate">
              {hit.sublabel}
            </span>
          )}
        </span>
        {selected && (
          <CornerDownLeft size={11} className="text-text-tertiary shrink-0" />
        )}
      </button>
    </li>
  );
}
