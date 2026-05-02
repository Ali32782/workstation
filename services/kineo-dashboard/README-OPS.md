# kineo-dashboard

Streamlit-based KPI dashboard for Kineo: Hyrox / SportsNow exports →
auto-generated `output/Kineo_Dashboard_AKTUELL.xlsx` → live KPI tiles +
8 detail tabs at <https://dashboard.kineo360.work>. Container
`kineo_dashboard`, NPM Basic-Auth via Access-List "Kineo Dashboard".

## Layout

| File                         | Role                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `app.py`                     | Streamlit entrypoint. Renders KPIs + 8 sheet tabs. Sidebar gear holds the file-upload form + "Dashboard neu generieren" button. |
| `streamlit_upload.py`        | Legacy upload-only entrypoint. Kept for reference, no longer the container CMD. |
| `update_dashboard.py`        | The actual dashboard builder — reads everything in `input/`, writes `output/Kineo_Dashboard_AKTUELL.xlsx`. Invoked from `app.py` via subprocess. |
| `patch_dashboard.py`         | One-off legacy fixer (deprecated, not invoked by app.py).  |
| `probelauf.py`               | Smoke test for the xlsx generator.                         |
| `Dockerfile`                 | Python 3.12-slim + streamlit + pdfplumber + iframe-friendly flags. |
| `Dashboard_Aktualisieren.command` / `Kineo_Upload.command` | macOS Finder shortcuts for local users — not used in the container deploy. |
| `run.sh`                     | Local dev launcher.                                        |

## Deploy

```bash
rsync -az --delete \
  --exclude=.venv --exclude=__pycache__ --exclude='*.pyc' \
  --exclude='*.log' --exclude=output --exclude=input \
  services/kineo-dashboard/ \
  medtheris-corelab:/opt/corelab/kineo-dashboard/

ssh medtheris-corelab \
  'cd /opt/corelab && docker compose -f docker-compose.kineo-dashboard.yml build kineo_dashboard \
    && docker stop kineo_dashboard && docker rm kineo_dashboard \
    && docker compose -f docker-compose.kineo-dashboard.yml up -d kineo_dashboard'
```

The container has `input/` and `output/` bind-mounted from
`/opt/corelab/kineo-dashboard/{input,output}/` so xlsx history survives
rebuilds. Both directories are gitignored — they contain billing-grade
customer data.

## Streamlit iframe gotchas

The Dockerfile sets:

```
--server.enableCORS=false
--server.enableXsrfProtection=false
```

…because NPM forwards `https://dashboard.kineo360.work` → `http://kineo_dashboard:8501`
and Streamlit's default XSRF check rejects POSTs (file uploads) from a
non-matching origin. The compensating control is the NPM Basic-Auth gate
plus a `frame-ancestors app.kineo360.work` CSP header so only the portal
iframe can embed the dashboard.

## Setup doc

Container/NPM/CSP details live in `docs/kineo-dashboard-setup.md` at the
repo root.
