FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# System deps for Playwright + Python builds
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget unzip git \
        libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
        libatk-bridge2.0-0 libcups2 libdrm2 libxcb1 libxkbcommon0 \
        libatspi2.0-0 libx11-6 libxcomposite1 libxdamage1 libxext6 \
        libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install chromium --with-deps

COPY . .

# Runner state lives in /var/scraper so it survives container restarts when
# bind-mounted from the host. SQLite cache too.
RUN mkdir -p /var/scraper && chmod 777 /var/scraper
ENV SCRAPER_RUNNER_STATE=/var/scraper/state.json \
    SCRAPER_RUNNER_LOG=/var/scraper/run.log \
    SCRAPER_DB_PATH=/var/scraper/scraper.sqlite

EXPOSE 8088

# Single worker on purpose: only one scraper run at a time. Threads=4 so
# /status calls aren't blocked while a long run is in progress.
CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:8088", \
     "--access-logfile", "-", "--error-logfile", "-", "runner:app"]
