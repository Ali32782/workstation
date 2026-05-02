# Kineo Raumplanungs-Assistent — FastAPI + Anthropic + optional Postgres
# Replaces the kineo-raumplanungsassistent.onrender.com Render deployment.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build-essentials only for psycopg's optional native extensions; psycopg[binary]
# in requirements.txt should ship pre-built wheels for linux/amd64 + arm64,
# but we keep gcc around as a belt-and-suspenders fallback. Removed at the end
# of the layer to keep the image small.
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps independently of the source — re-installs only when requirements
# change, not on every code edit.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source (cloned from github.com/Ali32782/Kineo-Raumplanungsassistent).
# StaticFiles mount in main.py serves index.html / demo_*.html / docx straight
# from the working directory, so we copy *everything* (HTML + py + docx).
COPY . ./

EXPOSE 8000

# Render's start command was the same shape — keep parity so behaviour matches.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
