"""File validation utilities."""
import io

import pdfplumber
from fastapi import HTTPException, UploadFile

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


async def validate_pdf(file: UploadFile) -> bytes:
    """Read and validate an uploaded file. Returns raw bytes."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    content_type = file.content_type or ""
    if content_type and content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    data = await file.read()

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum allowed size is 20 MB."
        )

    # Basic PDF magic bytes check
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    # Reject password-protected PDFs early with a clear message
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if pdf.doc.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported."
                )
    except HTTPException:
        raise
    except Exception:
        # If pdfplumber can't open it at all, let the parsers surface a better error
        pass

    return data
