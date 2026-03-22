"""docling parser — structured content: sections, tables, figures.
Exposes full structured output: sections with labels, tables as grids,
and an invoice-aware summary layer (vendor, date, totals, line items).

LLM-ready export (added):
  - response["llm"]["markdown"]  — full document as clean Markdown
  - response["llm"]["chunks"]    — semantic chunks for RAG / embeddings
    Each chunk: {"text": str, "meta": {"headings": list[str], "page": int|None}}

Chunker import paths (preferred → fallback):
  1. docling.chunking.HybridChunker
  2. docling_core.transforms.chunker.hybrid_chunker.HybridChunker
  3. docling_core.transforms.chunker.hierarchical_chunker.HierarchicalChunker
  4. Manual heading-aware fallback (iterate_items)
"""
import os
import tempfile
import time
from typing import Any, Dict, List, Optional

MAX_CHUNKS = 100
MAX_PAGES = 50

# ── Chunker helpers ───────────────────────────────────────────────────────────

def _get_chunker():
    """Return the best available docling chunker class, or None."""
    # Try docling.chunking (top-level re-export)
    try:
        from docling.chunking import HybridChunker  # type: ignore
        return HybridChunker
    except Exception:
        pass
    # Try direct submodule (avoids tree_sitter __init__ problem)
    try:
        from docling_core.transforms.chunker.hybrid_chunker import HybridChunker  # type: ignore
        return HybridChunker
    except Exception:
        pass
    try:
        from docling_core.transforms.chunker.hierarchical_chunker import HierarchicalChunker  # type: ignore
        return HierarchicalChunker
    except Exception:
        pass
    return None


def _chunks_via_chunker(doc, ChunkerClass) -> List[Dict[str, Any]]:
    """Use a docling chunker to produce LLM chunks."""
    try:
        chunker = ChunkerClass()
        chunks: List[Dict[str, Any]] = []
        for chunk in chunker.chunk(doc):
            if len(chunks) >= MAX_CHUNKS:
                break
            text = getattr(chunk, "text", "") or ""
            meta = getattr(chunk, "meta", None)
            headings: List[str] = []
            page: Optional[int] = None
            if meta is not None:
                raw_headings = getattr(meta, "headings", None)
                if raw_headings:
                    headings = list(raw_headings)
                # page from first doc_item provenance
                doc_items = getattr(meta, "doc_items", None)
                if doc_items:
                    prov = getattr(doc_items[0], "prov", None)
                    if prov:
                        first_prov = prov[0] if hasattr(prov, "__getitem__") else next(iter(prov), None)
                        if first_prov is not None:
                            page = getattr(first_prov, "page_no", None)
            chunks.append({
                "text": text,
                "meta": {"headings": headings, "page": page},
            })
        return chunks
    except Exception:
        return []


def _chunks_manual_fallback(doc) -> List[Dict[str, Any]]:
    """Manual chunking fallback: group text by heading breadcrumb."""
    chunks: List[Dict[str, Any]] = []
    current_headings: List[str] = []
    current_texts: List[str] = []
    current_page: Optional[int] = None

    def flush():
        text = " ".join(current_texts).strip()
        if text:
            chunks.append({
                "text": text,
                "meta": {"headings": list(current_headings), "page": current_page},
            })

    try:
        for item, _level in doc.iterate_items():
            label = str(getattr(item, "label", "") or "")
            text = getattr(item, "text", "") or ""
            # extract page from provenance if available
            prov = getattr(item, "prov", None)
            page: Optional[int] = None
            if prov:
                first_prov = prov[0] if hasattr(prov, "__getitem__") else next(iter(prov), None)
                if first_prov is not None:
                    page = getattr(first_prov, "page_no", None)

            if "heading" in label.lower() or "section_header" in label.lower():
                flush()
                current_texts = []
                current_headings = [text] if text else current_headings
                current_page = page
            else:
                if text:
                    current_texts.append(text)
                    if current_page is None and page is not None:
                        current_page = page

        flush()
    except Exception:
        pass

    return chunks[:MAX_CHUNKS]


def _build_llm_export(doc) -> Dict[str, Any]:
    """Build the llm dict with markdown and chunks."""
    # Markdown export
    markdown = ""
    try:
        markdown = doc.export_to_markdown() or ""
    except Exception:
        pass

    # Chunks: try chunker classes, then manual fallback
    chunks: List[Dict[str, Any]] = []
    ChunkerClass = _get_chunker()
    if ChunkerClass is not None:
        chunks = _chunks_via_chunker(doc, ChunkerClass)
    if not chunks:
        chunks = _chunks_manual_fallback(doc)

    return {"markdown": markdown, "chunks": chunks}


# Keywords used to classify sections as invoice-relevant
VENDOR_KEYWORDS = {"from", "vendor", "supplier", "bill from", "invoice from", "company"}
DATE_KEYWORDS = {"date", "invoice date", "issue date", "due date"}
TOTAL_KEYWORDS = {"total", "amount due", "grand total", "balance due", "subtotal", "tax"}
LINE_ITEM_KEYWORDS = {
    "description", "item", "qty", "quantity", "unit price",
    "rate", "amount", "line items", "services", "products",
}


