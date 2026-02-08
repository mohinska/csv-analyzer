import { useState } from "react";
import { Search, BarChart3, Trash2, Download } from "lucide-react";
import { MarkdownLatex } from "./MarkdownLatex";
import { Chart, ChartConfig } from "./Chart";

export interface PlotData {
  id: number;
  title: string;
  columnsUsed: string;
  summary: string;
  insights: string;
  path?: string;
  chartConfig?: ChartConfig;
  chartData?: Record<string, unknown>[];
}

interface PlotsTabProps {
  plots: PlotData[];
  onViewPlot?: (plot: PlotData) => void;
  onDeletePlot?: (plotId: number) => void;
  onSavePlot?: (plot: PlotData) => void;
}

function PlotChart({ plot }: { plot: PlotData }) {
  if (plot.chartConfig && plot.chartData && plot.chartData.length > 0) {
    return <Chart config={plot.chartConfig} data={plot.chartData} thumbnail />;
  }

  // Fallback placeholder
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#161328' }}>
      <BarChart3 className="w-8 h-8" style={{ color: '#3f3a4a' }} />
    </div>
  );
}

function ExpandedPlot({
  plot,
  onCollapse,
}: {
  plot: PlotData;
  onCollapse: () => void;
}) {
  return (
    <div
      className="rounded-[20px] shrink-0 w-full overflow-hidden"
      style={{ backgroundColor: '#1a1625', border: '1px solid rgba(147,51,234,0.12)' }}
    >
      <div className="flex flex-col gap-2.5 px-5 py-2.5">
        {/* Chart */}
        <div
          className="w-full aspect-[4/3] rounded-[10px] overflow-hidden"
          style={{ border: '1px solid rgba(147,51,234,0.12)', backgroundColor: '#161328' }}
        >
          <PlotChart plot={plot} />
        </div>

        {/* Title */}
        <p className="text-[15px]" style={{ fontWeight: 700, color: '#e4e4e7' }}>
          {plot.title}
        </p>

        {/* Details row */}
        <div className="flex gap-5">
          {plot.summary && (
            <div className="flex-1 flex flex-col gap-1">
              <p className="text-[13px]" style={{ fontWeight: 510, color: '#e4e4e7' }}>
                Summary
              </p>
              <div className="text-[10px]" style={{ color: '#a1a1aa' }}>
                <MarkdownLatex>{plot.summary}</MarkdownLatex>
              </div>
            </div>
          )}
          {plot.columnsUsed && (
            <div className="flex-1 flex flex-col gap-1">
              <p className="text-[13px]" style={{ fontWeight: 510, color: '#e4e4e7' }}>
                Columns
              </p>
              <p className="text-[10px]" style={{ color: '#a1a1aa' }}>{plot.columnsUsed}</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-[5px] justify-end">
          <button
            onClick={onCollapse}
            className="h-[24px] px-4 rounded-md text-[13px] hover:opacity-90 transition-all"
            style={{
              fontWeight: 510,
              color: '#fff',
              background: 'linear-gradient(135deg, rgba(63,58,74,0.7) 0%, rgba(50,45,65,0.8) 100%)',
              border: '1px solid rgba(147,51,234,0.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PlotCard({
  plot,
  onView,
  onDelete,
  onSave,
}: {
  plot: PlotData;
  onView: () => void;
  onDelete?: () => void;
  onSave?: () => void;
}) {
  return (
    <div
      className="rounded-[20px] shrink-0 w-full overflow-hidden"
      style={{ backgroundColor: '#1a1625', border: '1px solid rgba(147,51,234,0.12)' }}
    >
      <div className="flex gap-2.5 items-start p-2.5">
        {/* Thumbnail */}
        <div
          className="w-[80px] h-[80px] shrink-0 rounded-[10px] overflow-hidden"
          style={{ border: '1px solid rgba(147,51,234,0.12)', backgroundColor: '#161328' }}
        >
          <PlotChart plot={plot} />
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col gap-1 items-end">
          <p
            className="text-[15px] w-full"
            style={{ fontWeight: 700, color: '#e4e4e7' }}
          >
            {plot.title}
          </p>
          <p className="text-[10px] w-full" style={{ color: '#a1a1aa' }}>
            {plot.columnsUsed || plot.summary || "Generated visualization"}
          </p>
          <div className="flex gap-[5px]">
            <button
              onClick={onView}
              className="h-[24px] px-4 rounded-md text-[13px] hover:opacity-90 transition-all"
              style={{
                fontWeight: 510,
                color: '#fff',
                background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                border: '1px solid rgba(147,51,234,0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              View
            </button>
            {onSave && (
              <button
                onClick={onSave}
                className="h-[24px] w-[24px] rounded-md flex items-center justify-center hover:opacity-90 transition-all"
                style={{
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(147,51,234,0.08)',
                  border: '1px solid rgba(147,51,234,0.2)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.2)'; e.currentTarget.style.color = '#e4e4e7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.08)'; e.currentTarget.style.color = '#a1a1aa'; }}
                title="Save as PNG"
              >
                <Download className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="h-[24px] w-[24px] rounded-md flex items-center justify-center hover:opacity-90 transition-all"
                style={{
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#a1a1aa'; }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlotsTab({ plots, onViewPlot, onDeletePlot, onSavePlot }: PlotsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPlots = plots.filter((plot) => {
    if (!searchQuery) return true;
    return (
      plot.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (plot.columnsUsed && plot.columnsUsed.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Empty state
  if (plots.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(147,51,234,0.3) 0%, rgba(107,33,168,0.4) 100%)',
            border: '1px solid rgba(147,51,234,0.2)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <BarChart3 className="w-8 h-8" style={{ color: '#a1a1aa' }} />
        </div>
        <p className="text-[15px] mb-1" style={{ fontWeight: 600, color: '#e4e4e7' }}>
          No plots yet
        </p>
        <p className="text-[13px]" style={{ color: '#a1a1aa' }}>
          Plots will appear here as they are generated in the chat
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="flex items-center px-5 py-3 shrink-0">
        <div
          className="flex-1 flex items-center gap-1 rounded-full px-2 h-[24px]"
          style={{ backgroundColor: '#161328', border: '1px solid rgba(147,51,234,0.15)' }}
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

      {/* Plot cards */}
      <div className="flex-1 overflow-auto custom-scrollbar px-5 pb-5">
        <div className="flex flex-col gap-2.5">
          {filteredPlots.map((plot) => (
            <PlotCard
              key={plot.id}
              plot={plot}
              onView={() => onViewPlot?.(plot)}
              onSave={onSavePlot ? () => onSavePlot(plot) : undefined}
              onDelete={onDeletePlot ? () => onDeletePlot(plot.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
