# Integration Event Feed (Webhook → JSONL → Pulse / Rocket.Chat)

Minimal vertical slice: **one HTTPS endpoint** accepts Documenso lifecycle webhooks or a **normalized JSON** payload, maps to `IntegrationEventEnvelope`, appends **JSONL** under the portal data volume, optionally posts to **Rocket.Chat**, and surfaces the latest hit on the **Pulse** grid.

## Endpoint

`POST https://app.kineo360.work/api/integrations/event-feed/webhook`

| Body shape | Auth |
|------------|------|
| Documenso native (`event`: `DOCUMENT_COMPLETED`, …, `payload`: document) | Header **`X-Documenso-Secret`** must equal env **`DOCUMENSO_WEBHOOK_SECRET`** |
| Normalized `{ "workspaceId", "eventType", "payload"? }` | **`Authorization: Bearer …`** or query **`?token=`** using **`INTEGRATION_FEED_WEBHOOK_SECRET`** |

Responses: `200 { ok: true, id }`, `401 Unauthorized`, `400` invalid JSON/body, `503` if required secret missing.

Documenso docs: [Webhook verification](https://docs.documenso.com/docs/developers/webhooks/verification) (`X-Documenso-Secret`).

## Environment (`portal` container)

| Variable | Purpose |
|----------|---------|
| `DOCUMENSO_WEBHOOK_SECRET` | Required for Documenso-shaped bodies |
| `INTEGRATION_FEED_WEBHOOK_SECRET` | Required for normalized JSON |
| `INTEGRATION_FEED_DEFAULT_WORKSPACE` | Workspace slug stored on Documenso events (default `corehub`) |
| `INTEGRATION_FEED_ROCKETCHAT_CHANNEL` | Optional `#channel` — uses `ROCKETCHAT_ADMIN_USER_ID` + `ROCKETCHAT_ADMIN_TOKEN` |

Events are stored under **`${PORTAL_DATA_DIR:-/data}/integration-events/`** (daily JSONL files).

## Normalized example (Zammad-style smoke test)

```bash
curl -sS -X POST "https://app.kineo360.work/api/integrations/event-feed/webhook" \
  -H "Authorization: Bearer $INTEGRATION_FEED_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"medtheris","eventType":"helpdesk.ticket.created","payload":{"ticketId":"4711","title":"VPN"}}'
```

## Code map

- Route: `portal/src/app/api/integrations/event-feed/webhook/route.ts`
- Store: `portal/src/lib/integrations/event-feed-store.ts`
- Documenso mapper: `portal/src/lib/integrations/normalize-documenso-webhook.ts`
- RC notify: `portal/src/lib/integrations/rc-notify.ts` + `postAdminRoomMessage` in `portal/src/lib/chat/rocketchat.ts`
- Pulse: `portal/src/lib/pulse/integration-feed.ts`

See also `docs/cross-hub-roadmap.md` Phase 1.

---

## Documenso einrichten (einmalig — braucht Documenso-Admin)

Das kann nur jemand mit Zugang zur Documenso-Instanz (`DOCUMENSO_URL`, z. B. `sign.kineo360.work`) erledigen; das Repo kann die UI nicht für dich öffnen.

1. **Secret erzeugen** (ein gemeinsames Geheimnis für Documenso **und** Portal):
   ```bash
   openssl rand -hex 32
   ```
2. In **`/opt/corelab/.env`** (oder wo dein Compose die Variablen hernimmt) setzen:
   - `DOCUMENSO_WEBHOOK_SECRET=<dieselbe Zeichenkette>`
   - Optional: `INTEGRATION_FEED_DEFAULT_WORKSPACE=medtheris` (oder `kineo` / `corehub`), je nachdem unter welchem Portal-Workspace Documenso-Events im Pulse erscheinen sollen.
3. **Portal neu deployen** (`docker compose up -d portal`), damit die Env im Container ankommt.
4. In **Documenso** unter den Webhook-/Developer-Einstellungen:
   - **URL:** `https://app.kineo360.work/api/integrations/event-feed/webhook`
   - **Secret:** exakt derselbe Wert wie `DOCUMENSO_WEBHOOK_SECRET` (Documenso sendet ihn als Header **`X-Documenso-Secret`**).
   - **Events:** mindestens **`DOCUMENT_COMPLETED`** (weitere `DOCUMENT_*` werden ebenfalls akzeptiert und normalisiert).
5. **Smoke-Test** vom Laptop oder Server:
   ```bash
   CORELAB_ENV=/pfad/zur/.env bash scripts/test-integration-feed-webhook.sh
   ```
   Erwartung: HTTP **200** mit `{"ok":true,"id":"…"}`. Danach im Portal-Dashboard die Pulse-Kachel **„Integration“** prüfen.

Siehe auch [Webhook verification](https://docs.documenso.com/docs/developers/webhooks/verification).
