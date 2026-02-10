import { useEffect, useRef } from "react";
import vegaEmbed from "vega-embed";

const DARK_CONFIG = {
  background: "transparent",
  title: { color: "#e4e4e7", fontSize: 14, fontWeight: 500, offset: 16 },
  axis: {
    domainColor: "rgba(147,51,234,0.2)",
    gridColor: "rgba(147,51,234,0.1)",
    tickColor: "rgba(147,51,234,0.2)",
    labelColor: "#a1a1aa",
    labelFontSize: 10,
    titleColor: "#a1a1aa",
    titleFontSize: 11,
  },
  legend: {
    labelColor: "#a1a1aa",
    titleColor: "#a1a1aa",
    labelFontSize: 11,
  },
  view: { stroke: "transparent" },
  range: {
    category: [
      "#9333ea", "#a855f7", "#c084fc", "#7c3aed",
      "#6d28d9", "#5b21b6", "#d8b4fe",
    ],
  },
};

interface VegaChartProps {
  spec: Record<string, unknown>;
  actions?: boolean;
}

export function VegaChart({ spec, actions = false }: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !spec) return;

    const fullSpec = {
      ...spec,
      width: "container",
      height: "container",
      autosize: { type: "fit", contains: "padding" },
      config: {
        ...DARK_CONFIG,
        ...((spec.config as Record<string, unknown>) || {}),
      },
    };

    const embedPromise = vegaEmbed(el, fullSpec as Parameters<typeof vegaEmbed>[1], {
      actions,
      renderer: "svg",
    });

    return () => {
      embedPromise.then((r) => r.finalize()).catch(() => {});
    };
  }, [spec, actions]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
