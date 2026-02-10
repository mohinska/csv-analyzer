import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Upload, Filter, X, Maximize2 } from "lucide-react";

interface FileInfo {
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

interface DataTabProps {
  fileInfo: FileInfo | null;
  onViewFullData?: () => void;
}

const RENDER_CHUNK = 200;

export function DataTab({ fileInfo, onViewFullData }: DataTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterDropdownCol, setFilterDropdownCol] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset visible count when data/search/sort changes
  useEffect(() => {
    setVisibleCount(RENDER_CHUNK);
  }, [searchQuery, sortColumn, sortDirection, fileInfo?.preview]);

  // Infinite scroll: load more rows when user scrolls near bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount(prev => prev + RENDER_CHUNK);
    }
  }, []);

  // Get unique values for a column (for filter dropdown)
  const getUniqueValues = useCallback((col: string) => {
    const rows = fileInfo?.preview || [];
    const uniqueSet = new Set<string>();
    for (const row of rows) {
      uniqueSet.add(String(row[col] ?? "(empty)"));
    }
    return Array.from(uniqueSet).sort();
  }, [fileInfo?.preview]);

  // Check if any column filters are active
  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  // Toggle a filter value for a column
  const toggleFilterValue = (col: string, value: string) => {
    setColumnFilters((prev) => {
      const current = prev[col] ? new Set(prev[col]) : new Set<string>();
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      if (current.size === 0) {
        const { [col]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [col]: current };
    });
  };

  // Clear filter for a specific column
  const clearColumnFilter = (col: string) => {
    setColumnFilters((prev) => {
      const { [col]: _, ...rest } = prev;
      return rest;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({});
    setSearchQuery("");
  };

  // If no file uploaded, show placeholder
  if (!fileInfo) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-1 p-5">
        <p className="text-[12px] text-center" style={{ fontWeight: 470, color: '#71717a' }}>
          No data loaded
        </p>
      </div>
    );
  }

  const columns = fileInfo.columns;
  const data = fileInfo.preview;

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredData = data.filter((row) => {
    // Apply column filters
    for (const [col, allowedValues] of Object.entries(columnFilters)) {
      const cellVal = String(row[col] ?? "(empty)");
      if (!allowedValues.has(cellVal)) return false;
    }
    // Apply search
    if (!searchQuery) return true;
    return Object.values(row).some((val) =>
      String(val).toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const displayedData = sortedData.slice(0, visibleCount);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1e1b2e' }}>
      {/* Search Row */}
      <div className="flex items-center gap-2 px-5 py-3 shrink-0">
        <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>
          {fileInfo.row_count}×{fileInfo.column_count}
        </span>
        <div
          className="flex-1 flex items-center gap-1 rounded-full px-2 h-[24px]"
          style={{ backgroundColor: 'rgba(15,13,25,0.6)', border: '1px solid rgba(147,51,234,0.15)' }}
        >
          <Search className="w-[13px] h-[13px]" style={{ color: '#a1a1aa' }} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ fontWeight: 510, color: '#e4e4e7' }}
          />
        </div>
      </div>

      {/* Active filters bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1.5 px-5 pb-2 shrink-0 flex-wrap">
          {Object.entries(columnFilters).map(([col, values]) => (
            <div
              key={col}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(147,51,234,0.15)', border: '1px solid rgba(147,51,234,0.25)' }}
            >
              <span className="text-[10px]" style={{ fontWeight: 510, color: '#e4e4e7' }}>
                {col}: {values.size} selected
              </span>
              <button
                onClick={() => clearColumnFilter(col)}
                className="flex items-center justify-center"
                style={{ color: '#a1a1aa' }}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ fontWeight: 510, color: '#a1a1aa', border: '1px solid rgba(147,51,234,0.15)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e4e4e7'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto custom-scrollbar"
        style={{ backgroundColor: '#1e1b2e' }}
      >
        <table className="w-full border-collapse min-w-max min-h-full" style={{ backgroundColor: '#1e1b2e' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={col}
                  className={`h-[28px] px-2 text-left select-none ${
                    i > 0 ? "border-l" : "pl-[12px]"
                  } border-b`}
                  style={{
                    minWidth: 80,
                    backgroundColor: '#161328',
                    borderColor: 'rgba(147,51,234,0.12)',
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[11px] truncate cursor-pointer flex-1"
                      style={{ fontWeight: 700, color: '#e4e4e7' }}
                      onClick={() => handleSort(col)}
                    >
                      {col}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <ChevronDown
                        className={`w-[9px] h-[9px] transition-transform cursor-pointer ${
                          sortColumn === col && sortDirection === "asc" ? "rotate-180" : ""
                        }`}
                        style={{ color: sortColumn === col ? '#9333ea' : '#a1a1aa' }}
                        onClick={() => handleSort(col)}
                      />
                      <button
                        ref={(el) => { filterBtnRefs.current[col] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilterDropdownCol(filterDropdownCol === col ? null : col);
                          setFilterSearch("");
                        }}
                        className="flex items-center justify-center w-[14px] h-[14px] rounded"
                        style={{
                          color: columnFilters[col] ? '#9333ea' : '#52525b',
                          backgroundColor: columnFilters[col] ? 'rgba(147,51,234,0.15)' : 'transparent',
                        }}
                      >
                        <Filter className="w-[8px] h-[8px]" />
                      </button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedData.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {columns.map((col, i) => (
                  <td
                    key={col}
                    className={`h-[28px] px-2 text-[11px] ${
                      i > 0 ? "border-l" : "pl-[12px]"
                    } border-b`}
                    style={{
                      fontWeight: 400,
                      color: '#e4e4e7',
                      borderColor: 'rgba(147,51,234,0.1)',
                    }}
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer — always visible */}
      <div className="shrink-0 px-5 py-3 flex items-center justify-between relative z-20" style={{ borderTop: '1px solid rgba(147,51,234,0.12)' }}>
        <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
          {hasActiveFilters || searchQuery
            ? `${sortedData.length} of ${data.length} rows`
            : `${fileInfo.preview.length} rows (preview)`
          }
          {displayedData.length < sortedData.length && ` (showing ${displayedData.length})`}
        </p>
        {onViewFullData && (
          <button
            onClick={onViewFullData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
            style={{
              backgroundColor: 'rgba(147,51,234,0.12)',
              border: '1px solid rgba(147,51,234,0.25)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.2)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.25)'; }}
          >
            <Maximize2 className="w-3.5 h-3.5" style={{ color: '#e4e4e7' }} />
            <span className="text-[11px]" style={{ fontWeight: 510, color: '#e4e4e7' }}>View Full</span>
          </button>
        )}
      </div>

      {/* Column filter dropdown — portalled */}
      {filterDropdownCol && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setFilterDropdownCol(null)}
          />
          <div
            className="rounded-lg py-1"
            style={{
              position: 'fixed',
              zIndex: 9999,
              top: (filterBtnRefs.current[filterDropdownCol]?.getBoundingClientRect().bottom ?? 0) + 4,
              left: filterBtnRefs.current[filterDropdownCol]?.getBoundingClientRect().left ?? 0,
              width: 200,
              maxHeight: 280,
              backgroundColor: '#252131',
              border: '1px solid rgba(113,113,122,0.3)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
          >
            {/* Filter search */}
            <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(147,51,234,0.1)' }}>
              <input
                type="text"
                placeholder="Search values..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full bg-transparent text-[11px] outline-none"
                style={{ fontWeight: 450, color: '#e4e4e7' }}
                autoFocus
              />
            </div>
            {/* Filter actions */}
            <div className="px-2 py-1 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(147,51,234,0.1)' }}>
              <span className="text-[10px]" style={{ color: '#a1a1aa', fontWeight: 510 }}>
                {filterDropdownCol}
              </span>
              {columnFilters[filterDropdownCol] && (
                <button
                  onClick={() => { clearColumnFilter(filterDropdownCol); setFilterDropdownCol(null); }}
                  className="text-[10px]"
                  style={{ color: '#9333ea', fontWeight: 510 }}
                >
                  Clear
                </button>
              )}
            </div>
            {/* Values list */}
            <div className="flex-1 overflow-auto custom-scrollbar" style={{ minHeight: 0 }}>
              {(() => {
                const uniqueVals = getUniqueValues(filterDropdownCol);
                const filtered = filterSearch
                  ? uniqueVals.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
                  : uniqueVals;
                const currentFilter = columnFilters[filterDropdownCol];
                return filtered.slice(0, 100).map((val) => (
                  <button
                    key={val}
                    onClick={() => toggleFilterValue(filterDropdownCol, val)}
                    className="w-full px-2 py-1 text-left text-[11px] flex items-center gap-2"
                    style={{ color: '#e4e4e7' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div
                      className="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center"
                      style={{
                        border: currentFilter?.has(val) ? '1px solid #9333ea' : '1px solid rgba(113,113,122,0.4)',
                        backgroundColor: currentFilter?.has(val) ? '#9333ea' : 'transparent',
                      }}
                    >
                      {currentFilter?.has(val) && (
                        <span style={{ fontSize: 9, color: '#fff', lineHeight: 1 }}>&#10003;</span>
                      )}
                    </div>
                    <span className="truncate">{val}</span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
