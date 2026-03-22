"""Orchestrator — runs all 3 parsers in parallel via ThreadPoolExecutor."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from parsers.pdfplumber_parser import run_pdfplumber
from parsers.unstructured_parser import run_unstructured
from parsers.docling_parser import run_docling
from parsers.marker_parser import run_marker
from parsers.camelot_parser import run_camelot

PARSER_TIMEOUT = 300  # seconds

# Shared executor — module-level so it's reused across requests
_executor = ThreadPoolExecutor(max_workers=10)


async def run_all_parsers(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Runs pdfplumber, unstructured, and docling in parallel.
    Each parser has a 300s timeout. A single parser failure never crashes others.
    """
    loop = asyncio.get_running_loop()

    parser_map = {
        "pdfplumber": run_pdfplumber,
        "unstructured": run_unstructured,
        "docling": run_docling,
        "marker": run_marker,
        "camelot": run_camelot,
    }

    # Submit all to executor
    futures = {
        name: loop.run_in_executor(_executor, fn, pdf_bytes)
        for name, fn in parser_map.items()
    }

    results: Dict[str, Any] = {}

    # Await each with individual timeout
    for name, future in futures.items():
        try:
            result = await asyncio.wait_for(future, timeout=PARSER_TIMEOUT)
            results[name] = result
        except asyncio.TimeoutError:
            results[name] = {
                "status": "error",
                "error": f"timeout after {PARSER_TIMEOUT}s",
            }
        except Exception as exc:
            results[name] = {
                "status": "error",
                "error": str(exc),
            }

    return results
