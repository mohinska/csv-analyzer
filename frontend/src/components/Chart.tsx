import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from "recharts";

export interface ChartConfig {
  chart_type: string;
  x_key: string;
  y_key: string;
  color_key?: string | null;
  series?: string[] | null;
}

export interface ChartTheme {
  color?: string;
  backgroundColor?: string;
}

interface ChartProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  thumbnail?: boolean;
  theme?: ChartTheme;
}

const CHART_COLORS = [
  "#9333ea", "#a855f7", "#c084fc", "#7c3aed",
  "#6d28d9", "#5b21b6", "#d8b4fe",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#252131",
    border: "1px solid rgba(147,51,234,0.3)",
    borderRadius: 8,
    fontSize: 11,
  },
  labelStyle: { color: "#e4e4e7" },
  itemStyle: { color: "#a1a1aa" },
};

const axisProps = {
  tick: { fill: "#a1a1aa", fontSize: 10 },
  axisLine: { stroke: "rgba(147,51,234,0.2)" },
  tickLine: false as const,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function BoxPlotShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || !width) return null;

  const min = Number(payload.min);
  const q1 = Number(payload.q1);
  const median = Number(payload.median);
  const q3 = Number(payload.q3);
  const max = Number(payload.max);
  const iqr = q3 - q1;
  if (iqr === 0 && height === 0) return null;

  const ppu = iqr !== 0 ? height / iqr : 1;
  const cx = x + width / 2;

  const yQ3 = y;
  const yQ1 = y + height;
  const yMedian = yQ1 - (median - q1) * ppu;
  const yMin = yQ1 + (q1 - min) * ppu;
  const yMax = yQ3 - (max - q3) * ppu;
  const capW = Math.min(width * 0.5, 20);

  return (
    <g>
      <rect x={x + 2} y={yQ3} width={width - 4} height={Math.max(height, 1)} fill="#9333ea" rx={3} opacity={0.75} />
      <line x1={x + 2} y1={yMedian} x2={x + width - 2} y2={yMedian} stroke="#fff" strokeWidth={2} />
      <line x1={cx} y1={yQ1} x2={cx} y2={yMin} stroke="#c084fc" strokeWidth={1.5} />
      <line x1={cx - capW / 2} y1={yMin} x2={cx + capW / 2} y2={yMin} stroke="#c084fc" strokeWidth={1.5} />
      <line x1={cx} y1={yQ3} x2={cx} y2={yMax} stroke="#c084fc" strokeWidth={1.5} />
      <line x1={cx - capW / 2} y1={yMax} x2={cx + capW / 2} y2={yMax} stroke="#c084fc" strokeWidth={1.5} />
    </g>
  );
}

