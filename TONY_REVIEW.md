# Tony's Architecture Review ⚙️

_Reviewed against SPEC.md — March 2026_

---

## 1. Architecture Concerns & Risks

**Blocking parsers in an async framework (HIGH)**
FastAPI is async, but pdfplumber/unstructured/docling are all CPU-bound/blocking. Running them naively inside an `async def` endpoint will block the event loop entirely. This is the #1 risk in the current spec.

**Memory pressure (MEDIUM)**
Three parsers operating on the same PDF simultaneously = 3x the memory footprint. A 20 MB PDF can balloon to 200–500 MB per parser in-process. With concurrent requests (even 2–3 users), you're looking at multi-GB RAM usage fast. For MVP/single-user Docker this is fine; flag it before any shared deployment.

**Timeout enforcement (MEDIUM)**
The spec says 300s per parser but the error shape example says "timeout after 30s" — pick one and be consistent. Also, killing a `ThreadPoolExecutor` thread mid-parse is not clean in Python; you can't forcibly terminate threads. Timeout detection works via `concurrent.futures.wait(timeout=...)` but the thread keeps running in the background. For MVP this is acceptable; for production you'd want subprocess isolation.

**Docker image size (LOW-MEDIUM)**
docling brings in PyTorch + transformers. Expect a 4–6 GB image. Use multi-stage builds and cache pip layers aggressively. Consider a `--no-install-recommends` base and Alpine or slim Python base.

**Single endpoint, no queue**
Fine for MVP. If parse requests pile up, FastAPI will just spawn more threads (up to executor limit). Set `max_workers=4` or so explicitly — don't rely on the default (which is `min(32, os.cpu_count() + 4)`).

---

## 2. Parallel Execution: ThreadPoolExecutor ✅ (not asyncio)

**Use `concurrent.futures.ThreadPoolExecutor`, not asyncio.**

Reason: All three libraries are synchronous, blocking, and CPU-heavy. asyncio only helps with I/O-bound concurrency. Running blocking calls in `asyncio.gather()` without `run_in_executor` would serialize everything on one thread.

Correct pattern:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_EXCEPTION
import asyncio

executor = ThreadPoolExecutor(max_workers=6)  # shared, module-level

async def parse_endpoint(file: UploadFile):
    loop = asyncio.get_event_loop()
    pdf_bytes = await file.read()

    futures = {
        "pdfplumber": loop.run_in_executor(executor, run_pdfplumber, pdf_bytes),
        "unstructured": loop.run_in_executor(executor, run_unstructured, pdf_bytes),
        "docling": loop.run_in_executor(executor, run_docling, pdf_bytes),
    }

    results = await asyncio.gather(*futures.values(), return_exceptions=True)
    # zip back to keys, handle exceptions per-parser
```

`loop.run_in_executor` offloads blocking calls to the thread pool without blocking the event loop. Each parser runs in its own thread concurrently. Exceptions per-future are caught individually — partial failure works correctly.

**GIL note:** Python's GIL means threads don't achieve true CPU parallelism for pure Python code. pdfplumber is mostly pure Python — threads will time-share. unstructured and docling invoke native/ML code that releases the GIL, so those will parallelize more genuinely. For MVP this is fine. If pdfplumber becomes a bottleneck, consider `ProcessPoolExecutor` for it specifically (separate process = no GIL contention).

---

## 3. Recommended Project Structure

```
pdf-parser-app/
├── docker-compose.yml
├── .env.example
│
├── api/                          # FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app + routes
│   ├── routers/
│   │   └── parse.py              # POST /api/parse, GET /api/health
│   ├── parsers/
│   │   ├── __init__.py
│   │   ├── base.py               # ParseResult dataclass / Protocol
│   │   ├── pdfplumber_parser.py
│   │   ├── unstructured_parser.py
│   │   └── docling_parser.py
│   ├── services/
│   │   └── orchestrator.py       # ThreadPoolExecutor dispatch + timeout logic
│   └── utils/
│       └── validation.py         # File type/size checks
│
└── web/                          # Next.js frontend
    ├── Dockerfile
    ├── package.json
    ├── tailwind.config.ts
    ├── next.config.ts
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx              # Upload UI
    │   └── globals.css
    ├── components/
    │   ├── UploadZone.tsx        # Drag-and-drop upload
    │   ├── ParserColumn.tsx      # Single parser result column
    │   ├── ResultsGrid.tsx       # 3-column layout orchestrator
    │   ├── TableRenderer.tsx     # Normalizes table formats per-parser
    │   └── StatusBadge.tsx       # loading / ok / error state
    └── lib/
        ├── api.ts                # fetch wrapper for /api/parse
        └── types.ts              # TypeScript types matching API contract
