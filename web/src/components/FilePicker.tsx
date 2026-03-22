'use client'

import { useEffect, useState } from 'react'

interface SampleFile {
  name: string
  size_kb: number
  path: string
}

interface Props {
  onPick: (filename: string) => void
  disabled: boolean
}

export default function FilePicker({ onPick, disabled }: Props) {
  const [files, setFiles] = useState<SampleFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    fetch(`${apiUrl}/api/files`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setFiles(data.files ?? [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load files')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto mt-4">
        <div className="text-gray-500 text-xs text-center animate-pulse">Loading sample files…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-4 text-red-400 text-xs text-center">
        ⚠️ Could not load sample files: {error}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-4 text-gray-500 text-xs text-center">
        No sample PDF files found.
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto mt-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
          Or pick a sample file
        </span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {files.map((file) => (
          <button
            key={file.name}
            onClick={() => !disabled && onPick(file.name)}
            disabled={disabled}
            className={[
              'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors group',
              disabled
                ? 'border-gray-700 bg-gray-800/20 cursor-not-allowed opacity-50'
                : 'border-gray-700 bg-gray-800/30 hover:border-blue-500 hover:bg-blue-900/10 cursor-pointer',
            ].join(' ')}
          >
            <span className="text-xl shrink-0">📄</span>
            <div className="min-w-0">
              <div
                className={[
                  'text-sm font-medium truncate',
                  disabled ? 'text-gray-400' : 'text-gray-200 group-hover:text-blue-300',
                ].join(' ')}
              >
                {file.name}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{file.size_kb} KB</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