def _classify_section(heading: str) -> Optional[str]:
    h = heading.lower()
    if any(k in h for k in VENDOR_KEYWORDS):
        return "vendor"
    if any(k in h for k in DATE_KEYWORDS):
        return "dates"
    if any(k in h for k in TOTAL_KEYWORDS):
        return "totals"
    if any(k in h for k in LINE_ITEM_KEYWORDS):
        return "line_items"
    return None


def _build_invoice_summary(sections: List[Dict], tables: List[Dict]) -> Dict[str, Any]:
    """Best-effort invoice field extraction from docling sections + tables."""
    summary: Dict[str, Any] = {
        "vendor": None,
        "dates": [],
        "line_items_table": None,
        "totals": [],
        "other": [],
    }

    for sec in sections:
        cat = _classify_section(sec.get("heading", ""))
        text = sec.get("text", "").strip()
        if not text:
            continue
        if cat == "vendor" and not summary["vendor"]:
            summary["vendor"] = text
        elif cat == "dates":
            summary["dates"].append({"label": sec["heading"], "value": text})
        elif cat == "totals":
            summary["totals"].append({"label": sec["heading"], "value": text})
        elif cat == "line_items" and not summary["line_items_table"]:
            summary["line_items_table"] = text
        else:
            summary["other"].append({"heading": sec.get("heading", ""), "text": text})

    # If there are tables and no line_items_table yet, use the largest table
    if not summary["line_items_table"] and tables:
        largest = max(tables, key=lambda t: len(t.get("data", [])))
        if largest.get("data"):
            summary["line_items_table"] = largest["data"]

    return summary


# Module-level singleton — avoids re-initializing torch models on every request
_converter = None
_converter_no_tables = None  # fallback: table structure disabled


def _get_converter():
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter
        _converter = DocumentConverter()
    return _converter


def _get_converter_no_tables():
    """Fallback converter with table structure model disabled.

    Avoids TorchScript interpreter errors that occur when docling-ibm-models
    (built against an older torch) is paired with torch ≥ 2.x pulled in by
    marker-pdf / surya-ocr.  Text, sections, and figures are unaffected; only
    the ML-based table grid reconstruction is skipped.
    """
    global _converter_no_tables
    if _converter_no_tables is None:
        from docling.document_converter import DocumentConverter
        from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        opts = PdfPipelineOptions()
        opts.do_table_structure = False
        _converter_no_tables = DocumentConverter(
            pipeline_options=opts,
        )
    return _converter_no_tables


def run_docling(pdf_bytes: bytes) -> Dict[str, Any]:
    start = time.monotonic()
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            try:
                converter = _get_converter()
                result = converter.convert(tmp_path)
            except RuntimeError as torch_err:
                # TorchScript interpreter errors happen when docling-ibm-models
                # was built against an older torch and a newer torch (≥2.x) is
                # present (e.g. pulled in by marker-pdf / surya-ocr).
                # Fall back to a pipeline with table-structure ML disabled so
                # text, sections, and figures still work correctly.
                if "TorchScript" in str(torch_err) or "torchscript" in str(torch_err).lower():
                    converter = _get_converter_no_tables()
                    result = converter.convert(tmp_path)
                else:
                    raise
            doc = result.document
        finally:
            os.unlink(tmp_path)

        # ── Sections ─────────────────────────────────────────────────────────
        sections: List[Dict[str, Any]] = []
        current_heading: Optional[str] = None
        current_label: Optional[str] = None
        current_texts: List[str] = []

        for item, _level in doc.iterate_items():
            label = getattr(item, "label", None)
            text = getattr(item, "text", "") or ""
            label_str = str(label) if label else ""

            if "heading" in label_str.lower() or "section_header" in label_str.lower():
                if current_heading is not None or current_texts:
                    sections.append({
                        "heading": current_heading or "",
                        "label": current_label or "",
                        "text": " ".join(current_texts).strip(),
                    })
                current_heading = text
                current_label = label_str
                current_texts = []
            else:
                if text:
                    current_texts.append(text)

        if current_heading is not None or current_texts:
            sections.append({
                "heading": current_heading or "",
                "label": current_label or "",
                "text": " ".join(current_texts).strip(),
            })

        # ── Tables ────────────────────────────────────────────────────────────
        tables: List[Dict[str, Any]] = []
        for table in doc.tables:
            caption = ""
            if hasattr(table, "caption_text"):
                try:
                    caption = table.caption_text(doc) or ""
                except Exception:
                    caption = ""

            data: List[List[str]] = []
            if hasattr(table, "data") and table.data and hasattr(table.data, "num_rows"):
                num_rows = table.data.num_rows
                num_cols = table.data.num_cols
                grid: List[List[str]] = [[""] * num_cols for _ in range(num_rows)]
                for cell in table.data.table_cells:
                    r = cell.start_row_offset_idx
                    c = cell.start_col_offset_idx
                    if 0 <= r < num_rows and 0 <= c < num_cols:
                        grid[r][c] = cell.text or ""
                data = grid

            tables.append({"caption": caption, "data": data})

        # ── Invoice summary ───────────────────────────────────────────────────
        invoice_summary = _build_invoice_summary(sections, tables)

        # ── LLM-ready export ──────────────────────────────────────────────────
        llm_export = _build_llm_export(doc)

        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "duration_ms": duration_ms,
            "content": {
                "sections": sections,
                "tables": tables,
                "invoice_summary": invoice_summary,   # new: structured invoice fields
            },
            "llm": llm_export,
        }
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error": str(exc),
        }
