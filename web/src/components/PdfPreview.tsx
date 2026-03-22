'use client'

import { useEffect } from 'react'

interface PdfPreviewProps {
  /** Blob URL (for uploaded files) or API URL (for picked files) */
  src: string
  filename: string
}

export default function PdfPreview({ src, filename }: PdfPreviewProps) {
  // Revoke blob URLs when src changes or component unmounts
  useEffect(() => {
    return () => {
      if (src.startsWith('blob:')) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])

  return (
    <div className="flex flex-col h-full">
      <p className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2 px-4 pt-4 shrink-0">
        <span>📄</span>
        <span className="truncate" title={filename}>{filename}</span>
      </p>
      <div className="flex-1 px-4 pb-4 min-h-0">
        <iframe
          src={src}
          className="w-full h-full rounded border border-gray-700 bg-gray-950"
          title={`PDF preview — ${filename}`}
        />
      </div>
    </div>
  )
}
