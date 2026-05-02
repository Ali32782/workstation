# kineo-bot

FastAPI room-planning chat assistant ("Kineo Assistent") at
<https://bot.kineo360.work>. Container `kineo_bot`, embedded in the Kineo
workspace sidebar via `NEXT_PUBLIC_KINEO_CHATBOT_URL`. Replaced the
external `kineo-raumplanungsassistent.onrender.com` deployment on
2026-05-02.

## Heads-up — original source

This service was bootstrapped from the private GitHub repo
`Ali32782/Kineo-Raumplanungsassistent`. The copy here is a **mirror**, not
the canonical upstream. If you make changes here, also push them back to
the GitHub repo to keep it in sync. The Render.com deployment that used to
serve this from `kineo-raumplanungsassistent.onrender.com` should be
deleted now that we self-host.

## Layout

| File                  | Role                                                            |
| --------------------- | --------------------------------------------------------------- |
| `main.py`             | FastAPI app — chat endpoint, OneDoc integration, slot lookup.  |
| `slots_server.py`     | Background slot-availability server (used by main.py).          |
| `index.html`          | Single-page chat UI (88 KB, vanilla JS).                       |
| `demo_team.html`      | Internal team-view demo.                                        |
| `demo_patient.html`   | Patient-view demo.                                              |
| `kineo_stellenplanung.docx` | Reference doc embedded in the chat context.              |
| `requirements.txt`    | fastapi + anthropic + python-docx.                             |
| `Dockerfile`          | Python 3.12-slim + uvicorn.                                    |
| `README.md`           | Original developer-facing README from the upstream GitHub repo. |

## Deploy

```bash
rsync -az --delete \
  --exclude=.venv --exclude=__pycache__ --exclude='*.pyc' \
  --exclude=.env --exclude='*.log' \
  services/kineo-bot/ \
  medtheris-corelab:/opt/corelab/kineo-bot/

ssh medtheris-corelab \
  'cd /opt/corelab && docker compose -f docker-compose.kineo-bot.yml build kineo_bot \
    && docker stop kineo_bot && docker rm kineo_bot \
    && docker compose -f docker-compose.kineo-bot.yml up -d kineo_bot'
```

## Required env vars

In `/opt/corelab/.env` on the server (gitignored). The
`docker-compose.kineo-bot.yml` reads them from there:

```
BOT_ANTHROPIC_API_KEY=…    # falls back to SCRAPER_ANTHROPIC_API_KEY
BOT_DATABASE_URL=…         # optional Postgres; defaults to in-memory
BOT_APP_TOKEN=…            # optional Basic-Auth gate
BOT_SLOTS_API_KEY=…        # optional, for OneDoc-side integration
```

## Setup doc

Full container + NPM + CSP setup details live in `docs/kineo-bot-setup.md`
at the repo root.
