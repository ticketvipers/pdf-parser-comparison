'use client'

import { useCallback, useRef, useState } from 'react'

const MAX_SIZE_MB = 20
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface Props {
  onUpload: (file: File) => void
  uploading: boolean
  parsing: boolean
  progress: number
  error: string | null
}

export default function UploadArea({ onUpload, uploading, parsing, progress, error }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (file: File): string | null => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return 'Only PDF files are accepted.'
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large. Maximum size is ${MAX_SIZE_MB} MB.`
    }
    return null
  }

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file)
      if (err) {
        // surface via parent — we pass a synthetic upload that will fail client-side
        // instead, we call onUpload with a guard; easier to just rely on parent error display
        // but since we want client-side: trigger the error by calling with bad file (parent ignores validation)
        // Actually, let's handle client-side here via a local state trick:
        // We'll short-circuit and emit an error. Parent receives onUpload only for valid files.
        // For now, use a small workaround: call onUpload anyway and let parent show the error
        // Actually best: keep local client-side error displayed inline before sending.
        // Since parent manages error state, we'll just skip calling onUpload and show locally.
        // But parent clears error on each upload call. Use local state:
        setLocalError(err)
        return
      }
      setLocalError(null)
      onUpload(file)
    },
    [onUpload]
  )

  const [localError, setLocalError] = useState<string | null>(null)
  const displayError = localError || error

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset so same file can be re-uploaded
    e.target.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload PDF"
        onClick={() => !uploading && !parsing && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !uploading && !parsing && inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={[
          'border-2 border-dashed rounded-xl px-8 py-10 text-center cursor-pointer transition-colors select-none',
          dragging
            ? 'border-blue-400 bg-blue-900/20'
            : uploading || parsing
            ? 'border-gray-600 bg-gray-800/30 cursor-not-allowed'
            : 'border-gray-600 hover:border-blue-500 hover:bg-blue-900/10 bg-gray-800/20',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={onInputChange}
          disabled={uploading || parsing}
        />

        {uploading ? (
          <div className="space-y-3">
            <div className="text-gray-300 text-sm font-medium">Uploading…</div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-gray-500 text-xs">{progress}%</div>
          </div>
        ) : parsing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-gray-300 text-sm font-medium">
              <SpinnerIcon />
              Parsers running…
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              {/* indeterminate shimmer */}
              <div className="bg-blue-500 h-2 rounded-full animate-pulse w-full opacity-60" />
            </div>
            <div className="text-gray-500 text-xs">This may take a few minutes…</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">📂</div>
            <p className="text-gray-300 font-medium">
              Drop a PDF here, or <span className="text-blue-400 underline">click to browse</span>
            </p>
            <p className="text-gray-500 text-xs">PDF only · max {MAX_SIZE_MB} MB</p>
          </div>
        )}
      </div>

      {displayError && (
        <div className="mt-3 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
          ⚠️ {displayError}
        </div>
      )}
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
