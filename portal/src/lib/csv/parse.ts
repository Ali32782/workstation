/**
 * Shared CSV parser used by every CSV-import flow in the portal
 * (Projects → Plane, CRM → Twenty, Helpdesk → Zammad, ...).
 *
 * RFC4180-flavoured: quoted fields, embedded delimiters, doubled quotes
 * (`""` → `"`), CRLF-tolerant. Custom delimiter, defaulting to `,`.
 *
 * Why server-side?
 *   - Most external exports (Jira, HubSpot, Pipedrive, Zendesk) ship UTF-8 with
 *     BOM, occasional German `;`-delimited variants, embedded HTML and 5–10 MB
 *     of payload. Doing it once on the server keeps the client bundle slim and
 *     lets the importer stream progress.
 */

export function parseCsv(text: string, delimiter = ","): string[][] {
  // Strip UTF-8 BOM that breaks the very first header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cur);
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

/** Auto-detect comma vs. semicolon vs. tab delimiter on the first non-empty line. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const head = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = {
    ",": (head.match(/,/g) ?? []).length,
    ";": (head.match(/;/g) ?? []).length,
    "\t": (head.match(/\t/g) ?? []).length,
  };
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

/**
 * Build a header-index lookup (lowercased + trimmed) so callers can resolve
 * row values by canonical field after `mapHeaders`.
 */
export function indexHeaders(header: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((h, i) => {
    out[h.trim().toLowerCase()] = i;
  });
  return out;
}
