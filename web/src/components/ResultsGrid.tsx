'use client'

import { useState } from 'react'
import ParserColumn from './ParserColumn'
import type { ParseResponse } from '@/app/page'

const ALL_PARSERS = ['pdfplumber', 'unstructured', 'docling', 'marker', 'camelot'] as const
type ParserName = typeof ALL_PARSERS[number]

interface Props {
  results: ParseResponse
  visibleParsers: Set<ParserName>
}

export default function ResultsGrid({ results, visibleParsers }: Props) {
  const [activeTab, setActiveTab] = useState<ParserName>('pdfplumber')

  // Detect 0-page PDF via pdfplumber metadata
  const pdfplumberResult = results.parsers.pdfplumber
  const pageCount =
    pdfplumberResult?.status === 'ok' &&
    'metadata' in pdfplumberResult &&
    typeof pdfplumberResult.metadata?.pages === 'number'
      ? pdfplumberResult.metadata.pages
      : null

  const visibleList = ALL_PARSERS.filter((p) => visibleParsers.has(p))
  const colCount = visibleList.length

  // Grid class based on visible count
  const gridCols =
    colCount === 1 ? 'md:grid-cols-1' :
    colCount === 2 ? 'md:grid-cols-2' :
    colCount === 3 ? 'md:grid-cols-3' :
    colCount === 4 ? 'md:grid-cols-4' :
    'md:grid-cols-5'

  // Active tab: if current tab is hidden, fallback to first visible
  const effectiveTab: ParserName = visibleParsers.has(activeTab)
    ? activeTab
    : visibleList[0] ?? 'pdfplumber'

  return (
    <div className="h-full flex flex-col">
      {/* Filename bar */}
      <div className="px-6 py-2 bg-gray-900/80 border-b border-gray-800 text-xs text-gray-500 shrink-0">
        📄 <span className="text-gray-300 font-mono truncate max-w-xl inline-block align-middle">{results.filename}</span>
      </div>

      {/* 0-page warning */}
      {pageCount === 0 && (
        <div className="px-6 py-2 bg-yellow-900/30 border-b border-yellow-700 text-xs text-yellow-300 shrink-0">
          ⚠️ This PDF has 0 pages — all parsers will return empty results.
        </div>
      )}

      {colCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Select at least one parser to view results.
        </div>
      ) : (
        <>
          {/* Mobile tab switcher (visible < md) */}
          <div className="md:hidden flex border-b border-gray-800 bg-gray-900 shrink-0">
            {visibleList.map((p) => (
              <button
                key={p}
                onClick={() => setActiveTab(p)}
                className={[
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  effectiveTab === p
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300',
                ].join(' ')}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Desktop: dynamic column grid */}
          <div className={`hidden md:grid ${gridCols} gap-4 flex-1 overflow-hidden p-4 min-h-0`}>
            {visibleList.map((p) => (
              <ParserColumn
                key={p}
                name={p}
                result={results.parsers[p]}
              />
            ))}
          </div>

          {/* Mobile: single column */}
          <div className="md:hidden flex-1 overflow-hidden p-4 min-h-0">
            <ParserColumn
              name={effectiveTab}
              result={results.parsers[effectiveTab]}
            />
          </div>
        </>
      )}
    </div>
  )
}
