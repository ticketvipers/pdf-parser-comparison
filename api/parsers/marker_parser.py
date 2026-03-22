"""marker parser — converts PDF to clean markdown using layout detection + OCR."""
import io
import time
import tempfile
import os
from typing import Any, Dict

try:
    # Try newer API first (marker >= 0.3)
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict
    _MARKER_API = "new"
except ImportError:
    try:
        from marker.convert import convert_single_pdf
        _MARKER_API = "old"
    except ImportError:
        _MARKER_API = None


def run_marker(pdf_bytes: bytes) -> Dict[str, Any]:
    start = time.monotonic()

    if _MARKER_API is None:
        return {
            "status": "error",
            "error": "Library not available: marker-pdf. Install with: pip install marker-pdf",
        }

    try:
        # Write bytes to a temp file — marker requires a file path
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            if _MARKER_API == "new":
                models = create_model_dict()
                converter = PdfConverter(artifact_dict=models)
                rendered = converter(tmp_path)
                # rendered is a RenderedDocument with .markdown, .images, .metadata
                markdown = rendered.markdown if hasattr(rendered, "markdown") else str(rendered)
                images_count = len(rendered.images) if hasattr(rendered, "images") else 0
                metadata = rendered.metadata if hasattr(rendered, "metadata") else {}
                if hasattr(metadata, "__dict__"):
                    metadata = metadata.__dict__
            else:
                # Old API: convert_single_pdf returns (markdown, images, out_meta)
                result = convert_single_pdf(tmp_path, batch_multiplier=1)
                if isinstance(result, tuple) and len(result) == 3:
                    markdown, images, metadata = result
                elif isinstance(result, tuple) and len(result) == 2:
                    markdown, metadata = result
                    images = {}
                else:
                    markdown = str(result)
                    images = {}
                    metadata = {}
                images_count = len(images) if images else 0
        finally:
            os.unlink(tmp_path)

        # Ensure metadata is JSON-serializable
        if not isinstance(metadata, dict):
            try:
                metadata = dict(metadata)
            except Exception:
                metadata = {}

        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "duration_ms": duration_ms,
            "markdown": markdown,
            "images": images_count,
            "metadata": metadata,
        }

    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error": str(exc),
        }
