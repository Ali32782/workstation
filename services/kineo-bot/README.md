# Kineo Stellenplan-Assistent

AI-Chat für den Kineo-Stellenplan. Key bleibt serverseitig sicher.

## Struktur

```
kineo-app/
├── backend/
│   ├── main.py          ← FastAPI Server
│   └── requirements.txt
└── frontend/
    └── index.html       ← Chat-UI
```

## Setup (lokal)

### 1. Python-Umgebung
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. API-Key setzen
```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # Mac/Linux
set ANTHROPIC_API_KEY=sk-ant-...        # Windows
```

### 3. Server starten
```bash
uvicorn main:app --reload --port 8000
```

Dann im Browser: http://localhost:8000

---

## Deployment (Render.com – kostenlos)

1. Konto auf https://render.com erstellen
2. Neuen **Web Service** anlegen → GitHub-Repo verbinden
3. Einstellungen:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **Environment Variable** hinzufügen:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...`
5. Deploy → fertig. Render gibt dir eine URL wie `https://kineo-app.onrender.com`

---

## Deployment (Railway.app)

1. https://railway.app → New Project → Deploy from GitHub
2. Environment Variable: `ANTHROPIC_API_KEY=sk-ant-...`
3. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Fertig in ~2 Minuten.

---

## Mehrere Nutzer / Passwortschutz

Für einfachen Passwortschutz kannst du in `main.py` eine Bearer-Token-Prüfung hinzufügen:

```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, Security

security = HTTPBearer()
APP_TOKEN = os.environ.get("APP_TOKEN", "")

def verify(cred: HTTPAuthorizationCredentials = Security(security)):
    if cred.credentials != APP_TOKEN:
        raise HTTPException(401, "Ungültiges Token")

@app.post("/api/chat", dependencies=[Depends(verify)])
async def chat(req: ChatRequest):
    ...
```

Dann setze `APP_TOKEN=dein-passwort` als Umgebungsvariable und sende
den Token im Frontend mit `headers: { Authorization: 'Bearer dein-passwort' }`.
