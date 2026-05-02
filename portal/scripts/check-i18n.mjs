#!/usr/bin/env node
/**
 * CI guardrail: catch user-facing formatting locked to German (de-DE).
 *
 * Run from portal/: `npm run check:i18n`
 *
 * Extend forbidden patterns here as you migrate away from other fixed locales
 * (e.g. de-CH) — keep an allowlist for intentional exceptions (spreadsheet engine).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_ROOT = path.join(__dirname, "..");
const SRC = path.join(PORTAL_ROOT, "src");

/** Paths relative to portal/ — skipped entirely */
const IGNORE_FILES = new Set([
  // Dictionary + canonical localeTag()
  "src/lib/i18n/messages.ts",
]);

/** Optional JSON next to this script: { "ignoreFiles": ["src/..."] } */
function loadExtraIgnores() {
  const p = path.join(__dirname, "i18n-check.config.json");
  if (!fs.existsSync(p)) return new Set();
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const list = j.ignoreFiles;
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map(String));
  } catch {
    return new Set();
  }
}

const EXTRA_IGNORE = loadExtraIgnores();

/** Line-level: block these (Intl pinned to a single locale) */
const FORBIDDEN = [
  /toLocaleString\s*\(\s*["']de-DE["']/,
  /toLocaleDateString\s*\(\s*["']de-DE["']/,
  /toLocaleTimeString\s*\(\s*["']de-DE["']/,
  /new\s+Intl\.DateTimeFormat\s*\(\s*["']de-DE["']/,
  /new\s+Intl\.NumberFormat\s*\(\s*["']de-DE["']/,
  /new\s+Intl\.RelativeTimeFormat\s*\(\s*["']de-DE["']/,
  /toLocaleString\s*\(\s*["']en-US["']/,
  /toLocaleDateString\s*\(\s*["']en-US["']/,
  /toLocaleTimeString\s*\(\s*["']en-US["']/,
  /new\s+Intl\.DateTimeFormat\s*\(\s*["']en-US["']/,
  /new\s+Intl\.NumberFormat\s*\(\s*["']en-US["']/,
  /new\s+Intl\.RelativeTimeFormat\s*\(\s*["']en-US["']/,
];

/**
 * Soft warnings — not blocking. Detect calls that fall back to the
 * runtime's default locale (server's locale on the server, browser
 * locale on the client), which causes drift between SSR and CSR. Use
 * `localeTag(locale)` everywhere instead.
 *
 * Only emitted with `--verbose` so the regular CI run stays low-noise.
 */
const WARN_NO_LOCALE = [
  /\.toLocaleString\s*\(\s*\)/,
  /\.toLocaleDateString\s*\(\s*\)/,
  /\.toLocaleTimeString\s*\(\s*\)/,
];

function shouldIgnoreFile(relPosix) {
  if (IGNORE_FILES.has(relPosix)) return true;
  if (EXTRA_IGNORE.has(relPosix)) return true;
  return false;
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = ent.name;
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(m?[jt]sx?)$/.test(name)) acc.push(full);
  }
  return acc;
}

function stripTrailingComment(line) {
  const i = line.indexOf("//");
  return i === -1 ? line : line.slice(0, i);
}

/**
 * Honour `// i18n-check-disable-next-line` and
 * `// i18n-check-disable` (single line). These are for legitimate cases
 * where a fixed locale is correct (e.g. parsing a wire format that's
 * always en-US, or pulling a non-localized GMT-offset label).
 */
const DISABLE_NEXT = /\/\/\s*i18n-check-disable-next-line/;
const DISABLE_LINE = /\/\/\s*i18n-check-disable\b/;

function main() {
  const verbose = process.argv.includes("--verbose");
  const extraIgnore = EXTRA_IGNORE;
  if (extraIgnore.size && verbose) {
    console.warn(
      `[check-i18n] Using ${extraIgnore.size} extra ignore(s) from scripts/i18n-check.config.json`,
    );
  }

  const files = walk(SRC);
  let errors = 0;
  let warnings = 0;

  for (const abs of files) {
    const rel = path.relative(PORTAL_ROOT, abs).split(path.sep).join("/");
    if (shouldIgnoreFile(rel)) continue;

    const raw = fs.readFileSync(abs, "utf8");
    const lines = raw.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const prev = lines[idx - 1] ?? "";
      if (DISABLE_NEXT.test(prev) || DISABLE_LINE.test(line)) return;
      const scan = stripTrailingComment(line);
      for (const re of FORBIDDEN) {
        if (re.test(scan)) {
          console.error(
            `${rel}:${idx + 1}: hardcoded locale in Intl — use localeTag(locale) from @/lib/i18n/messages`,
          );
          errors += 1;
        }
      }
      if (verbose) {
        for (const re of WARN_NO_LOCALE) {
          if (re.test(scan)) {
            console.warn(
              `${rel}:${idx + 1}: toLocale*() without locale arg leaks runtime default — pass localeTag(locale)`,
            );
            warnings += 1;
          }
        }
      }
    });
  }

  if (errors > 0) {
    console.error(`\n[check-i18n] ${errors} issue(s). Fix or add a rare exception to scripts/i18n-check.config.json (ignoreFiles).`);
    process.exit(1);
  }
  const tail = verbose && warnings > 0 ? ` — ${warnings} soft warning(s)` : "";
  console.log(`[check-i18n] OK (no hardcoded Intl locales outside policy)${tail}`);
}

main();
