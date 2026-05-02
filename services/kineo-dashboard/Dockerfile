# Kineo Operations Dashboard — Streamlit upload UI for Hyrox/SportsNow exports
# Source: /opt/corelab/kineo-dashboard/ (synced from local Mac via git/rsync).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

# pdfplumber needs libssl + libffi at runtime (built wheel pulls them in some
# arches), curl is for the healthcheck. Keep the layer small.
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source — input/ and output/ are bind-mounted at runtime so the existing
# Hyrox/SportsNow exports survive container rebuilds.
COPY . ./

EXPOSE 8501

# Streamlit iframe-friendly flags:
#   --server.enableCORS=false           allows cross-origin embedding
#   --server.enableXsrfProtection=false avoids 403 on POSTs from /api/v1
#   --server.headless=true              don't try to open a browser
# baseUrlPath is empty (root) — NPM forwards / verbatim.
CMD ["streamlit", "run", "app.py", \
     "--server.address=0.0.0.0", \
     "--server.port=8501", \
     "--server.headless=true", \
     "--server.enableCORS=false", \
     "--server.enableXsrfProtection=false", \
     "--browser.gatherUsageStats=false"]
