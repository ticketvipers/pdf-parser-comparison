# LOKI_QA.md — QA Findings 😈

> Reviewed by: Loki (QA / Chaos Anticipator)  
> Date: 2026-03-21  
> Scope: Backend (`api/`) + Frontend (`web/`) + SPEC alignment

---

## 🔴 Blockers — Will embarrass you at demo

### 1. 🔴 `unstructured` parser: `max_partition` is the wrong parameter

**File:** `api/parsers/unstructured_parser.py:27`

```python
raw_elements = partition_pdf(
    filename=tmp_path,
    strategy="fast",
    max_partition=MAX_PAGES,   # ← WRONG
)
```

`max_partition` in `unstructured` is a *character-count* chunking parameter, not a page limiter. Passing `50` as a character limit means each element gets chunked at 50 chars, producing hundreds of tiny fragments — or, depending on the version, it raises a `TypeError` about unexpected kwargs. Either way: the output is mangled or the parser errors on every upload.

**Fix:** Remove `max_partition` or use `chunking_strategy=None`. There is no page-count kwarg for `partition_pdf` in fast mode.

---

### 2. 🔴 Docling API surface is likely wrong

**File:** `api/parsers/docling_parser.py`

The parser uses:
- `doc.iterate_items()` — this method does not exist in current docling releases (the API is `doc.texts`, `doc.export_to_dict()`, or iterating `doc.body.children`)
- `table.data.grid` — the grid accessor changed across versions
- `table.captions[0]` — captions may be stored differently

Docling's API is still evolving rapidly. This parser will almost certainly throw `AttributeError` on first use, fall into the `except` block, and return `{"status": "error"}` for every upload. At demo, the docling column will always show "Parser failed."

**Fix:** Verify against the actual installed version with `python -c "from docling.document_converter import DocumentConverter; help(DocumentConverter)"` and update the attribute access paths.

---

### 3. 🔴 Progress bar frozen at 100% during parsing (up to 5 minutes)

**File:** `web/src/app/page.tsx` and `UploadArea.tsx`

Upload progress tracks XHR upload bytes (0→100%). Once the file is uploaded (takes seconds for a small PDF), progress hits 100% — but the parsers can take up to 300 seconds. The UI shows "Uploading & parsing…" with a full progress bar for up to 5 minutes with no indication anything is happening.

At demo: user uploads PDF, bar goes to 100%, then… nothing visible. Looks frozen/crashed.

**Fix:** After upload completes, switch to an indeterminate spinner with a "Parsing…" label. Or break into two phases: upload phase (XHR progress) + parsing phase (indeterminate).

---

### 4. 🔴 No frontend request timeout — hangs forever

**File:** `web/src/app/page.tsx:67`

```js
const xhr = new XMLHttpRequest()
xhr.open('POST', `${apiUrl}/api/parse`)
// no xhr.timeout set
```

If the backend is slow or unresponsive, the XHR waits indefinitely. The user sees "Uploading & parsing…" with no way to cancel (no cancel button either). The backend timeout is 300s per parser, so worst case = 5 minutes of frozen UI.

**Fix:** Set `xhr.timeout = 310000` (slightly above backend timeout) and handle `xhr.ontimeout`.

---

### 5. 🔴 Image-only PDF silently returns empty across all three parsers

If you upload a scanned/image-only PDF (no embedded text), all three parsers return empty text because `strategy="fast"` in unstructured skips OCR, and pdfplumber + docling can't extract what isn't there.

The UI will show three blank "No text extracted / No sections / No elements" columns — looks broken to anyone who doesn't know about OCR. At a demo with a real-world scanned document, this is an embarrassing silent failure.

**Fix (short term):** Detect this case — if pdfplumber extracts 0 bytes of text AND there are images on the page (pdfplumber exposes `page.images`), surface a banner: "This PDF appears to be image-only. OCR is not enabled." Better than silent empty.

---

## 🟡 Should Fix — Will cause real problems

### 6. 🟡 Password-protected PDFs produce cryptic errors

A password-protected PDF passes all validation (magic bytes `%PDF` present), gets handed to parsers, which throw obscure internal errors like `"EOF marker not found"` or `"PdfStreamError: stream has ended unexpectedly"`.

**Fix:** In `validate_pdf`, attempt to open with pdfplumber briefly and check if the PDF is encrypted:

```python
import pdfplumber
with pdfplumber.open(io.BytesIO(data)) as pdf:
    if pdf.doc.is_encrypted:
        raise HTTPException(400, "Password-protected PDFs are not supported.")
```

---

### 7. 🟡 No row cap on tables — large tables can make the UI unusable

**File:** `api/parsers/pdfplumber_parser.py`

A PDF with a 5,000-row financial data table extracts all rows, serializes them into JSON, and sends them to the browser. The `TableRenderer` renders every row as a `<tr>`. With no virtualization, this will freeze the browser tab.

**Fix:** Cap table rows at 200 (or similar) and append a "…N more rows truncated" note.

---

### 8. 🟡 CORS only allows `localhost:3000` — breaks any non-local demo setup

**File:** `api/main.py:13`

```python
allow_origins=["http://localhost:3000"],
```