```

Key decisions baked in:
- Each parser is isolated in its own file — easy to swap or disable
- `base.py` defines a shared `ParseResult` shape — keeps orchestrator clean
- `TableRenderer.tsx` is a separate component because the table normalization question (open question #4) will definitely come up — isolate it now

---

## 4. Install Gotchas

### docling
- **Heavy**: pulls PyTorch, torchvision, transformers, easyocr. First install can be 4–8 GB. Pin versions — `docling` releases can silently bump torch versions.
- **Model downloads at runtime**: by default docling downloads layout/table models on first parse. In Docker, pre-download during image build with `python -c "from docling.document_converter import DocumentConverter; DocumentConverter()"` or set `DOCLING_ARTIFACTS_PATH` to a volume-mounted cache.
- **ARM/M-series Macs**: torch CPU wheels work fine; GPU acceleration not applicable without CUDA. Docker on Mac will run x86 emulation unless you use `--platform linux/arm64` — be explicit in the Dockerfile.
- **`docling` vs `docling-core`**: the PyPI package is `docling`, not `docling-core`. There's a separate `docling-core` package that's just the data models. You want `docling`.

### unstructured
- **`unstructured[local-inference]`** is the right extra — this bundles layout detection models (detectron2) locally. No API key needed. ✅ (Answers open question #2.)
- **detectron2** does not have official PyPI wheels. `unstructured[local-inference]` installs it from a GitHub release URL. This breaks on restricted networks and can silently fail. Test your Docker build in CI.
- **`libmagic`, `poppler-utils`, `tesseract`** are required system deps for full unstructured functionality. Add to Dockerfile:
  ```dockerfile
  RUN apt-get install -y libmagic1 poppler-utils tesseract-ocr
  ```
  Missing these produces confusing silent fallbacks, not loud errors.
- **Version pinning**: unstructured's API surface changes frequently between minor versions. Pin it (`unstructured[local-inference]==0.x.y`) and don't auto-upgrade.

### pdfplumber
- Cleanest install of the three. Just `pip install pdfplumber`. No surprises.
- Depends on `pdfminer.six` — occasionally has conflicts with other PDF libs. Not a concern here since you're not mixing others.

---

## Answers to Open Questions

1. **docling image size** — budget 5–7 GB with model cache included. Acceptable for local Docker; borderline for cloud deploys.
2. **unstructured local vs API** — confirmed, `unstructured[local-inference]` works fully offline. No API key.
3. **Page cap** — yes, add a 50-page hard cap server-side. docling on a 200-page doc can easily hit 60–120s. Cap protects the 300s timeout from being legitimately hit on normal docs.
4. **Table normalization** — recommend a thin normalization layer: convert everything to `{ headers: string[], rows: string[][] }`. Unstructured's table text can be parsed with a simple splitter for MVP. Makes `TableRenderer.tsx` trivial and results genuinely comparable.

---

## Summary Verdict

Spec is solid for MVP. Main action items before coding starts:

- [ ] Fix ThreadPoolExecutor pattern (use `run_in_executor`, don't block event loop)
- [ ] Add page-count cap (50 pages recommended)
- [ ] Bake docling model pre-download into Dockerfile
- [ ] Add system deps (`libmagic`, `poppler-utils`, `tesseract`) to api Dockerfile
- [ ] Decide on table normalization format upfront — affects both API response shape and frontend
- [ ] Align timeout value in spec (300s in text, 30s in error example — pick one)
