# PDF Parser Comparison App — Spec

## Goal
Upload a PDF and instantly see extraction results from three parsing libraries side-by-side, making it easy to compare quality, structure, and coverage across tools.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Python 3.11 + FastAPI | Native support for all three parsing libs; async-friendly |
| Task queue | None (sync, parallel threads) | Simple enough for MVP; revisit if timeouts become a problem |
| Frontend | Next.js 14 (App Router) + Tailwind CSS | Fast to build, good table/grid layout support |
| File storage | In-memory / temp dir | No persistence needed for MVP |
| Deployment | Docker Compose (api + web) | Single-command local dev |

**Parsing libraries:**
- `pdfplumber` — text, tables, metadata
- `unstructured` (unstructured.io) — elements (Title, NarrativeText, Table, etc.)
- `docling` — structured content (sections, tables, figures)

---

## Features / Acceptance Criteria

### Upload
- [ ] PDF upload area is prominently displayed at the top of the page
- [ ] Drag-and-drop + click-to-browse both work
- [ ] Accepted file types: `.pdf` only; max size 20 MB (enforced client + server)
- [ ] Upload progress indicator shown during submission
- [ ] Clear error message on invalid file type or oversized upload

### Parsing
- [ ] All three parsers run in parallel (concurrent, not sequential)
- [ ] Each parser has a 300s timeout; partial failure is shown, not a full crash
- [ ] Per-parser status: loading spinner → success or error state

### Results Display
- [ ] Results appear in a **3-column side-by-side layout** (pdfplumber | unstructured | docling)
- [ ] Each column header shows: library name + parse duration (ms)
- [ ] Each column displays:
  - **Text** — raw extracted text, scrollable
  - **Tables** — rendered as HTML tables (or "no tables found")
  - **Metadata / Elements** — key-value pairs or element list
- [ ] Columns are independently scrollable
- [ ] On mobile (< 768px), columns stack vertically with tab switcher

### General
- [ ] No login / auth required
- [ ] Results are ephemeral — cleared on new upload or page refresh
- [ ] Works in latest Chrome, Firefox, Safari

---

## API Contract

### `POST /api/parse`
Upload a PDF and get results from all three parsers.

**Request:** `multipart/form-data`
```
file: <PDF binary>
```

**Response `200 OK`:**
```json
{
  "filename": "example.pdf",
  "parsers": {
    "pdfplumber": {
      "status": "ok",
      "duration_ms": 412,
      "text": "...",
      "tables": [ [["col1", "col2"], ["val1", "val2"]] ],
      "metadata": { "pages": 4, "author": "..." }
    },
    "unstructured": {
      "status": "ok",
      "duration_ms": 890,
      "elements": [
        { "type": "Title", "text": "Introduction" },
        { "type": "NarrativeText", "text": "..." },
        { "type": "Table", "text": "..." }
      ]
    },
    "docling": {
      "status": "ok",
      "duration_ms": 1100,
      "content": {
        "sections": [ { "heading": "...", "text": "..." } ],
        "tables": [ { "caption": "...", "data": [] } ]
      }
    }
  }
}
```

**Error shape (per parser):**
```json
"pdfplumber": {
  "status": "error",
  "error": "timeout after 300s"
}
```

**Response `400`:** Invalid file (not PDF, too large)
**Response `500`:** All parsers failed

### `GET /api/health`
Returns `{ "status": "ok" }` — for Docker health checks.

---

## Out of Scope
- User accounts, auth, or saved history
- Multi-file / batch uploads
- OCR for scanned/image-only PDFs
- Editing or exporting parsed results
- Paid unstructured.io API (use open-source local package)
- Page-level breakdown or per-page navigation

---

## Open Questions
1. **docling install size** — it pulls in heavy ML deps; confirm acceptable for Docker image size (likely 2–4 GB).
2. **unstructured local vs. API** — using `unstructured[local-inference]`; confirm no API key required in target env.
3. **Large PDFs** — 20 MB cap may still mean 200+ pages; should we add a page-count cap (e.g., 50 pages) for faster MVP response times?
4. **Table rendering** — unstructured returns tables as raw text; pdfplumber returns row/col arrays. Worth normalizing into a common format, or show raw per-parser?
