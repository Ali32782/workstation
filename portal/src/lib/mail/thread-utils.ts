/**
 * Client/server-safe helpers to group mailbox rows into conversation threads using
 * Message-ID + In-Reply-To (ImapFlow exposes these on envelope).
 */

export type ThreadAnchor = {
  uid: number;
  folder: string;
  date: string;
  messageId: string | null;
  inReplyTo: string | null;
};

/** Normalise RFC 5322 Message-ID for Map keys (<foo@bar> → foo@bar lowercased). */
export function normMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const s = String(id)
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
  return s || null;
}

export function buildMessageIdIndex<T extends ThreadAnchor>(
  messages: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const m of messages) {
    const mid = normMessageId(m.messageId);
    if (mid) map.set(mid, m);
  }
  return map;
}

/** Walk In-Reply-To chain within the current folder list; fallback to per-message key. */
export function threadRootKey<T extends ThreadAnchor>(
  m: ThreadAnchor,
  byMid: Map<string, T>,
): string {
  const seen = new Set<string>();
  let cur: ThreadAnchor | undefined = m;
  while (cur) {
    const idKey = `${cur.folder}:${cur.uid}`;
    if (seen.has(idKey)) break;
    seen.add(idKey);
    const irt = normMessageId(cur.inReplyTo);
    if (!irt) break;
    const parent = byMid.get(irt);
    if (!parent) break;
    cur = parent;
  }
  return normMessageId(cur?.messageId) ?? `solo:${m.folder}:${m.uid}`;
}

/** Group messages by conversation; each bucket sorted newest-first. Buckets sorted by newest message. */
export function groupAndSortThreads<T extends ThreadAnchor>(
  messages: T[],
): T[][] {
  if (messages.length === 0) return [];
  const byMid = buildMessageIdIndex(messages);
  const buckets = new Map<string, T[]>();
  for (const m of messages) {
    const k = threadRootKey(m, byMid);
    const arr = buckets.get(k) ?? [];
    arr.push(m);
    buckets.set(k, arr);
  }
  for (const arr of buckets.values()) {
    arr.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }
  const out = [...buckets.values()];
  out.sort(
    (a, b) =>
      new Date(b[0]!.date).getTime() - new Date(a[0]!.date).getTime(),
  );
  return out;
}

export function peersInSameThread<T extends ThreadAnchor>(
  active: ThreadAnchor,
  list: T[],
): T[] {
  if (list.length === 0) return [];
  const byMid = buildMessageIdIndex(list);
  const root = threadRootKey(active, byMid);
  return list
    .filter((m) => threadRootKey(m, byMid) === root)
    .filter((m) => !(m.uid === active.uid && m.folder === active.folder))
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
}
