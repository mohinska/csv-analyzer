import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

const PURPLE_COLORS = [
  "#9333ea", "#a855f7", "#c084fc", "#7c3aed",
  "#6d28d9", "#5b21b6", "#d8b4fe",
];

// Heatmap colorscale: light (low) → dark (high correlation)
const PURPLE_HEATMAP_COLORSCALE: [number, string][] = [
  [0, "#ede9fe"],     // very light lavender — low/no correlation
  [0.25, "#c4b5fd"],  // light purple
  [0.5, "#8b5cf6"],   // medium purple
  [0.75, "#6d28d9"],  // dark purple
  [1, "#3b0764"],     // deepest purple — strongest correlation
];

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { color: "#a1a1aa", size: 11 },
  title: { font: { color: "#e4e4e7", size: 14 } },
  xaxis: {
    gridcolor: "rgba(147,51,234,0.1)",
    linecolor: "rgba(147,51,234,0.2)",
    tickfont: { color: "#a1a1aa", size: 10 },
    title: { font: { color: "#a1a1aa", size: 11 } },
    zerolinecolor: "rgba(147,51,234,0.2)",
  },
  yaxis: {
    gridcolor: "rgba(147,51,234,0.1)",
    linecolor: "rgba(147,51,234,0.2)",
    tickfont: { color: "#a1a1aa", size: 10 },
    title: { font: { color: "#a1a1aa", size: 11 } },
    zerolinecolor: "rgba(147,51,234,0.2)",
  },
  legend: {
    font: { color: "#a1a1aa", size: 11 },
    bgcolor: "transparent",
  },
  colorway: PURPLE_COLORS,
  margin: { l: 50, r: 20, t: 40, b: 40 },
  autosize: true,
  bargap: 0.25,
  bargroupgap: 0.1,
  hoverlabel: {
    bgcolor: "#1e1b2e",
    bordercolor: "rgba(147,51,234,0.5)",
    font: { color: "#e4e4e7", size: 12 },
  },
};

interface PlotlyChartProps {
  spec: { data: Plotly.Data[]; layout?: Partial<Plotly.Layout> };
  interactive?: boolean;
}

function deepMergeAxis(
  base: Record<string, unknown>,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!override) return base;
  return { ...base, ...override };
}

