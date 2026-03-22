"""Parse router — POST /api/parse, GET /api/health, GET /api/files, POST /api/parse-by-name, GET /api/files/{filename}/raw."""
import os
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from services.orchestrator import run_all_parsers
from utils.validation import validate_pdf

router = APIRouter()

# ---------------------------------------------------------------------------
# Samples directory — configurable via SAMPLES_DIR env var.
# Default is the absolute path where the invoice PDFs live.
# ---------------------------------------------------------------------------
_DEFAULT_SAMPLES_DIR = "/Users/aigaurav/.openclaw/workspace/pdf-parser-app/samples"
SAMPLES_DIR = Path(os.environ.get("SAMPLES_DIR", _DEFAULT_SAMPLES_DIR)).resolve()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/files")
async def list_files():
    """Return all .pdf files available in the samples directory."""
    if not SAMPLES_DIR.is_dir():
        raise HTTPException(status_code=500, detail=f"Samples directory not found: {SAMPLES_DIR}")

    files = []
    for entry in sorted(SAMPLES_DIR.iterdir()):
        if entry.is_file() and entry.suffix.lower() == ".pdf":
            size_kb = round(entry.stat().st_size / 1024)
            files.append({"name": entry.name, "size_kb": size_kb, "path": entry.name})

    return JSONResponse(content={"files": files})


class ParseByNameRequest(BaseModel):
    filename: str


@router.post("/parse-by-name")
async def parse_by_name(body: ParseByNameRequest):
    """Parse a PDF from the samples directory by filename.

    Only files directly inside SAMPLES_DIR are allowed — path traversal is rejected.
    """
    # Resolve and enforce that the target stays within SAMPLES_DIR
    requested = (SAMPLES_DIR / body.filename).resolve()
    if not str(requested).startswith(str(SAMPLES_DIR) + os.sep) and requested != SAMPLES_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename — path traversal not allowed.")

    if requested.parent != SAMPLES_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename — subdirectories not allowed.")

    if not requested.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {body.filename}")

    if requested.suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = requested.read_bytes()

    # Reuse the same validation logic (magic bytes, encryption check, size)
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum allowed size is 20 MB.")
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    results = await run_all_parsers(pdf_bytes)

    all_failed = all(r.get("status") == "error" for r in results.values())
    if all_failed:
        raise HTTPException(status_code=500, detail="All parsers failed.")

    return JSONResponse(content={
        "filename": body.filename,
        "parsers": results,
    })


@router.get("/files/{filename}/raw")
async def serve_raw_pdf(filename: str):
    """Serve the raw PDF bytes for a file in the samples directory.

    Path traversal is rejected — only files directly inside SAMPLES_DIR are allowed.
    """
    requested = (SAMPLES_DIR / filename).resolve()

    # Block path traversal
    if not str(requested).startswith(str(SAMPLES_DIR) + os.sep) and requested != SAMPLES_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename — path traversal not allowed.")

    if requested.parent != SAMPLES_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename — subdirectories not allowed.")

    if not requested.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    return FileResponse(path=str(requested), media_type="application/pdf", filename=filename)


@router.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    pdf_bytes = await validate_pdf(file)

    results = await run_all_parsers(pdf_bytes)

    # If ALL parsers failed, return 500
    all_failed = all(r.get("status") == "error" for r in results.values())
    if all_failed:
        raise HTTPException(status_code=500, detail="All parsers failed.")

    return JSONResponse(content={
        "filename": file.filename,
        "parsers": results,
    })
