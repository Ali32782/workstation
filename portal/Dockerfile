# syntax=docker/dockerfile:1.7

# ─── deps ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* build args — these MUST be at build-time because Next.js
# inlines them into the client bundle. Anything left empty is fine; the
# corresponding sidebar entry just won't render. Kept in sync with
# `docker-compose.yml` (service `portal` → `build.args`) and consumed by
# `portal/src/lib/workspaces.ts` (`kineoEnvApps`, `marketingEnvApps`).
ARG NEXT_PUBLIC_JITSI_BASE_URL=https://meet.kineo360.work
ARG NEXT_PUBLIC_GITEA_URL=https://git.kineo360.work
ARG NEXT_PUBLIC_ZAMMAD_URL=https://support.medtheris.kineo360.work
ARG NEXT_PUBLIC_KINEO_GAP_REPORT_URL=
ARG NEXT_PUBLIC_KINEO_GAP_REPORT_EMBED=
ARG NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL=
ARG NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_EMBED=
ARG NEXT_PUBLIC_KINEO_CHATBOT_URL=
ARG NEXT_PUBLIC_KINEO_CHATBOT_EMBED=
ARG NEXT_PUBLIC_OPENCUT_URL=
ARG NEXT_PUBLIC_POSTIZ_URL=

# Build-time env vars used to satisfy module-load checks; real values come from runtime env.
ENV AUTH_SECRET=build-placeholder \
    KEYCLOAK_ISSUER=https://auth.kineo360.work/realms/main \
    KEYCLOAK_CLIENT_ID=portal \
    KEYCLOAK_CLIENT_SECRET=build-placeholder \
    NEXT_PUBLIC_JITSI_BASE_URL=$NEXT_PUBLIC_JITSI_BASE_URL \
    NEXT_PUBLIC_GITEA_URL=$NEXT_PUBLIC_GITEA_URL \
    NEXT_PUBLIC_ZAMMAD_URL=$NEXT_PUBLIC_ZAMMAD_URL \
    NEXT_PUBLIC_KINEO_GAP_REPORT_URL=$NEXT_PUBLIC_KINEO_GAP_REPORT_URL \
    NEXT_PUBLIC_KINEO_GAP_REPORT_EMBED=$NEXT_PUBLIC_KINEO_GAP_REPORT_EMBED \
    NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL=$NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL \
    NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_EMBED=$NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_EMBED \
    NEXT_PUBLIC_KINEO_CHATBOT_URL=$NEXT_PUBLIC_KINEO_CHATBOT_URL \
    NEXT_PUBLIC_KINEO_CHATBOT_EMBED=$NEXT_PUBLIC_KINEO_CHATBOT_EMBED \
    NEXT_PUBLIC_OPENCUT_URL=$NEXT_PUBLIC_OPENCUT_URL \
    NEXT_PUBLIC_POSTIZ_URL=$NEXT_PUBLIC_POSTIZ_URL
RUN npm run build

# ─── runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# LibreOffice headless for the native Office Hub:
#   • DOCX/XLSX → PDF export
#   • Ingest of legacy .doc/.xls and OpenDocument .odt/.ods
# Plus fonts so headless rendering doesn't fall back to embedded glyphs.
# This adds ~280 MB to the image but is the simplest path to lossless PDF.
RUN apk add --no-cache \
        libreoffice \
        libreoffice-lang-de \
        font-noto \
        font-noto-extra \
        ttf-dejavu \
        ttf-liberation \
        ttf-freefont \
        msttcorefonts-installer \
        fontconfig && \
    update-ms-fonts || true && \
    fc-cache -f

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Persistent runtime data dir (browser-provisioned tenant tokens etc).
# Created here so a fresh `portal_data` named volume inherits the correct
# owner on first mount — Docker copies an empty target dir's permissions
# into a freshly-initialised named volume.
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/login || exit 1

CMD ["node", "server.js"]
