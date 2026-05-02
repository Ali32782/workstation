# Cloud Deployment

Dieses Projekt kann 24/7 auf einem kleinen Linux-Server (VPS) laufen, inkl. automatischem Scrape, Report und Mailversand.

## Option A: VPS + systemd (empfohlen)

### 1) Server vorbereiten

```bash
sudo adduser --disabled-password --gecos "" onedoc
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip sqlite3
```

### 2) Projekt deployen

```bash
sudo mkdir -p /opt/onedoc_scraper
sudo chown -R onedoc:onedoc /opt/onedoc_scraper
sudo -u onedoc git clone <DEIN_REPO_URL> /opt/onedoc_scraper
cd /opt/onedoc_scraper
sudo -u onedoc python3 -m venv .venv
sudo -u onedoc .venv/bin/pip install --upgrade pip
sudo -u onedoc .venv/bin/pip install -r requirements.txt
```

### 3) Secrets setzen

```bash
sudo -u onedoc cp deploy/systemd/.env.example /opt/onedoc_scraper/.env
sudo -u onedoc nano /opt/onedoc_scraper/.env
```

Mindestens:

- `ONEDOC_SMTP_PASS=...`
- `MAIL_TZ=Europe/Zurich`

### 4) Mail-Konfig einmalig erstellen

```bash
cd /opt/onedoc_scraper
sudo -u onedoc .venv/bin/python3 email_report.py --setup
```

### 5) systemd Service aktivieren

```bash
sudo cp deploy/systemd/onedoc-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now onedoc-scheduler
sudo systemctl status onedoc-scheduler
```

Logs:

```bash
journalctl -u onedoc-scheduler -f
```

## Option B: Docker

### Build und Start

```bash
mkdir -p data/models
touch data/slots.db data/email_config.json
```

Danach:

```bash
docker build -t onedoc-scraper:latest .
docker run -d \
  --name onedoc-scraper \
  --restart unless-stopped \
  -e ONEDOC_SMTP_PASS='...' \
  -e MAIL_TZ='Europe/Zurich' \
  -v $(pwd)/data/slots.db:/app/slots.db \
  -v $(pwd)/data/models:/app/models \
  -v $(pwd)/data/email_config.json:/app/email_config.json \
  onedoc-scraper:latest
```

Mail-Konfiguration einmalig anlegen:

```bash
docker exec -it onedoc-scraper python3 email_report.py --setup
```

Hinweis: Die drei Mounts sorgen dafür, dass DB, Modellzustand und Mail-Konfiguration Neustarts überleben.

## Betriebshinweise

- Der Scheduler verschickt Mails in den Stunden `07`, `12`, `18` (in `MAIL_TZ`).
- Bei dauerhaftem Betrieb am besten tägliches Backup von `slots.db` einrichten.
- Für manuellen Testlauf:

```bash
python3 adaptive_scheduler.py --once --no-open
```
