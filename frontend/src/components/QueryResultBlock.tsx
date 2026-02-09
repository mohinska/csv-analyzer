import { useState } from "react";
import { ChevronDown, ChevronRight, Database } from "lucide-react";

interface QueryResultBlockProps {
  description: string;
  query: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  isError: boolean;
}

export function QueryResultBlock({ description, query, columns, rows, rowCount, isError }: QueryResultBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: 12,
        border: isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(147,51,234,0.2)',
        backgroundColor: isError ? 'rgba(239,68,68,0.05)' : 'rgba(147,51,234,0.05)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: isError ? '#f87171' : '#a78bfa',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        <Database className="w-3.5 h-3.5 shrink-0" />
        <span style={{ flex: 1 }}>{description}</span>
        <span style={{ color: '#71717a', fontSize: 11 }}>
          {isError ? 'Error' : `${rowCount} rows`}
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 10px', fontSize: 12 }}>
          {/* SQL Query */}
          <pre
            style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              padding: '8px 10px',
              color: '#a1a1aa',
              fontSize: 11,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              marginBottom: 8,
            }}
          >
            {query}
          </pre>

          {/* Result table */}
          {columns.length > 0 && rows.length > 0 && (
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(147,51,234,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#a78bfa',
                          fontWeight: 600,
                          borderBottom: '1px solid rgba(147,51,234,0.15)',
                          backgroundColor: 'rgba(147,51,234,0.08)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {(row as unknown[]).map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: '5px 10px',
                            color: '#d4d4d8',
                            borderBottom: '1px solid rgba(147,51,234,0.06)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cell === null ? <span style={{ color: '#71717a', fontStyle: 'italic' }}>null</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
