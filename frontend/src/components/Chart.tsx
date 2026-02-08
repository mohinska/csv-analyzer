import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export interface ChartConfig {
  chart_type: string;
  x_key: string;
  y_key: string;
  color_key?: string | null;
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

  const margin = thumbnail
    ? { top: 4, right: 4, left: 4, bottom: 4 }
    : { top: 10, right: 10, left: 0, bottom: 5 };

  switch (chart_type) {
    case "bar":
    case "histogram":
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
              height={thumbnail ? 0 : data.length > 8 ? 55 : 30}
              interval={0}
            />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 45} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Bar dataKey={actualYKey} fill={mainColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 45} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Line
              type="monotone"
              dataKey={actualYKey}
              stroke={mainColor}
              strokeWidth={2}
              dot={thumbnail ? false : { fill: mainColor, r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 45} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Area
              type="monotone"
              dataKey={actualYKey}
              stroke={mainColor}
              fill={`${mainColor}4D`}
            />
          </AreaChart>
        </ResponsiveContainer>
      );

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} name={x_key} />
            <YAxis dataKey={actualYKey} {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 45} name={actualYKey} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Scatter data={data} fill={mainColor} />
          </ScatterChart>
        </ResponsiveContainer>
      );

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
              height={thumbnail ? 0 : data.length > 6 ? 55 : 30}
              interval={0}
            />
            <YAxis
              {...axisProps}
              hide={thumbnail}
              width={thumbnail ? 0 : 55}
              domain={[domainMin - pad, domainMax + pad]}
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

    default:
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={margin}>
            {!thumbnail && <CartesianGrid strokeDasharray="3 3" stroke="rgba(147,51,234,0.1)" />}
            <XAxis dataKey={x_key} {...axisProps} hide={thumbnail} />
            <YAxis {...axisProps} hide={thumbnail} width={thumbnail ? 0 : 45} />
            {!thumbnail && <Tooltip {...tooltipStyle} />}
            <Bar dataKey={actualYKey} fill={mainColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
  }
}