If the demo is shown from a different machine, a VM, or the frontend port is changed, every API call returns CORS error. Silent from the user's perspective (they'll see "Network error").

**Fix:** Make CORS origins configurable via env var `ALLOWED_ORIGINS`, defaulting to `localhost:3000`.

---

### 9. 🟡 `asyncio.get_event_loop()` deprecation warning

**File:** `api/services/orchestrator.py:24`

```python
loop = asyncio.get_event_loop()
```

In Python 3.10+, calling `get_event_loop()` from a coroutine emits a `DeprecationWarning`. In Python 3.12+ it may raise `RuntimeError`. Use `asyncio.get_running_loop()` instead.

---

### 10. 🟡 Single-row tables render as header-only (empty body)

**File:** `web/src/components/TableRenderer.tsx:13`

```ts
const [header, ...body] = rows  // body is [] if only 1 row
```

A 1-row table (e.g., a label row only) renders with a header and no body rows. Looks like a malformed/empty table rather than a single data row. Should handle 1-row tables by either treating all rows as body, or checking row count before splitting.

---

### 11. 🟡 Empty PDF (0 pages) produces misleading empty-state UI

A valid PDF with 0 pages (technically legal) returns `status: ok` from all parsers with empty text, empty tables, and `metadata.pages = 0`. The UI shows three "No text / No sections / No elements" columns with no indication the PDF was empty. A user will think the app is broken.

**Fix:** If `metadata.pages === 0`, show a banner "PDF has 0 pages."

---

### 12. 🟡 Temp file leaked if process is killed mid-request

**Files:** `api/parsers/unstructured_parser.py`, `api/parsers/docling_parser.py`

Both parsers write to `tempfile.NamedTemporaryFile` and clean up in `finally`. This is fine for normal exceptions, but if the process receives `SIGKILL` (OOM killer, container restart) mid-parse, the temp file is leaked.

**Fix:** Use a temp directory scoped to the request lifecycle, or use Python's `tempfile.TemporaryDirectory` context manager pattern. Low risk for MVP but could accumulate on long-running servers.

---

## 🟢 Nice to Have

### 13. 🟢 Unicode / RTL text has no special handling in frontend

Arabic, Hebrew, and CJK text will display correctly in browsers, but the `<pre>` blocks use LTR layout. RTL text will appear left-aligned and may look jumbled. Add `dir="auto"` to text containers.

### 14. 🟢 Metadata values containing objects render as `[object Object]`

**File:** `web/src/components/ParserColumn.tsx:57`

```tsx
<dd className="...">{String(v)}</dd>
```

If a metadata value is a nested object (e.g., `XMP` metadata from docling), `String(v)` becomes `[object Object]`. Should use `JSON.stringify(v, null, 2)` with a `<pre>` for objects.

### 15. 🟢 No "cancel upload" button

Once upload starts, there's no way to cancel. The `uploading` state disables the drop zone but provides no escape hatch. Minor UX issue.

### 16. 🟢 Filename not sanitized in the header display

`results.filename` is rendered verbatim. React auto-escapes it so no XSS, but a very long filename (e.g., 200+ chars) will overflow the filename bar. Add `truncate` or `max-w` capping.

### 17. 🟢 Huge text blobs in pdfplumber are uncapped

The `max-h-64 overflow-y-auto` limits visible height, but the DOM still contains the full text. For a 200-page novel (~500KB of text), this creates a large DOM node. Consider truncating to 50KB with a "Show more" affordance.

---

## Summary Table

| # | Severity | Location | Issue |
|---|---|---|---|
| 1 | 🔴 | `unstructured_parser.py` | Wrong `max_partition` param — garbled output or crash |
| 2 | 🔴 | `docling_parser.py` | Docling API calls likely wrong — always errors |
| 3 | 🔴 | `UploadArea.tsx` | Progress bar frozen at 100% during parsing |
| 4 | 🔴 | `page.tsx` | No XHR timeout — hangs forever |
| 5 | 🔴 | All parsers | Image-only PDF: silent empty results, looks broken |
| 6 | 🟡 | `validation.py` | Password-protected PDF: cryptic error |
| 7 | 🟡 | `pdfplumber_parser.py` | No table row cap — browser freeze on large tables |
| 8 | 🟡 | `main.py` | CORS hardcoded to localhost — breaks shared demo |
| 9 | 🟡 | `orchestrator.py` | `get_event_loop()` deprecated in Python 3.10+ |
| 10 | 🟡 | `TableRenderer.tsx` | 1-row tables render as header-only |
| 11 | 🟡 | Frontend | 0-page PDF shows empty state with no explanation |
| 12 | 🟡 | Both parsers | Temp file leaked on SIGKILL |
| 13 | 🟢 | `ParserColumn.tsx` | RTL/Unicode text not dir-aware |
| 14 | 🟢 | `ParserColumn.tsx` | Object metadata values show `[object Object]` |
| 15 | 🟢 | `UploadArea.tsx` | No cancel button during upload |
| 16 | 🟢 | `ResultsGrid.tsx` | Long filenames overflow the header bar |
| 17 | 🟢 | `ParserColumn.tsx` | Huge text blobs not truncated in DOM |

**Verdict:** Issues #1, #2, and #3 will make the first demo look broken. Fix those three before showing anyone.
