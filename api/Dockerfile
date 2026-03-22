# syntax=docker/dockerfile:1
FROM --platform=linux/arm64 python:3.11-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # unstructured requirements
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    # build tools (needed for some pip wheels)
    build-essential \
    git \
    curl \
    # misc
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── App directory ─────────────────────────────────────────────────────────────
WORKDIR /app

# ── Python deps ───────────────────────────────────────────────────────────────
# Copy requirements first for layer caching
COPY requirements.txt .

# Install PyTorch CPU-only (arm64) before the rest to avoid pulling GPU wheels
RUN pip install --no-cache-dir \
    torch==2.3.0 \
    torchvision==0.18.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install all other requirements
RUN pip install --no-cache-dir -r requirements.txt

# ── Pre-download docling ML models ────────────────────────────────────────────
# This avoids a multi-minute cold-start on first request.
# Models are cached inside the image at the default docling artifacts path.
RUN python -c "\
from docling.document_converter import DocumentConverter; \
print('Docling models pre-downloaded successfully'); \
"

# ── Copy source ───────────────────────────────────────────────────────────────
COPY . .

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 8000

# Health check — waits up to 5 min for first startup (model loads)
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
