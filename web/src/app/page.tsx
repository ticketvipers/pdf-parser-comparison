'use client'

import { useState } from 'react'
import UploadArea from '@/components/UploadArea'
import ResultsGrid from '@/components/ResultsGrid'
import FilePicker from '@/components/FilePicker'
import PdfPreview from '@/components/PdfPreview'

export type ParserStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface PdfplumberResult {
  status: 'ok'
  duration_ms: number
  text: string
  tables: unknown[][][]
  metadata: Record<string, unknown>
}

export interface UnstructuredResult {
  status: 'ok'
  duration_ms: number
  elements: Array<{ type: string; text: string }>
}

export interface DoclingResult {
  status: 'ok'
  duration_ms: number
  content: {
    sections?: Array<{ heading: string; text: string }>
    tables?: Array<{ caption?: string; data: unknown[][] }>
  }
  llm?: {
    markdown: string
    chunks: Array<{
      text: string
      meta: {
        headings: string[]
        page: number
      }
    }>
  }
}

export interface MarkerResult {
  status: 'ok'
  duration_ms: number
  markdown: string
  images: number
  metadata: Record<string, unknown>
}

export interface CamelotResult {
  status: 'ok'
  duration_ms: number
  tables: Array<{
    page: number
    flavor: 'lattice' | 'stream'
    accuracy: number
    data: string[][]
  }>
  total_tables: number
}

export interface ParserError {
  status: 'error'
  error: string
}

export interface ParseResponse {
  filename: string
  parsers: {
    pdfplumber: PdfplumberResult | ParserError
    unstructured: UnstructuredResult | ParserError
    docling: DoclingResult | ParserError
    marker: MarkerResult | ParserError
    camelot: CamelotResult | ParserError
  }
}

const ALL_PARSERS = ['pdfplumber', 'unstructured', 'docling', 'marker', 'camelot'] as const
type ParserName = typeof ALL_PARSERS[number]

export default function Home() {
  const [results, setResults] = useState<ParseResponse | null>(null)
  const [pdfSrc, setPdfSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [visibleParsers, setVisibleParsers] = useState<Set<ParserName>>(new Set(ALL_PARSERS))

  const allChecked = ALL_PARSERS.every((p) => visibleParsers.has(p))

  const toggleParser = (p: ParserName) => {
    setVisibleParsers((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const toggleAll = () => {
    setVisibleParsers(allChecked ? new Set() : new Set(ALL_PARSERS))
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

  const handlePickFile = async (filename: string) => {
    setUploadError(null)
    setResults(null)
    setPdfSrc(`${apiUrl}/api/files/${encodeURIComponent(filename)}/raw`)
    setUploading(false)
    setParsing(true)
    setUploadProgress(0)

    try {
      const res = await fetch(`${apiUrl}/api/parse-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
        signal: AbortSignal.timeout(310_000),
      })
      if (!res.ok) {
        let msg = `Server error: ${res.status}`
        try {
          const err = await res.json()
          if (err.detail) msg = err.detail
        } catch {}
        throw new Error(msg)
      }
      const data: ParseResponse = await res.json()
      setResults(data)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Parse failed')
    } finally {
      setParsing(false)
    }
  }

  const handleUpload = async (file: File) => {
    setUploadError(null)
    setResults(null)
    // Create blob URL for preview immediately (before upload completes)
    setPdfSrc(URL.createObjectURL(file))
    setUploading(true)
    setParsing(false)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Use XMLHttpRequest for progress tracking
      const data = await new Promise<ParseResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${apiUrl}/api/parse`)

        // Timeout slightly above backend's 300s per-parser limit
        xhr.timeout = 310_000

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        // Once file bytes are fully sent, switch to indeterminate "parsing" state
        xhr.upload.addEventListener('load', () => {
          setUploading(false)
          setParsing(true)
        })

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              reject(new Error('Invalid response from server'))
            }
          } else {
            let msg = `Server error: ${xhr.status}`
            try {
              const err = JSON.parse(xhr.responseText)
              if (err.detail) msg = err.detail
            } catch {}
            reject(new Error(msg))
          }
        }

        xhr.onerror = () => reject(new Error('Network error'))
        xhr.ontimeout = () => reject(new Error('Request timed out — parsers took too long (>310s). Please try again.'))
        xhr.send(formData)
      })

      setResults(data)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setParsing(false)
      setUploadProgress(0)
    }
  }

  const showResults = results && pdfSrc

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white tracking-tight">
          📄 PDF Parser Comparison
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          pdfplumber · unstructured · docling · marker · camelot — side by side
        </p>
      </header>

      {/* Upload */}
      <div className="px-6 py-6 border-b border-gray-800 bg-gray-900/50">
        <UploadArea
          onUpload={handleUpload}
          uploading={uploading}
          parsing={parsing}
          progress={uploadProgress}
          error={uploadError}
        />
        <FilePicker
          onPick={handlePickFile}
          disabled={uploading || parsing}
        />
      </div>

      {/* Results: side-by-side on desktop, stacked on mobile */}
      {showResults ? (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: PDF preview — sticky, full viewport height minus header */}
          <div className="h-[50vh] md:h-[calc(100vh-8rem)] md:w-[38%] md:sticky md:top-0 md:self-start shrink-0 border-b md:border-b-0 md:border-r border-gray-800 bg-gray-900/60 flex flex-col">
            <PdfPreview src={pdfSrc} filename={results.filename} />
          </div>

          {/* Right: Parser results — scrollable */}
          <div className="flex-1 overflow-auto flex flex-col">
            {/* Parser visibility toggle bar */}
            <div className="px-4 py-2 bg-gray-900/80 border-b border-gray-800 flex items-center gap-4 shrink-0 flex-wrap">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mr-1">Show:</span>
              {/* All toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="accent-blue-500 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-300 font-medium">All</span>
              </label>
              <div className="w-px h-4 bg-gray-700" />
              {ALL_PARSERS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleParsers.has(p)}
                    onChange={() => toggleParser(p)}
                    className="accent-blue-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-gray-400 font-mono">{p}</span>
                </label>
              ))}
            </div>
            <ResultsGrid results={results} visibleParsers={visibleParsers} />
          </div>
        </div>
      ) : (
        <>
          {/* PDF src set but results pending (parsing in progress) — show preview alone */}
          {pdfSrc && (uploading || parsing) && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="h-[50vh] md:h-[calc(100vh-8rem)] md:w-[38%] md:sticky md:top-0 md:self-start shrink-0 border-b md:border-b-0 md:border-r border-gray-800 bg-gray-900/60 flex flex-col">
                <PdfPreview src={pdfSrc} filename={pdfSrc.startsWith('blob:') ? 'Uploading…' : decodeURIComponent(pdfSrc.split('/').pop() ?? 'file.pdf')} />
              </div>
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                {uploading ? `Uploading… ${uploadProgress}%` : 'Parsing…'}
              </div>
            </div>
          )}

          {!pdfSrc && !uploading && !parsing && (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Upload a PDF to see results
            </div>
          )}
        </>
      )}
    </main>
  )
}
