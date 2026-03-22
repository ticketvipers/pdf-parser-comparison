"""pdfplumber parser — extracts text, tables, and metadata."""
import io
import time
from typing import Any, Dict, List

import pdfplumber


MAX_PAGES = 50


def run_pdfplumber(pdf_bytes: bytes) -> Dict[str, Any]:
    start = time.monotonic()
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = pdf.pages[:MAX_PAGES]

            # Text
            text_parts = []
            for page in pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
            text = "\n\n".join(text_parts)

            # Tables — list of tables; each table is list of rows; each row is list of cell strings
            TABLE_ROW_CAP = 200  # prevent browser freeze on huge tables
            all_tables: List[List[List[str]]] = []
            for page in pages:
                for table in page.extract_tables():
                    normalized = [
                        [str(cell) if cell is not None else "" for cell in row]
                        for row in table
                    ]
                    if len(normalized) > TABLE_ROW_CAP:
                        truncated_count = len(normalized) - TABLE_ROW_CAP
                        normalized = normalized[:TABLE_ROW_CAP]
                        # Append a sentinel row noting truncation
                        if normalized and normalized[0]:
                            sentinel = [f"… {truncated_count} more rows truncated"] + [""] * (len(normalized[0]) - 1)
                            normalized.append(sentinel)
                    all_tables.append(normalized)

            # Metadata
            meta = pdf.metadata or {}
            metadata: Dict[str, Any] = {k: v for k, v in meta.items() if v}
            metadata["pages"] = len(pdf.pages)

        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "duration_ms": duration_ms,
            "text": text,
            "tables": all_tables,
            "metadata": metadata,
        }
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error": str(exc),
        }
