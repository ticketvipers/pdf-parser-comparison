/**
 * TableRenderer — handles multiple table formats per parser:
 *  - pdfplumber: unknown[][][] (array of tables; each table is rows of cells)
 *  - unstructured: raw text string (table as text)
 *  - docling: Array<{ caption?: string; data: unknown[][] }>
 *  - generic: 2D array (rows x cols)
 */

type CellValue = string | number | null | undefined

type Table2D = CellValue[][]
type PdfplumberTables = Table2D[]
type DoclingTable = { caption?: string; data: Table2D }
type DoclingTables = DoclingTable[]

function render2DTable(rows: Table2D, key: number) {
  if (!rows || rows.length === 0) return null

  // If only 1 row, treat all cells as body data (not a header row)
  if (rows.length === 1) {
    return (
      <div key={key} className="overflow-x-auto mb-4">
        <table className="min-w-full text-xs border border-gray-700 rounded">
          <tbody>
            <tr className="bg-gray-900">
              {rows[0].map((cell, ci) => (
                <td key={ci} className="px-2 py-1 border border-gray-700 text-gray-200 whitespace-pre-wrap break-words max-w-xs">
                  {String(cell ?? '')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const [header, ...body] = rows
  return (
    <div key={key} className="overflow-x-auto mb-4">
      <table className="min-w-full text-xs border border-gray-700 rounded">
        <thead className="bg-gray-800">
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="px-2 py-1 border border-gray-700 text-left text-gray-300 font-semibold whitespace-nowrap">
                {String(cell ?? '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/60'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 border border-gray-700 text-gray-200 whitespace-pre-wrap break-words max-w-xs">
                  {String(cell ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface TableRendererProps {
  tables: unknown
  parserName: 'pdfplumber' | 'unstructured' | 'docling' | string
}

export default function TableRenderer({ tables, parserName }: TableRendererProps) {
  if (!tables) return <p className="text-gray-500 text-xs italic">No tables found.</p>

  // pdfplumber: unknown[][][] — array of tables, each table is rows of cells
  if (parserName === 'pdfplumber') {
    const tbls = tables as PdfplumberTables
    if (!Array.isArray(tbls) || tbls.length === 0) {
      return <p className="text-gray-500 text-xs italic">No tables found.</p>
    }
    return (
      <div>
        {tbls.map((table, i) => {
          if (!Array.isArray(table) || table.length === 0) return null
          // table may be unknown[][] — cast rows
          const rows = table.map((row) =>
            Array.isArray(row) ? (row as CellValue[]) : [String(row)]
          )
          return render2DTable(rows, i)
        })}
      </div>
    )
  }

  // unstructured: tables are elements of type "Table" with text string
  // When called from ParserColumn, unstructured tables are already filtered elements
  if (parserName === 'unstructured') {
    if (typeof tables === 'string') {
      return (
        <div className="bg-gray-800 rounded p-2 text-xs text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
          {tables}
        </div>
      )
    }
    if (Array.isArray(tables)) {
      if (tables.length === 0) return <p className="text-gray-500 text-xs italic">No tables found.</p>
      return (
        <div className="space-y-3">
          {(tables as Array<{ type: string; text: string }>).map((el, i) => (
            <div key={i} className="bg-gray-800 rounded p-2 text-xs text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
              {el.text ?? String(el)}
            </div>
          ))}
        </div>
      )
    }
    return <p className="text-gray-500 text-xs italic">No tables found.</p>
  }

  // docling: Array<{ caption?: string; data: unknown[][] }>
  if (parserName === 'docling') {
    if (!Array.isArray(tables) || tables.length === 0) {
      return <p className="text-gray-500 text-xs italic">No tables found.</p>
    }
    return (
      <div>
        {(tables as DoclingTables).map((t, i) => (
          <div key={i} className="mb-4">
            {t.caption && (
              <p className="text-xs text-gray-400 italic mb-1">{t.caption}</p>
            )}
            {Array.isArray(t.data) && t.data.length > 0
              ? render2DTable(t.data.map((row) => Array.isArray(row) ? row as CellValue[] : [String(row)]), i)
              : <p className="text-gray-500 text-xs italic">Empty table.</p>
            }
          </div>
        ))}
      </div>
    )
  }

  // Generic fallback: try to render as 2D array, then as text
  if (Array.isArray(tables)) {
    if (tables.length === 0) return <p className="text-gray-500 text-xs italic">No tables found.</p>
    // Check if it looks like 2D
    if (Array.isArray(tables[0])) {
      return render2DTable(tables as Table2D, 0) ?? <p className="text-gray-500 text-xs italic">No tables found.</p>
    }
    return (
      <pre className="text-xs text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(tables, null, 2)}
      </pre>
    )
  }

  return (
    <pre className="text-xs text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(tables, null, 2)}
    </pre>
  )
}
