#!/usr/bin/env bash
set -euo pipefail
#
# analyze-bundle.sh
#
# One-shot Next.js bundle analyzer. Installs `@next/bundle-analyzer` if
# missing, builds with ANALYZE=true, opens the resulting HTML reports.
#
# We intentionally do NOT keep the analyzer wired into next.config.ts in
# the regular build path — it doubles the build time and bloats the dev
# image. This script is the pull-it-out-when-you-need-it knob.
#
# Output:
#   portal/.next/analyze/client.html  ← what ships to the browser
#   portal/.next/analyze/edge.html    ← edge runtime (middleware)
#   portal/.next/analyze/nodejs.html  ← server-only routes
#
# Usage (from repo root):
#   bash scripts/analyze-bundle.sh
#
# Then open `portal/.next/analyze/client.html` in your browser. macOS:
#   open portal/.next/analyze/client.html

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL="$ROOT/portal"

cd "$PORTAL"

if [[ ! -f node_modules/.package-lock.json ]] || ! grep -q "@next/bundle-analyzer" package.json 2>/dev/null; then
  echo "==> Installing @next/bundle-analyzer (devDependency)"
  npm install --save-dev @next/bundle-analyzer >/dev/null
fi

# Patch next.config.ts to opt-in via ANALYZE=true. This is idempotent —
# we only inject the wrapper if it isn't there already.
CFG="next.config.ts"
if [[ -f "$CFG" ]] && ! grep -q "@next/bundle-analyzer" "$CFG"; then
  echo "==> Wiring bundle-analyzer into $CFG (idempotent)"
  cp "$CFG" "${CFG}.bak"
  python3 - <<'PY'
import re, pathlib
p = pathlib.Path("next.config.ts")
src = p.read_text()
header = """import bundleAnalyzerImport from "@next/bundle-analyzer";

// next 16 ships an ESM bundle-analyzer; the default export is a factory
// that wraps a NextConfig — opt-in via ANALYZE=true.
const withBundleAnalyzer = bundleAnalyzerImport({
  enabled: process.env.ANALYZE === "true",
});

"""
if "bundleAnalyzerImport" not in src:
    src = header + src
src = re.sub(r"export default ([^;]+);", r"export default withBundleAnalyzer(\1);", src, count=1)
p.write_text(src)
PY
fi

echo "==> Building portal with ANALYZE=true (this takes ~2 min)"
ANALYZE=true npm run build

echo
echo "==> Reports written to:"
ls -lh "$PORTAL/.next/analyze" 2>/dev/null || echo "  (no .next/analyze — analyzer didn't run; check next.config.ts wiring)"
echo
echo "Open in browser:"
echo "  open portal/.next/analyze/client.html"
echo
echo "When done, restore next.config.ts from the .bak if you don't want"
echo "the analyzer wrapper to stay (it's harmless, but pristine is pristine):"
echo "  mv portal/next.config.ts.bak portal/next.config.ts"
