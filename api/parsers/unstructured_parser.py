"""unstructured parser — extracts elements (Title, NarrativeText, Table, etc.)
with hi_res strategy, table inference, and invoice-aware post-processing.
"""
import io
import os
import tempfile
import time
from typing import Any, Dict, List


MAX_PAGES = 50

# Element types that signal the start of a new logical section
HEADER_TYPES = {"Title", "Header"}
FOOTER_TYPES = {"Footer"}
TABLE_TYPES = {"Table"}
SKIP_TYPES = {"PageBreak", "PageNumber"}

# Keywords that hint at invoice line-item sections
LINE_ITEM_KEYWORDS = {
    "description", "qty", "quantity", "unit price", "amount", "total",
    "item", "rate", "subtotal", "tax", "discount", "line",
}


def _is_line_item_header(text: str) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in LINE_ITEM_KEYWORDS)


def _group_elements(elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Group flat element list into Header / LineItems / Tables / Footer / Body."""
    headers: List[str] = []
    body: List[str] = []
    tables: List[str] = []
    footer: List[str] = []
    line_items_raw: List[str] = []

    in_line_items = False

    for el in elements:
        t = el["type"]
        text = el["text"].strip()

        if not text or t in SKIP_TYPES:
            continue

        if t in FOOTER_TYPES:
            footer.append(text)
            in_line_items = False
        elif t in TABLE_TYPES:
            tables.append(text)
            in_line_items = False
        elif t in HEADER_TYPES:
            if _is_line_item_header(text):
                in_line_items = True
                line_items_raw.append(text)
            else:
                headers.append(text)
                in_line_items = False
        else:
            # NarrativeText, ListItem, Address, etc.
            if in_line_items:
                line_items_raw.append(text)
            else:
                body.append(text)

    return {
        "header": headers,
        "body": body,
        "line_items": line_items_raw,
        "tables": tables,
        "footer": footer,
    }


def run_unstructured(pdf_bytes: bytes) -> Dict[str, Any]:
    start = time.monotonic()
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            from unstructured.partition.pdf import partition_pdf

            raw_elements = partition_pdf(
                filename=tmp_path,
                strategy="hi_res",           # better layout detection
            )
        finally:
            os.unlink(tmp_path)

        elements = []
        for el in raw_elements:
            page_num = getattr(getattr(el, "metadata", None), "page_number", None)
            if page_num is not None and page_num > MAX_PAGES:
                continue
            elements.append({
                "type": type(el).__name__,
                "text": str(el),
            })

        grouped = _group_elements(elements)
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "duration_ms": duration_ms,
            "elements": elements,          # raw (unchanged, backward compat)
            "structured": grouped,         # new: invoice-aware sections
        }
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error": str(exc),
        }
