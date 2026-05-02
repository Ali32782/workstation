# services/

Source-of-truth for the three Python services that live next to the Next.js
portal on the Hetzner host. Until 2026-05-03 these only existed at
`/opt/corelab/{onedoc_scraper,kineo-dashboard,kineo-bot}/` on the server,
which meant a disk failure would have wiped them. Now they're versioned
here and rsynced *out* to the server, not the other way around.

## Layout

| Subdir            | Service                              | Container         | URL                                     |
| ----------------- | ------------------------------------ | ----------------- | --------------------------------------- |
| `onedoc-scraper/` | OneDoc slot scraper + scheduler      | (systemd, no Docker) | —                                    |
| `kineo-dashboard/`| Streamlit Hyrox-/Kineo-KPI dashboard | `kineo_dashboard` | <https://dashboard.kineo360.work>       |
| `kineo-bot/`      | FastAPI room-planning chat assistant | `kineo_bot`       | <https://bot.kineo360.work>             |

Each subdir has its own README with deploy / sync instructions.

## What is *not* in git

The `.gitignore` excludes anything that is either secret or runtime-generated:

- `.env` / `.env.*` — credentials, tokens, webhooks
- `*.db` / `*.sqlite*` — `slots.db` etc. contains scraped patient-slot data
- `*.log` / `logs/` — the server is the canonical log destination
- `screenshots/` — Playwright debugging snapshots
- `models/` — pickled forecast models (regenerable from CSVs)
- `output/` / `input/` (kineo-dashboard) — Hyrox xlsx exports with billing data
- `__pycache__/` / `*.pyc` — obvious
- `.venv/` — virtualenvs are local

If you add a new secret-bearing file, add it to `.gitignore` *first*, then
commit, then create the file. Do not rely on `git rm --cached` to clean up.

## Sync direction

```
local repo  ──rsync──▶  /opt/corelab/<service>/  (on Hetzner)
                         │
                         └─▶ Docker / systemd picks it up on next restart
```

The reverse direction (server → local) was used once on 2026-05-03 to
import the existing source. After that, edits should only flow local → server.
If you edited something on the server in a hurry, run:

```bash
rsync -azn --delete --exclude=.venv --exclude=__pycache__ \
  --exclude='*.log' --exclude='*.db' --exclude=output --exclude=input \
  --exclude=models --exclude=screenshots --exclude=.env \
  medtheris-corelab:/opt/corelab/<service>/  services/<service>/
```

(`-n` is dry-run — review the diff before dropping it.)
