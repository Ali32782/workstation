# Backup and staging

## Production backup (automated)

[`scripts/backup.sh`](../scripts/backup.sh) runs on the host (see `cron/backup.cron`). It:

1. **Logical DB dumps** (consistent):
   - MariaDB (all databases)
   - PostgreSQL: `keycloak-db`, `twenty-db`, `gitea-db` via `pg_dumpall` where applicable
   - **Zammad**: `zammad-postgres` → `zammad-postgres.sql.gz` when the Zammad stack is up (`docker-compose.zammad.yml`)
2. **Rocket.Chat** MongoDB archive (if the container exists)
3. **All Docker named volumes** under `/var/lib/docker/volumes` (includes Zammad’s `zammad_postgres_data`, `zammad_elastic_data`, `zammad_data`, Twenty, Nextcloud, Portal, etc.)

The result is a single tarball uploaded to Hetzner Object Storage (`S3_*` in `.env`). Retention is controlled by `BACKUP_RETENTION_DAYS`.

### Why both volume tar and Zammad `pg_dump`?

- The volume snapshot can catch Postgres files while the DB is running; that is **not** a guaranteed crash-consistent copy of PostgreSQL.
- `zammad-postgres.sql.gz` is a **transaction-consistent** logical backup for ticket data recovery or for replay into a fresh Zammad DB.

Keep both: volumes for whole-machine DR, SQL for safer DB-only restore.

### Restore from S3

[`scripts/restore.sh`](../scripts/restore.sh) downloads an archive, restores volumes, replays DB dumps, and starts the core stack. It also brings up **Zammad** and **Jitsi** when the compose files are present.

**Important:** Full restore is destructive on that host. Test on a **staging** machine first.

---

## Staging environment

Use a **second VPS** (or a dedicated Hetzner snapshot clone) so production traffic and secrets stay isolated.

### Suggested layout

| Item | Production | Staging |
|------|------------|---------|
| Host | CX42 (example) | Smaller CX / dev box |
| `.env` | Prod secrets | **Separate** keys/passwords; own `S3_*` or read-only test bucket |
| DNS | `*.kineo360.work` | e.g. `*.staging.kineo360.work` or `*.dev.kineo360.work` |
| Keycloak | Realms + clients | Import realm JSONs or duplicate realms with staging URLs |
| NPM / TLS | Real certs | Staging Proxy Hosts pointing at staging containers |

### Restoring prod data into staging

1. Pick a backup: `s3://…/corehub-YYYYMMDD-HHMMSS.tar`
2. On the **staging** host, clone the repo to `/opt/corehub` (or your `REPO_DIR`), place a **staging** `.env` (do not copy prod `S3_SECRET_KEY` if you want staging to never delete prod backups).
3. Run `scripts/restore.sh <s3-uri>` **or** only extract what you need (e.g. Twenty + Portal) to limit blast radius.
4. Update **public URLs** everywhere the apps persist them (Zammad `FQDN`, OAuth redirect URIs in Keycloak, Portal `NEXTAUTH_URL`, Twenty webhooks, etc.).
5. Start stacks: `docker compose up -d`, `docker compose -f docker-compose.zammad.yml --env-file .env up -d`, etc.

### Zammad-only SQL replay (optional)

If you need to load **only** the logical Zammad DB (e.g. empty `zammad_postgres_data` volume):

1. Start Postgres: `docker compose -f docker-compose.zammad.yml up -d zammad-postgres`
2. Recreate the database (destroys existing Zammad DB on that volume):

   ```bash
   docker exec -i zammad-postgres psql -U zammad -d postgres -c \
     "DROP DATABASE IF EXISTS zammad_production;"
   docker exec -i zammad-postgres psql -U zammad -d postgres -c \
     "CREATE DATABASE zammad_production OWNER zammad;"
   ```

3. Restore: `zcat zammad-postgres.sql.gz | docker exec -i zammad-postgres psql -U zammad -d zammad_production`
4. Run the rest of the Zammad stack (`zammad-init` / rails) per [Zammad Docker docs](https://docs.zammad.org/en/latest/install/docker-compose.html) if this is a **new** volume (migrations may be required).

Prefer a **full volume restore** from backup for DR drills unless you are deliberately testing SQL-only recovery.

### Portal / Next.js

The portal image is stateless; persistent state is **`portal_data`** (if used) plus **environment variables** in `.env`. After staging restore, redeploy or `docker compose up -d portal` with staging URLs and secrets.

---

## Operational checklist

- [ ] Run `scripts/backup.sh` manually after major changes and confirm a new object appears in the bucket.
- [ ] Quarterly: restore to staging and smoke-test login, Helpdesk, CRM, mail.
- [ ] Ensure `docker-compose.zammad.yml` is **up** on the backup host if you want `zammad-postgres.sql.gz` in every archive (otherwise only volume blobs back Zammad).

---

## Thin wrapper

[`portal/scripts/helpdesk-backup.sh`](../portal/scripts/helpdesk-backup.sh) only prints quick reminders; **production backup is [`scripts/backup.sh`](../scripts/backup.sh)** at the repo root.
