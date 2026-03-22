"""camelot parser — extracts tables from PDFs using lattice and stream flavors."""
import io
import time
import tempfile
import os
from typing import Any, Dict, List

try:
    import camelot
    _CAMELOT_AVAILABLE = True
except ImportError:
    _CAMELOT_AVAILABLE = False

MAX_TABLES = 50


def run_camelot(pdf_bytes: bytes) -> Dict[str, Any]:
    start = time.monotonic()

    if not _CAMELOT_AVAILABLE:
        return {
            "status": "error",
            "error": "Library not available: camelot-py. Install with: pip install camelot-py[cv]",
        }

    try:
        # camelot needs a file path
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            tables: List[Dict[str, Any]] = []

            for flavor in ("lattice", "stream"):
                try:
                    extracted = camelot.read_pdf(tmp_path, pages="1-end", flavor=flavor)
                    for t in extracted:
                        if len(tables) >= MAX_TABLES:
                            break
                        data = t.df.values.tolist()
                        # Convert all cells to str
                        data = [[str(cell) for cell in row] for row in data]
                        tables.append({
                            "page": t.page,
                            "flavor": flavor,
                            "accuracy": round(t.accuracy, 2),
                            "data": data,
                        })
                except Exception as flavor_exc:
                    # One flavor failing shouldn't kill the other
                    tables.append({
                        "page": None,
                        "flavor": flavor,
                        "accuracy": 0.0,
                        "data": [],
                        "error": str(flavor_exc),
                    })

                if len(tables) >= MAX_TABLES:
                    break

        finally:
            os.unlink(tmp_path)

        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "duration_ms": duration_ms,
            "tables": tables[:MAX_TABLES],
            "total_tables": len(tables),
        }

    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error": str(exc),
        }
