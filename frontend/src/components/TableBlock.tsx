import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface TableBlockProps {
  title: string;
  headers: string[];
  rows: unknown[][];
}

const PREVIEW_ROWS = 5;

export function TableBlock({ title, headers, rows }: TableBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const needsExpand = rows.length > PREVIEW_ROWS;
  const displayRows = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <div>
      {title && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', marginBottom: 6 }}>
          {title}
        </div>
      )}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(147,51,234,0.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '7px 12px',
                    textAlign: 'left',
                    color: '#a78bfa',
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(147,51,234,0.2)',
                    backgroundColor: 'rgba(147,51,234,0.08)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri}>
                {(row as unknown[]).map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '6px 12px',
                      color: '#d4d4d8',
                      borderBottom: '1px solid rgba(147,51,234,0.06)',
                      whiteSpace: 'nowrap',
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
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

      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            padding: '4px 10px',
            borderRadius: 8,
            backgroundColor: 'transparent',
            border: '1px solid rgba(147,51,234,0.15)',
            color: '#a78bfa',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> Show less</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> Show all {rows.length} rows</>
          )}
        </button>
      )}
    </div>
  );
}
