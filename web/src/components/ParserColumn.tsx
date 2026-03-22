import TableRenderer from './TableRenderer'
import { useState } from 'react'
import type {
  PdfplumberResult,
  UnstructuredResult,
  DoclingResult,
  MarkerResult,
  CamelotResult,
  ParserError,
} from '@/app/page'

type ParserResult = PdfplumberResult | UnstructuredResult | DoclingResult | MarkerResult | CamelotResult | ParserError

interface Props {
  name: 'pdfplumber' | 'unstructured' | 'docling' | 'marker' | 'camelot'
  result: ParserResult | undefined
}

const COLORS: Record<string, string> = {
  pdfplumber: 'text-emerald-400',
  unstructured: 'text-violet-400',
  docling: 'text-amber-400',
  marker: 'text-sky-400',
  camelot: 'text-rose-400',
}

const ICONS: Record<string, string> = {
  pdfplumber: '🔍',
  unstructured: '🧩',
  docling: '📐',
  marker: '✏️',
  camelot: '📊',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 border-b border-gray-800 pb-1">
        {title}
      </h3>
      {children}
    </div>
  )
}

function PdfplumberColumn({ result }: { result: PdfplumberResult }) {
  return (
    <>
      <Section title="Text">
        {result.text ? (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
            {result.text}
          </pre>
        ) : (
          <p className="text-gray-500 text-xs italic">No text extracted.</p>
        )}
      </Section>
      <Section title="Tables">
        <TableRenderer tables={result.tables} parserName="pdfplumber" />
      </Section>
      <Section title="Metadata">
        {result.metadata && Object.keys(result.metadata).length > 0 ? (
          <dl className="text-xs space-y-1">
            {Object.entries(result.metadata).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-gray-500 shrink-0 w-28 truncate">{k}</dt>
                <dd className="text-gray-300 break-all">
                  {v !== null && typeof v === 'object'
                    ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                    : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-gray-500 text-xs italic">No metadata.</p>
        )}
      </Section>
    </>
  )
}

function UnstructuredColumn({ result }: { result: UnstructuredResult }) {
  const tables = result.elements?.filter((e) => e.type === 'Table') ?? []
  const nonTables = result.elements?.filter((e) => e.type !== 'Table') ?? []

  return (
    <>
      <Section title="Elements">
        {nonTables.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {nonTables.map((el, i) => (
              <div key={i} className="text-xs">
                <span className="inline-block bg-gray-800 text-gray-400 rounded px-1.5 py-0.5 text-[10px] font-mono mr-2 mb-0.5">
                  {el.type}
                </span>
                <span className="text-gray-300">{el.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-xs italic">No elements.</p>
        )}
      </Section>
      <Section title="Tables">
        <TableRenderer tables={tables.length > 0 ? tables : null} parserName="unstructured" />
      </Section>
    </>
  )
}

function DoclingColumn({ result }: { result: DoclingResult }) {
  const { sections, tables } = result.content ?? {}
  const hasLlm = !!result.llm
  type Tab = 'structured' | 'markdown' | 'chunks'
  const [tab, setTab] = useState<Tab>('structured')

  const tabClass = (t: Tab) =>
    `px-3 py-1 text-xs rounded font-medium transition-colors ${
      tab === t
        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
        : 'text-gray-500 hover:text-gray-300 border border-transparent'
    }`

  return (
    <>
      {hasLlm && (
        <div className="flex gap-1 mb-4">
          <button className={tabClass('structured')} onClick={() => setTab('structured')}>Structured</button>
          <button className={tabClass('markdown')} onClick={() => setTab('markdown')}>Markdown</button>
          <button className={tabClass('chunks')} onClick={() => setTab('chunks')}>Chunks</button>
        </div>
      )}

      {(!hasLlm || tab === 'structured') && (
        <>
          <Section title="Sections">
            {sections && sections.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {sections.map((sec, i) => (
                  <div key={i}>
                    {sec.heading && (
                      <p className="text-xs font-semibold text-gray-200 mb-0.5">{sec.heading}</p>
                    )}
                    <p className="text-xs text-gray-300 leading-relaxed">{sec.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs italic">No sections.</p>
            )}
          </Section>
          <Section title="Tables">
            <TableRenderer tables={tables} parserName="docling" />
          </Section>
        </>
      )}

      {hasLlm && tab === 'markdown' && (
        <Section title="LLM Markdown">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[32rem] overflow-y-auto bg-gray-800/50 rounded-lg p-3">
            {result.llm!.markdown}
          </pre>
        </Section>
      )}

      {hasLlm && tab === 'chunks' && (
        <Section title="LLM Chunks">
          {result.llm!.chunks.length > 0 ? (
            <div className="space-y-3 max-h-[32rem] overflow-y-auto">
              {result.llm!.chunks.map((chunk, i) => (
                <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  {chunk.meta.headings.length > 0 && (
                    <p className="text-[10px] text-gray-500 mb-1.5 truncate">
                      {chunk.meta.headings.join(' › ')}
                    </p>
                  )}
                  <p className="text-xs text-gray-300 leading-relaxed">{chunk.text}</p>
                  <div className="mt-2">
                    <span className="inline-block text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5 font-mono">
                      p.{chunk.meta.page}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-xs italic">No chunks.</p>
          )}
        </Section>
      )}
    </>
  )
}

function MarkerColumn({ result }: { result: MarkerResult }) {
  return (
    <Section title="Markdown Output">
      {result.markdown ? (
        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[32rem] overflow-y-auto bg-gray-800/50 rounded-lg p-3">
          {result.markdown}
        </pre>
      ) : (
        <p className="text-gray-500 text-xs italic">No markdown output.</p>
      )}
    </Section>
  )
}

function CamelotColumn({ result }: { result: CamelotResult }) {
  if (!result.tables || result.tables.length === 0) {
    return <p className="text-gray-500 text-xs italic">No tables found.</p>
  }

  return (
    <div className="space-y-5">
      {result.tables.map((table, i) => (
        <Section key={i} title={`Table ${i + 1}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5 font-mono">
              p.{table.page}
            </span>
            <span className={`text-[10px] rounded px-1.5 py-0.5 font-mono border ${
              table.flavor === 'lattice'
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
            }`}>
              {table.flavor}
            </span>
            <span className="text-[10px] text-gray-500 font-mono ml-auto">
              {table.accuracy.toFixed(1)}% accuracy
            </span>
          </div>
          {table.data && table.data.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-800">
                    {table.data[0].map((cell, ci) => (
                      <th key={ci} className="px-2 py-1.5 text-left text-gray-300 font-semibold border-b border-gray-700 whitespace-nowrap">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.data.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-2 py-1.5 text-gray-300 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-xs italic">Empty table.</p>
          )}
        </Section>
      ))}
    </div>
  )
}

export default function ParserColumn({ name, result }: Props) {
  const color = COLORS[name] ?? 'text-gray-300'
  const icon = ICONS[name] ?? '📄'

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 border-b border-gray-700 shrink-0">
        <span className={`font-semibold text-sm ${color}`}>
          {icon} {name}
        </span>
        {result && result.status === 'ok' && 'duration_ms' in result && (
          <div className="flex items-center gap-2">
            {name === 'marker' && 'images' in result && (
              <span className="text-xs text-gray-500 font-mono">
                {(result as MarkerResult).images} img{(result as MarkerResult).images !== 1 ? 's' : ''}
              </span>
            )}
            {name === 'camelot' && 'total_tables' in result && (
              <span className="text-xs text-gray-500 font-mono">
                {(result as CamelotResult).total_tables} tbl{(result as CamelotResult).total_tables !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-gray-500 font-mono">
              {result.duration_ms} ms
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {!result && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Spinner /> Parsing…
          </div>
        )}

        {result?.status === 'error' && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">
            <p className="font-semibold mb-1">Parser failed</p>
            <p className="text-xs font-mono">{(result as ParserError).error}</p>
          </div>
        )}

        {result?.status === 'ok' && name === 'pdfplumber' && (
          <PdfplumberColumn result={result as PdfplumberResult} />
        )}
        {result?.status === 'ok' && name === 'unstructured' && (
          <UnstructuredColumn result={result as UnstructuredResult} />
        )}
        {result?.status === 'ok' && name === 'docling' && (
          <DoclingColumn result={result as DoclingResult} />
        )}
        {result?.status === 'ok' && name === 'marker' && (
          <MarkerColumn result={result as MarkerResult} />
        )}
        {result?.status === 'ok' && name === 'camelot' && (
          <CamelotColumn result={result as CamelotResult} />
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
