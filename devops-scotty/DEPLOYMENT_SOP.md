# DEPLOYMENT_SOP.md — PDF Parser Comparison App
*Scotty 🛠️ — DevOps / Chief Engineer*

---

## Architecture

| Service  | Stack      | Port | Notes                              |
|----------|------------|------|------------------------------------|
| api      | FastAPI    | 8000 | PDF parsing (pdfplumber, unstructured, docling) |
| web      | Next.js 14 | 3000 | Upload UI + comparison viewer      |

**Hardware:** Mac Mini M4 (arm64). Docker target: `linux/arm64` only.

---

## Quick Start (Native / No Docker)

> **Prerequisite:** Python 3.11+ via Homebrew, Node.js 18+

### 1. Backend

```bash
cd pdf-parser-app/api

# Create venv (one-time)
/opt/homebrew/opt/python@3.11/bin/python3.11 -m venv venv
source venv/bin/activate

# Install PyTorch CPU (arm64) first
pip install torch==2.3.0 torchvision==0.18.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install all requirements
pip install -r requirements.txt

# Start
ALLOWED_ORIGINS=http://localhost:3000 uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check: `curl http://localhost:8000/api/health` → `{"status":"ok"}`

### 2. Frontend

```bash
cd pdf-parser-app/web

npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
NEXT_PUBLIC_API_URL=http://localhost:8000 PORT=3000 npm start
```

### 3. Public Tunnel (Cloudflared)

```bash
cloudflared tunnel --url http://localhost:3000
# Note the trycloudflare.com URL in the output
```

---

## Docker Compose (Optional)

> ⚠️ **Warning:** First `docker build` downloads docling ML models — expect **15–30 minutes**.

```bash
cd pdf-parser-app
docker compose up --build
```

Uses `linux/arm64` platform. Both `ALLOWED_ORIGINS` and `NEXT_PUBLIC_API_URL` are pre-configured in `docker-compose.yml`.

---

## Environment Variables

| Variable              | Default                  | Description                         |
|-----------------------|--------------------------|-------------------------------------|
| `ALLOWED_ORIGINS`     | `http://localhost:3000`  | Comma-separated CORS origins for API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000`  | API base URL baked into Next.js build |

---

## Troubleshooting

### CORS errors in browser
- Ensure `ALLOWED_ORIGINS` includes the frontend URL (including protocol + port).
- If using a Cloudflare tunnel for the frontend, add the tunnel URL to `ALLOWED_ORIGINS`.

### Port already in use
```bash
lsof -i :8000   # find and kill api
lsof -i :3000   # find and kill web
```

### docling slow first request
- Models download on first use (~1-2 GB). Subsequent requests are fast.
- In Docker, models are pre-baked into the image via the Dockerfile RUN step.

### Next.js "output: standalone" warning
- `next start` works for dev. For production standalone, use: `node .next/standalone/server.js`

---

## Sessions (when running natively)

| Session ID   | Service   | Command                                        |
|--------------|-----------|------------------------------------------------|
| rapid-bison  | API       | uvicorn on :8000                               |
| good-bison   | Web       | next start on :3000                            |
| oceanic-basil| Tunnel    | cloudflared → trycloudflare.com                |

*Session IDs are from the current deployment. Restart = new session IDs.*

---

*Last deployed: 2026-03-21 by Scotty 🛠️*
