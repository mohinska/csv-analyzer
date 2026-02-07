import { useState } from "react";
import { Search, ChevronDown, Upload } from "lucide-react";

interface FileInfo {
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

interface DataTabProps {
  fileInfo: FileInfo | null;
  dataVersion: "current" | "original";
  onVersionChange: (version: "current" | "original") => void;
}

export function DataTab({ fileInfo, dataVersion, onVersionChange }: DataTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);

  // If no file uploaded, show placeholder
  if (!fileInfo) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-5">
        <Upload className="w-10 h-10 text-[#8E8E93]" />
        <p className="text-[13px] text-[#8E8E93] text-center" style={{ fontWeight: 510 }}>
          No data loaded
        </p>
        <p className="text-[11px] text-[#8E8E93] text-center">
          Upload a CSV file to see your data here
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Version Dropdown + Search Row */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0">
        <div className="relative shrink-0">
          <button
            onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
          >
            <span className="text-[11px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 510 }}>
              {dataVersion === "current" ? "Current" : "Initial"}
            </span>
            <span className="text-[10px] text-[#8E8E93]">
              {fileInfo.row_count}×{fileInfo.column_count}
            </span>
            <ChevronDown className="w-3 h-3 text-[#8E8E93]" />
          </button>
          {versionDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setVersionDropdownOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-black/10 py-1 min-w-[130px]">
                <button
                  onClick={() => {
                    onVersionChange("original");
                    setVersionDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] hover:bg-black/5 flex items-center justify-between ${
                    dataVersion === "original" ? "text-[#08f]" : "text-[rgba(0,0,0,0.85)]"
                  }`}
                >
                  <span style={{ fontWeight: 510 }}>Initial</span>
                  <span className="text-[#8E8E93] text-[10px]">original</span>
                </button>
                <button
                  onClick={() => {
                    onVersionChange("current");
                    setVersionDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] hover:bg-black/5 flex items-center justify-between ${
                    dataVersion === "current" ? "text-[#08f]" : "text-[rgba(0,0,0,0.85)]"
                  }`}
                >
                  <span style={{ fontWeight: 510 }}>Current</span>
                  <span className="text-[#8E8E93] text-[10px]">transformed</span>
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1 bg-white rounded-full px-2 h-[24px] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]">
          <Search className="w-[13px] h-[13px] text-black" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-[#4c4c4c] outline-none placeholder:text-[#4c4c4c]"
            style={{ fontWeight: 510 }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full border-collapse min-w-max">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={col}
                  className={`h-[28px] px-2 text-left cursor-pointer select-none ${
                    i > 0 ? "border-l border-[rgba(0,0,0,0.1)]" : "pl-[12px]"
                  } border-b border-[rgba(0,0,0,0.05)] bg-[rgba(245,245,245,0.67)]`}
                  style={{ minWidth: 80 }}
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[11px] text-[rgba(0,0,0,0.85)] truncate"
                      style={{ fontWeight: 700 }}
                    >
                      {col}
                    </span>
                    <ChevronDown
                      className={`w-[9px] h-[9px] text-[rgba(0,0,0,0.5)] transition-transform shrink-0 ${
                        sortColumn === col && sortDirection === "asc" ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-black/[0.02]">
                {columns.map((col, i) => (
                  <td
                    key={col}
                    className={`h-[28px] px-2 text-[11px] text-[rgba(0,0,0,0.85)] ${
                      i > 0 ? "border-l border-[rgba(0,0,0,0.05)]" : "pl-[12px]"
                    } border-b border-[rgba(0,0,0,0.03)]`}
                    style={{ fontWeight: 400 }}
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="shrink-0 px-5 py-2 border-t border-[rgba(0,0,0,0.05)]">
        <p className="text-[10px] text-[#8E8E93]">
          Showing {sortedData.length} of {fileInfo.row_count} rows (preview)
        </p>
      </div>
    </div>
  );
}
