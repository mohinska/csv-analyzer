import { useState } from "react";
import { ChevronDown, ChevronRight, Database } from "lucide-react";
import { QueryResultBlock } from "./QueryResultBlock";

interface QueryResult {
  description: string;
  query: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  isError: boolean;
}

interface QueryResultGroupProps {
  queries: QueryResult[];
}

export function QueryResultGroup({ queries }: QueryResultGroupProps) {
  const [expanded, setExpanded] = useState(false);

  if (queries.length === 0) return null;

  // Single query — just show it directly
  if (queries.length === 1) {
    return (
      <QueryResultBlock {...queries[0]} />
    );
  }

  const errorCount = queries.filter(q => q.isError).length;
  const successCount = queries.length - errorCount;

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid rgba(147,51,234,0.15)',
        backgroundColor: 'rgba(147,51,234,0.03)',
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
          color: '#a78bfa',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        <Database className="w-3.5 h-3.5 shrink-0" />
        <span style={{ flex: 1 }}>
          Ran {queries.length} queries
          {errorCount > 0 && <span style={{ color: '#f87171' }}> ({errorCount} failed)</span>}
          {successCount > 0 && ` — ${successCount} successful`}
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queries.map((q, i) => (
            <QueryResultBlock key={i} {...q} />
          ))}
        </div>
      )}
    </div>
  );
}