export function PlotlyChart({ spec, interactive = false }: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !spec) return;

    const specLayout = spec.layout || {};
    const mergedLayout: Partial<Plotly.Layout> = {
      ...DARK_LAYOUT,
      ...specLayout,
      xaxis: deepMergeAxis(
        DARK_LAYOUT.xaxis as Record<string, unknown>,
        specLayout.xaxis as Record<string, unknown> | undefined,
      ) as Plotly.Layout["xaxis"],
      yaxis: deepMergeAxis(
        DARK_LAYOUT.yaxis as Record<string, unknown>,
        specLayout.yaxis as Record<string, unknown> | undefined,
      ) as Plotly.Layout["yaxis"],
      dragmode: interactive ? "zoom" : false as const,
    };

    // Apply purple colorway to traces without explicit colors
    const annotations: Plotly.Layout["annotations"] = [];
    const traces = (spec.data || []).map((trace, i) => {
      const t = { ...trace } as Record<string, unknown>;
      const marker = t.marker as Record<string, unknown> | undefined;
      const line = t.line as Record<string, unknown> | undefined;

      // Pie charts: apply purple color scale
      if (t.type === "pie" && !marker?.colors) {
        const count = ((t.values as unknown[]) || []).length;
        const colors = Array.from({ length: count }, (_, j) => PURPLE_COLORS[j % PURPLE_COLORS.length]);
        t.marker = { ...(marker || {}), colors };
        return t as Plotly.Data;
      }

      // Heatmaps: apply purple colorscale + add cell annotations
      if (t.type === "heatmap") {
        if (!t.colorscale) {
          t.colorscale = PURPLE_HEATMAP_COLORSCALE;
        }
        // Auto-annotate cells with values if not already set
        const z = t.z as number[][] | undefined;
        const x = t.x as string[] | undefined;
        const y = t.y as string[] | undefined;
        if (z && !t.texttemplate) {
          // Find z range for normalization
          let zMin = Infinity, zMax = -Infinity;
          for (const row of z) {
            for (const v of row) {
              if (v != null) {
                const n = typeof v === "number" ? v : parseFloat(String(v));
                if (!isNaN(n)) { zMin = Math.min(zMin, n); zMax = Math.max(zMax, n); }
              }
            }
          }
          const zRange = zMax - zMin || 1;

          for (let row = 0; row < z.length; row++) {
            for (let col = 0; col < (z[row]?.length || 0); col++) {
              const val = z[row][col];
              if (val == null) continue;
              const numVal = typeof val === "number" ? val : parseFloat(String(val));
              const displayText = isNaN(numVal) ? String(val) : Math.abs(numVal) < 10 ? numVal.toFixed(2) : numVal.toFixed(0);
              // Normalize value to [0,1] — higher = darker background
              const norm = isNaN(numVal) ? 0.5 : (numVal - zMin) / zRange;
              // High values have dark bg → white text; low values have light bg → black text
              const textColor = norm > 0.5 ? "#ffffff" : "#000000";
              annotations.push({
                x: x ? x[col] : col,
                y: y ? y[row] : row,
                text: displayText,
                showarrow: false,
                font: { color: textColor, size: 10, family: "Inter, system-ui, sans-serif" },
              } as Plotly.Layout["annotations"][0]);
            }
          }
        }
        return t as Plotly.Data;
      }

      const baseColor = PURPLE_COLORS[i % PURPLE_COLORS.length];
      if (!marker?.color && !line?.color) {
        t.marker = { ...(marker || {}), color: baseColor };
      }

      // Bar styling: subtle border + slight opacity for depth
      if (t.type === "bar" || (!t.type && (t as Record<string, unknown>).x && (t as Record<string, unknown>).y)) {
        const m = (t.marker || {}) as Record<string, unknown>;
        t.marker = {
          ...m,
          opacity: 0.88,
          line: { color: "rgba(255,255,255,0.08)", width: 1, ...(m.line as Record<string, unknown> || {}) },
        } as unknown as Plotly.PlotData["marker"];
      }

      return t as Plotly.Data;
    });

    // Add heatmap annotations if generated
    if (annotations.length > 0) {
      mergedLayout.annotations = [
        ...((mergedLayout.annotations as Plotly.Layout["annotations"]) || []),
        ...annotations,
      ];
    }

    Plotly.newPlot(el, traces, mergedLayout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false,
      scrollZoom: interactive,
    });

    // Hover highlight: brighten hovered point, dim others
    el.on("plotly_hover", (eventData: Plotly.PlotHoverEvent) => {
      const pt = eventData.points[0];
      if (!pt) return;
      const traceIdx = pt.curveNumber;
      const trace = traces[traceIdx] as Record<string, unknown>;
      if (trace.type === "heatmap" || trace.type === "pie") return;

      const update: Record<string, unknown> = {};
      update["marker.opacity"] = [1.0];
      Plotly.restyle(el, update, [traceIdx]);
    });

    el.on("plotly_unhover", () => {
      // Restore original opacity for all bar traces
      traces.forEach((trace, i) => {
        const t = trace as Record<string, unknown>;
        if (t.type === "heatmap" || t.type === "pie") return;
        const origOpacity = (t.type === "bar" || (!t.type && t.x && t.y)) ? 0.88 : 1.0;
        Plotly.restyle(el, { "marker.opacity": [origOpacity] }, [i]);
      });
    });

    return () => {
      Plotly.purge(el);
    };
  }, [spec, interactive]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }} />;
}
