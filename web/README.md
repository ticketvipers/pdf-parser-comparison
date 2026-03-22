# PDF Parser Web Frontend

Next.js 14 App Router frontend for the PDF Parser Comparison App.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |

Set in `.env.local` for local dev:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Docker

```bash
docker build -t pdf-parser-web .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://api:8000 pdf-parser-web
```

## Structure

```
src/
  app/
    page.tsx          # Main page, upload state management
    layout.tsx        # Root layout + metadata
    globals.css       # Tailwind base
  components/
    UploadArea.tsx    # Drag-and-drop PDF upload with progress
    ResultsGrid.tsx   # 3-column layout + mobile tab switcher
    ParserColumn.tsx  # Per-parser column (header, spinner, error, content)
    TableRenderer.tsx # Handles pdfplumber / unstructured / docling table formats
```