function BoxTooltip({ active, payload }: any) {
  if (!active || !payload?.[1]?.payload) return null;
  const d = payload[1].payload;
  return (
    <div style={{
      backgroundColor: "#252131",
      border: "1px solid rgba(147,51,234,0.3)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
    }}>
      <p style={{ color: "#e4e4e7", fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
      <p style={{ color: "#a1a1aa" }}>Max: {Number(d.max).toFixed(2)}</p>
      <p style={{ color: "#a1a1aa" }}>Q3: {Number(d.q3).toFixed(2)}</p>
      <p style={{ color: "#a1a1aa" }}>Median: {Number(d.median).toFixed(2)}</p>
      <p style={{ color: "#a1a1aa" }}>Q1: {Number(d.q1).toFixed(2)}</p>
      <p style={{ color: "#a1a1aa" }}>Min: {Number(d.min).toFixed(2)}</p>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function Chart({ config, data, thumbnail = false, theme }: ChartProps) {
  const mainColor = theme?.color || "#9333ea";
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-[11px]" style={{ color: "#a1a1aa" }}>No data</p>
      </div>
    );
  }

  const { chart_type, x_key, y_key } = config;

  // Determine actual y key - data might use "count" instead of y_key
  const firstRow = data[0];
  const actualYKey = firstRow?.[y_key] !== undefined ? y_key : "count";

  // Axis labels (hidden in thumbnail mode)
  const axisLabelStyle = { fill: "#a1a1aa", fontSize: 11 };
  const xAxisLabel = thumbnail ? undefined : { value: x_key, position: "insideBottom" as const, offset: -5, style: axisLabelStyle };
  const yAxisLabel = thumbnail ? undefined : { value: actualYKey, angle: -90, position: "insideLeft" as const, offset: 15, style: axisLabelStyle };

  const margin = thumbnail
    ? { top: 4, right: 4, left: 4, bottom: 4 }
    : { top: 10, right: 20, left: 5, bottom: 15 };

  switch (chart_type) {
    case "bar":
    case "histogram": {
      const seriesKeys = config.series && config.series.length > 0 ? config.series : null;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis
              dataKey={x_key}
              {...axisProps}
              hide={thumbnail}
              angle={data.length > 8 ? -35 : 0}
              textAnchor={data.length > 8 ? "end" : "middle"}
              height={thumbnail ? 0 : data.length > 8 ? 65 : 40}
              interval={0}
              label={xAxisLabel}
            />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 55} label={yAxisLabel} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            {seriesKeys
              ? seriesKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
                ))
              : <Bar dataKey={actualYKey} fill={mainColor} radius={[3, 3, 0, 0]} />
            }
            {seriesKeys && !thumbnail && <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "line": {
      const seriesKeys = config.series && config.series.length > 0 ? config.series : null;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} label={xAxisLabel} height={thumbnail ? 0 : 40} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 55} label={yAxisLabel} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            {seriesKeys
              ? seriesKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={thumbnail ? false : { fill: CHART_COLORS[i % CHART_COLORS.length], r: 2 }}
                  />
                ))
              : <Line
                  type="monotone"
                  dataKey={actualYKey}
                  stroke={mainColor}
                  strokeWidth={2}
                  dot={thumbnail ? false : { fill: mainColor, r: 2 }}
                />
            }
            {seriesKeys && !thumbnail && <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    case "area": {
      const seriesKeys = config.series && config.series.length > 0 ? config.series : null;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} label={xAxisLabel} height={thumbnail ? 0 : 40} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 55} label={yAxisLabel} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            {seriesKeys
              ? seriesKeys.map((key, i) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fill={`${CHART_COLORS[i % CHART_COLORS.length]}4D`}
                  />
                ))
              : <Area
                  type="monotone"
                  dataKey={actualYKey}
                  stroke={mainColor}
                  fill={`${mainColor}4D`}
                />
            }
            {seriesKeys && !thumbnail && <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    case "scatter": {
      // Compute linear regression trend line
      const pts = data
        .map(d => ({ x: Number(d[x_key]), y: Number(d[actualYKey]) }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y));
      let trendSegment: [{ x: number; y: number }, { x: number; y: number }] | null = null;
      if (pts.length >= 2) {
        const n = pts.length;
        const sx = pts.reduce((s, p) => s + p.x, 0);
        const sy = pts.reduce((s, p) => s + p.y, 0);
        const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
        const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
        const denom = n * sx2 - sx * sx;
        if (denom !== 0) {
          const m = (n * sxy - sx * sy) / denom;
          const b = (sy - m * sx) / n;
          const xs = pts.map(p => p.x);
          const xMin = Math.min(...xs);
          const xMax = Math.max(...xs);
          trendSegment = [
            { x: xMin, y: m * xMin + b },
            { x: xMax, y: m * xMax + b },
          ];
        }
      }
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} name={x_key} type="number" label={xAxisLabel} height={thumbnail ? 0 : 40} />
            <YAxis dataKey={actualYKey} {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 55} name={actualYKey} type="number" label={yAxisLabel} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Scatter data={data} fill={mainColor} />
            {trendSegment && !thumbnail && (
              <ReferenceLine
                segment={trendSegment}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    case "box": {
      const boxData = data.map((d) => ({
        ...d,
        _spacer: Number(d.q1),
        _iqr: Number(d.q3) - Number(d.q1),
      }));
      const allVals = data.flatMap((d) => [Number(d.min), Number(d.max)]);
      const domainMin = Math.min(...allVals);
      const domainMax = Math.max(...allVals);
      const pad = (domainMax - domainMin) * 0.1 || 1;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={boxData} margin={margin} barCategoryGap="25%">
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis
              dataKey="name"
              {...axisProps}
              hide={thumbnail}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={thumbnail ? 0 : data.length > 6 ? 65 : 40}
              interval={0}
              label={xAxisLabel}
            />
            <YAxis
              {...axisProps}
              hide={thumbnail}
              width={thumbnail ? 0 : 65}
              domain={[domainMin - pad, domainMax + pad]}
              label={yAxisLabel}
            />
            {!thumbnail && <Tooltip content={<BoxTooltip />} />}
            <Bar dataKey="_spacer" stackId="box" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="_iqr"
              stackId="box"
              fill="transparent"
              isAnimationActive={false}
              shape={(props: Record<string, unknown>) => <BoxPlotShape {...props} />}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "pie":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Pie
              data={data}
              dataKey={actualYKey}
              nameKey={x_key}
              cx="50%"
              cy="50%"
              outerRadius={thumbnail ? "85%" : "65%"}
              label={thumbnail ? false : ({ name, percent }: { name: string; percent: number }) =>
                `${name} (${(percent * 100).toFixed(0)}%)`
              }
              labelLine={thumbnail ? false : { stroke: "#a1a1aa" }}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            {!thumbnail && <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />}
          </PieChart>
        </ResponsiveContainer>
      );

    case "heatmap": {
      // Data: [{x: "col1", y: "col2", value: 0.85}, ...]
      // Get unique x/y labels
      const xLabels = [...new Set(data.map(d => String(d.x)))];
      const yLabels = [...new Set(data.map(d => String(d.y)))];
      const valMap = new Map(data.map(d => [`${d.x}|${d.y}`, Number(d.value)]));

      // Color scale: blue (-1) → white (0) → red (+1)
      const getHeatColor = (v: number) => {
        const clamped = Math.max(-1, Math.min(1, v));
        if (clamped >= 0) {
          const t = clamped;
          const r = 220 + Math.round(35 * t);
          const g = 220 - Math.round(140 * t);
          const b = 220 - Math.round(160 * t);
          return `rgb(${r},${g},${b})`;
        } else {
          const t = -clamped;
          const r = 220 - Math.round(160 * t);
          const g = 220 - Math.round(120 * t);
          const b = 220 + Math.round(35 * t);
          return `rgb(${r},${g},${b})`;
        }
      };

      if (thumbnail) {
        // Simple colored grid for thumbnail
        const cellW = 100 / xLabels.length;
        const cellH = 100 / yLabels.length;
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            {yLabels.map((yL, yi) =>
              xLabels.map((xL, xi) => {
                const val = valMap.get(`${xL}|${yL}`) ?? 0;
                return (
                  <rect
                    key={`${xi}-${yi}`}
                    x={xi * cellW}
                    y={yi * cellH}
                    width={cellW}
                    height={cellH}
                    fill={getHeatColor(val)}
                  />
                );
              })
            )}
          </svg>
        );
      }

      // Full heatmap with labels and values
      const leftPad = 90;
      const topPad = 10;
      const bottomPad = 60;
      const rightPad = 10;

      return (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${leftPad + xLabels.length * 52 + rightPad} ${topPad + yLabels.length * 36 + bottomPad}`} preserveAspectRatio="xMidYMid meet">
            {yLabels.map((yL, yi) =>
              xLabels.map((xL, xi) => {
                const val = valMap.get(`${xL}|${yL}`) ?? 0;
                const cx = leftPad + xi * 52;
                const cy = topPad + yi * 36;
                return (
                  <g key={`${xi}-${yi}`}>
                    <rect
                      x={cx}
                      y={cy}
                      width={50}
                      height={34}
                      rx={4}
                      fill={getHeatColor(val)}
                      stroke="rgba(30,27,46,0.5)"
                      strokeWidth={1}
                    />
                    <text
                      x={cx + 25}
                      y={cy + 20}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={500}
                      fill={Math.abs(val) > 0.5 ? "#fff" : "#1e1b2e"}
                    >
                      {val.toFixed(2)}
                    </text>
                  </g>
                );
              })
            )}
            {/* Y-axis labels (row names) */}
            {yLabels.map((yL, yi) => (
              <text
                key={`y-${yi}`}
                x={leftPad - 6}
                y={topPad + yi * 36 + 20}
                textAnchor="end"
                fontSize={10}
                fill="#a1a1aa"
              >
                {yL.length > 12 ? yL.slice(0, 11) + "\u2026" : yL}
              </text>
            ))}
            {/* X-axis labels (column names) */}
            {xLabels.map((xL, xi) => (
              <text
                key={`x-${xi}`}
                x={leftPad + xi * 52 + 25}
                y={topPad + yLabels.length * 36 + 14}
                textAnchor="end"
                fontSize={10}
                fill="#a1a1aa"
                transform={`rotate(-35, ${leftPad + xi * 52 + 25}, ${topPad + yLabels.length * 36 + 14})`}
              >
                {xL.length > 12 ? xL.slice(0, 11) + "\u2026" : xL}
              </text>
            ))}
          </svg>
        </div>
      );
    }

    default:
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} label={xAxisLabel} height={thumbnail ? 0 : 40} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 55} label={yAxisLabel} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Bar dataKey={actualYKey} fill={mainColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
  }
}
