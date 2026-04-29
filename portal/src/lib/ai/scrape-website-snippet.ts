/** Shared helpers for `/api/ai/lead-brief` and `/api/ai/pitch-tailor`. */

const SCRAPE_TIMEOUT_MS = 8_000;
const SCRAPE_MAX_BYTES = 200_000;

async function fetchWebsiteSnippet(url: string): Promise<string | null> {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const r = await fetch(u.toString(), {
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; KineoSales/1.0; +https://kineo360.work)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ctype = r.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ctype)) return null;
    const reader = r.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < SCRAPE_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString(
      "utf8",
    );
    return cleanHtml(html);
  } catch {
    return null;
  }
}

function cleanHtml(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const title = /<title>([^<]+)<\/title>/i.exec(out)?.[1]?.trim() ?? "";
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(
      out,
    )?.[1]?.trim() ?? "";

  out = out
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const head = [
    title ? `Title: ${title}` : "",
    description ? `Description: ${description}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const bodySnippet = out.slice(0, 4_000);
  return [head, bodySnippet].filter(Boolean).join("\n\n");
}

/**
 * Resolve a CRM domain-ish string to trimmed text for LLM grounding.
 */
export async function scrapeWebsiteSnippetForDomain(
  websiteCandidate: string | null | undefined,
): Promise<{ snippet: string | null; normalizedUrl: string | null }> {
  const raw = (websiteCandidate ?? "").trim();
  if (!raw) return { snippet: null, normalizedUrl: null };
  const snippet = await fetchWebsiteSnippet(raw);
  const normalizedUrl = raw.startsWith("http") ? raw : `https://${raw}`;
  return { snippet, normalizedUrl };
}
