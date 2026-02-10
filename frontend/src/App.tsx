import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, TableProperties, BarChart3, FileText, Loader2, Upload, SquarePen, X, MessageCircle, Square, Copy, Check, Download, Sparkles, Shield, Filter, FlaskConical, LogOut, ZoomIn, Grid3X3, Code } from "lucide-react";
import { AuthPage } from "./components/AuthPage";
import { DataTab } from "./components/DataTab";
import { MarkdownLatex } from "./components/MarkdownLatex";
import { PlotlyChart } from "./components/PlotlyChart";
import { TableBlock } from "./components/TableBlock";

interface FileInfo {
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  type?: string;
  fileName?: string;
  plotTitle?: string;
  plotlySpec?: { data: unknown[]; layout?: Record<string, unknown> };
  // table fields
  tableTitle?: string;
  tableHeaders?: string[];
  tableRows?: unknown[][];
}

function GlassPanel({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative rounded-[18px] overflow-hidden flex flex-col ${className || ""}`}
      style={{
        minHeight: 0,
        backgroundColor: '#1e1b2e',
        border: '1px solid rgba(147,51,234,0.2)',
        ...style,
      }}
    >
      {/* Top gradient glow */}
      <div className="absolute inset-x-0 top-0 h-[80px] pointer-events-none" style={{
        background: 'linear-gradient(180deg, rgba(147,51,234,0.18) 0%, rgba(147,51,234,0.06) 40%, transparent 100%)',
      }} />
      {/* Side gradient glows */}
      <div className="absolute inset-y-0 left-0 w-[50px] pointer-events-none" style={{
        background: 'linear-gradient(90deg, rgba(147,51,234,0.08) 0%, transparent 100%)',
      }} />
      <div className="absolute inset-y-0 right-0 w-[50px] pointer-events-none" style={{
        background: 'linear-gradient(270deg, rgba(147,51,234,0.08) 0%, transparent 100%)',
      }} />
      {/* Bottom subtle glow */}
      <div className="absolute inset-x-0 bottom-0 h-[40px] pointer-events-none" style={{
        background: 'linear-gradient(0deg, rgba(147,51,234,0.06) 0%, transparent 100%)',
      }} />
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col w-full" style={{ minHeight: 0, overflow: 'hidden', height: '100%' }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));

  const handleAuth = (newToken: string) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
  };

  if (!token) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return <MainApp token={token} onLogout={handleLogout} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRestoreMessage(msg: any): Message {
  const base: Message = {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    text: msg.text,
    type: msg.type || undefined,
    plotTitle: msg.plot_title,
    plotlySpec: msg.plot_data?.plotly_spec,
  };
  if (msg.type === "table" && msg.plot_data) {
    base.tableTitle = msg.text;
    base.tableHeaders = msg.plot_data.headers;
    base.tableRows = msg.plot_data.rows;
  }
  return base;
}

const PLOT_COLOR_PRESETS = [
  { name: "Purple", value: "#9333ea" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Pink", value: "#ec4899" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Amber", value: "#f59e0b" },
];

const PLOT_BG_PRESETS = [
  { name: "Default", value: "#1e1b2e" },
  { name: "Dark", value: "#0f0d1a" },
  { name: "Charcoal", value: "#1a1a2e" },
  { name: "White", value: "#ffffff" },
  { name: "Light", value: "#f4f4f5" },
];

function extractAxisTitle(axis: unknown): string {
  if (!axis || typeof axis !== "object") return "";
  const a = axis as Record<string, unknown>;
  if (typeof a.title === "string") return a.title;
  if (a.title && typeof a.title === "object") {
    const t = a.title as Record<string, unknown>;
    if (typeof t.text === "string") return t.text;
  }
  return "";
}

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

function applyPlotCustomizations(
  spec: { data: unknown[]; layout?: Record<string, unknown> },
  custom: { color: string | null; showGrid: boolean; xLabel: string; yLabel: string; bgColor: string | null },
): { data: unknown[]; layout?: Record<string, unknown> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = spec.data.map((trace: any) => {
    if (!custom.color) return trace;
    const t = { ...trace };
    if (t.type === "pie") {
      const count = ((t.values || t.labels || []) as unknown[]).length;
      const shades = Array.from({ length: count }, (_, j) => lightenColor(custom.color!, j * 0.12));
      t.marker = { ...(t.marker || {}), colors: shades };
    } else if (t.type === "heatmap") {
      // Light (low) → dark (high) colorscale from the selected color
      const c = custom.color!;
      const veryLight = lightenColor(c, 0.85);
      const light = lightenColor(c, 0.55);
      const dark = darkenColor(c, 0.4);
      const veryDark = darkenColor(c, 0.7);
      t.colorscale = [
        [0, veryLight], [0.25, light],
        [0.5, c], [0.75, dark],
        [1, veryDark],
      ];
    } else {
      t.marker = { ...(t.marker || {}), color: custom.color };
      if (t.line) t.line = { ...t.line, color: custom.color };
    }
    return t;
  });

  const layout = { ...(spec.layout || {}) };
  const xaxis = { ...((layout.xaxis as Record<string, unknown>) || {}) };
  const yaxis = { ...((layout.yaxis as Record<string, unknown>) || {}) };
  xaxis.showgrid = custom.showGrid;
  yaxis.showgrid = custom.showGrid;
  xaxis.title = custom.xLabel;
  yaxis.title = custom.yLabel;

  // Background color
  if (custom.bgColor) {
    layout.paper_bgcolor = custom.bgColor;
    layout.plot_bgcolor = custom.bgColor;
    // Auto-adjust text colors for light backgrounds
    const light = isLightColor(custom.bgColor);
    const textColor = light ? "#27272a" : "#a1a1aa";
    const titleColor = light ? "#18181b" : "#e4e4e7";
    const gridColor = light ? "rgba(0,0,0,0.08)" : "rgba(147,51,234,0.1)";
    layout.font = { color: textColor, size: 11 };
    layout.title = { ...(layout.title as Record<string, unknown> || {}), font: { color: titleColor, size: 14 } };
    xaxis.tickfont = { color: textColor, size: 10 };
    yaxis.tickfont = { color: textColor, size: 10 };
    xaxis.gridcolor = gridColor;
    yaxis.gridcolor = gridColor;
    xaxis.linecolor = gridColor;
    yaxis.linecolor = gridColor;
  }

  layout.xaxis = xaxis;
  layout.yaxis = yaxis;

  return { data, layout };
}

interface PlotCustom {
  color: string | null;
  showGrid: boolean;
  xLabel: string;
  yLabel: string;
  bgColor: string | null;
  zoomEnabled: boolean;
}

const DEFAULT_PLOT_CUSTOM: PlotCustom = {
  color: null,
  showGrid: true,
  xLabel: "",
  yLabel: "",
  bgColor: null,
  zoomEnabled: false,
};

function MainApp({ token, onLogout }: { token: string; onLogout: () => void }) {
  // Fetch wrapper that auto-logs out on 401 (expired/invalid token)
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers as Record<string, string>, Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      onLogout();
      throw new Error("Session expired. Please log in again.");
    }
    return response;
  };

  const [activeTab, setActiveTab] = useState<"data" | "history">("data");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fullscreenPlot, setFullscreenPlot] = useState<{ title: string; plotlySpec: { data: unknown[]; layout?: Record<string, unknown> }; plotId: number } | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [showFullData, setShowFullData] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "data" | "history">("chat");
  const [isMobile, setIsMobile] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isSavingPlot, setIsSavingPlot] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [featurePopup, setFeaturePopup] = useState<number | null>(null);
  // Per-plot customizations, persisted to localStorage
  const [plotCustomizations, setPlotCustomizations] = useState<Record<number, PlotCustom>>(() => {
    try {
      const saved = localStorage.getItem("plot_customizations");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const activePlotCustom = fullscreenPlot ? (plotCustomizations[fullscreenPlot.plotId] || DEFAULT_PLOT_CUSTOM) : DEFAULT_PLOT_CUSTOM;
  const updatePlotCustom = (patch: Partial<PlotCustom>) => {
    if (!fullscreenPlot) return;
    setPlotCustomizations((prev) => {
      const updated = { ...prev, [fullscreenPlot.plotId]: { ...(prev[fullscreenPlot.plotId] || DEFAULT_PLOT_CUSTOM), ...patch } };
      localStorage.setItem("plot_customizations", JSON.stringify(updated));
      return updated;
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plotExportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDraggingDelimiterRef = useRef(false);
  const dragStartRef = useRef({ x: 0, width: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const autoAnalyzePendingRef = useRef(false);
  const responseReceivedRef = useRef(false);
  const handleWSEventRef = useRef<(event: string, data: Record<string, unknown>) => void>(() => {});

  // Status queue: show each status for at least 5s before switching
  const statusQueueRef = useRef<string[]>([]);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatusTimeRef = useRef(0);
  const STATUS_MIN_DISPLAY = 2500;

  const showNextStatus = useRef(() => {
    if (statusQueueRef.current.length === 0) {
      statusTimerRef.current = null;
      return;
    }
    const next = statusQueueRef.current.shift()!;
    lastStatusTimeRef.current = Date.now();
    setStatusMessage(next);
    if (statusQueueRef.current.length > 0) {
      statusTimerRef.current = setTimeout(() => showNextStatus.current(), STATUS_MIN_DISPLAY);
    } else {
      statusTimerRef.current = null;
    }
  }).current;

  const enqueueStatus = useRef((msg: string) => {
    const elapsed = Date.now() - lastStatusTimeRef.current;
    if (elapsed >= STATUS_MIN_DISPLAY && !statusTimerRef.current) {
      lastStatusTimeRef.current = Date.now();
      setStatusMessage(msg);
    } else {
      statusQueueRef.current.push(msg);
      if (!statusTimerRef.current) {
        const delay = STATUS_MIN_DISPLAY - elapsed;
        statusTimerRef.current = setTimeout(() => showNextStatus(), delay);
      }
    }
  }).current;

  const clearStatusQueue = useRef(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    statusQueueRef.current.length = 0;
  }).current;

  const hasContent = chatInput.trim().length > 0;

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Sidebar resize drag handler (direct DOM manipulation for smoothness, sync state on mouseup)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingDelimiterRef.current) return;
      const delta = e.clientX - dragStartRef.current.x;
      const w = Math.min(600, Math.max(200, dragStartRef.current.width + delta));
      if (sidebarRef.current) sidebarRef.current.style.width = `${w}px`;
    };
    const onUp = (e: MouseEvent) => {
      if (!isDraggingDelimiterRef.current) return;
      isDraggingDelimiterRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const delta = e.clientX - dragStartRef.current.x;
      setSidebarWidth(Math.min(600, Math.max(200, dragStartRef.current.width + delta)));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Close fullscreen data on Escape
  useEffect(() => {
    if (!showFullData) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFullData(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFullData]);

  // Initialize axis labels from spec if no saved customization exists
  useEffect(() => {
    if (fullscreenPlot && !plotCustomizations[fullscreenPlot.plotId]) {
      const ly = (fullscreenPlot.plotlySpec.layout || {}) as Record<string, unknown>;
      updatePlotCustom({
        xLabel: extractAxisTitle(ly.xaxis),
        yLabel: extractAxisTitle(ly.yaxis),
      });
    }
  }, [fullscreenPlot?.plotId]);

  // Memoize customized spec for fullscreen plot
  const customizedFullscreenSpec = useMemo(() => {
    if (!fullscreenPlot) return null;
    return applyPlotCustomizations(fullscreenPlot.plotlySpec, {
      color: activePlotCustom.color,
      showGrid: activePlotCustom.showGrid,
      xLabel: activePlotCustom.xLabel,
      yLabel: activePlotCustom.yLabel,
      bgColor: activePlotCustom.bgColor,
    });
  }, [fullscreenPlot, activePlotCustom]);

  // Restore session from backend on mount (no session creation — that happens on upload)
  useEffect(() => {
    const initSession = async () => {
      const savedSessionId = localStorage.getItem("csv_analyzer_session_id");
      if (!savedSessionId) return; // No session to restore — stay in upload state

      try {
        const response = await authFetch(`/api/sessions/${savedSessionId}`);
        if (!response.ok) throw new Error("Session not found");

        const data = await response.json();
        setSessionId(savedSessionId);

        // Restore file info
        if (data.file) {
          setFileInfo({
            filename: data.file.filename,
            row_count: data.file.row_count,
            column_count: data.file.column_count,
            columns: data.file.columns,
            preview: data.file.preview,
          });
        }

        // Restore title + messages
        setSessionTitle(data.title || null);
        if (data.messages?.length > 0) {
          setMessages(data.messages.filter((m: any) => m.type !== "query_result").map(mapRestoreMessage));
        }
      } catch {
        // Session gone or expired — clear stale data, stay in upload state
        localStorage.removeItem("csv_analyzer_session_id");
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // New chat — clear everything, return to upload state
  const handleNewChat = () => {
    localStorage.removeItem("csv_analyzer_session_id");
    setSessionId(null);
    setSessionTitle(null);
    setMessages([]);
    setFileInfo(null);
    setChatInput("");
    setStatusMessage(null);
  };

  // Upload file — creates a new session and returns session ID + file info
  // Throws on failure so callers can surface the actual error message
  const uploadFile = async (file: File): Promise<{ sessionId: string; fileInfo: FileInfo }> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authFetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Upload failed");
    }

    const data = await response.json();
    return {
      sessionId: data.session_id,
      fileInfo: {
        filename: data.file.filename,
        row_count: data.file.row_count,
        column_count: data.file.column_count,
        columns: data.file.columns,
        preview: data.file.preview,
      },
    };
  };

  // WebSocket event handler — ref ensures latest closures without reconnecting
  handleWSEventRef.current = (eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case "text_delta":
        responseReceivedRef.current = true;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && (last as Record<string, unknown>)._streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + (data.delta as string) },
            ];
          }
          return [
            ...prev,
            { id: Date.now(), role: "assistant", text: data.delta as string, _streaming: true } as typeof last,
          ];
        });
        break;

      case "text":
        responseReceivedRef.current = true;
        setMessages((prev) => {
          // Replace streaming message with final text, or append new
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && (last as Record<string, unknown>)._streaming) {
            const { _streaming, ...rest } = last as Record<string, unknown>;
            return [
              ...prev.slice(0, -1),
              { ...rest, text: data.text as string } as typeof last,
            ];
          }
          return [
            ...prev,
            { id: Date.now(), role: "assistant", text: data.text as string },
          ];
        });
        break;

      case "plot":
        responseReceivedRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "system",
            text: data.title as string,
            plotTitle: data.title as string,
            plotlySpec: data.plotly_spec as { data: unknown[]; layout?: Record<string, unknown> } | undefined,
          },
        ]);
        break;

      case "table":
        responseReceivedRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            text: data.title as string,
            type: "table",
            tableTitle: data.title as string,
            tableHeaders: data.headers as string[],
            tableRows: data.rows as unknown[][],
          },
        ]);
        break;

      case "error":
        responseReceivedRef.current = true;
        console.error("[Chat Error]", data.message);
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", text: `Error: ${data.message}` },
        ]);
        break;

      case "status":
        enqueueStatus(data.message as string);
        break;

      case "done":
        clearStatusQueue();
        setStatusMessage(null);
        if (data.data_updated) {
          refreshFileInfo();
        }
        setSuggestions((data.suggestions as string[]) || []);
        setIsLoading(false);
        // Safety net: no visible response received for this turn
        if (!responseReceivedRef.current) {
          setMessages((prev) => [
            ...prev,
            { id: Date.now(), role: "assistant", text: "I wasn't able to produce a response. Please try rephrasing your question." },
          ]);
        }
        break;

      case "session_update":
        setSessionTitle(data.title as string);
        break;
    }
  };

  // WebSocket connection — connect when session is active, auto-reconnect
  useEffect(() => {
    if (!sessionId || !token) {
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      return;
    }

    let intentionalClose = false;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/sessions/${sessionId}/ws?token=${encodeURIComponent(token)}`
      );

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        // Send queued auto_analyze if pending (after file upload)
        if (autoAnalyzePendingRef.current) {
          autoAnalyzePendingRef.current = false;
          responseReceivedRef.current = false;
          ws.send(JSON.stringify({ type: "auto_analyze" }));
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleWSEventRef.current(msg.event, msg.data);
        } catch {
          console.error("[WS] Failed to parse message:", e.data);
        }
      };

      ws.onclose = () => {
        if (intentionalClose) return;
        const attempts = reconnectAttemptsRef.current;
        if (attempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          setIsLoading(false);
          setStatusMessage(null);
          setMessages((prev) => [
            ...prev,
            { id: Date.now(), role: "system", text: "Connection lost. Please refresh the page." },
          ]);
        }
      };

      ws.onerror = () => {};

      wsRef.current = ws;
    };

    connect();

    return () => {
      intentionalClose = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [sessionId, token]);

  // Fetch session list for History tab
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await authFetch("/api/sessions");
        if (response.ok) {
          const data = await response.json();
          setSessions(data);
        }
      } catch {}
    };
    fetchSessions();
  }, [token, sessionId]);

  // Load a session from History tab
  const loadSession = async (id: string) => {
    if (id === sessionId || loadingSessionId) return;
    setLoadingSessionId(id);
    try {
      const response = await authFetch(`/api/sessions/${id}`);
      if (!response.ok) throw new Error("Session not found");
      const data = await response.json();

      setSessionId(id);
      setSessionTitle(data.title || null);
      localStorage.setItem("csv_analyzer_session_id", id);

      if (data.file) {
        setFileInfo({
          filename: data.file.filename,
          row_count: data.file.row_count,
          column_count: data.file.column_count,
          columns: data.file.columns,
          preview: data.file.preview,
        });
      }

      if (data.messages?.length > 0) {
        setMessages(data.messages.filter((m: any) => m.type !== "query_result").map(mapRestoreMessage));
      } else {
        setMessages([]);
      }
    } catch {
      // Session gone — refresh list
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setLoadingSessionId(null);
    }
  };

  const deleteSession = async (id: string) => {
    setDeletingSessionId(id);
    try {
      await authFetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === sessionId) {
        handleNewChat();
      }
    } catch {} finally {
      setDeletingSessionId(null);
    }
  };

  // Refresh file info after transformation
  const refreshFileInfo = async () => {
    if (!sessionId) return;

    try {
      const response = await authFetch(`/api/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.file) {
          setFileInfo({
            filename: data.file.filename,
            row_count: data.file.row_count,
            column_count: data.file.column_count,
            columns: data.file.columns,
            preview: data.file.preview,
          });
        }
      }
    } catch (error) {
      console.error("Failed to refresh file info:", error);
    }
  };

  // Upload file — creates session, sets state, triggers auto-analysis via WS
  const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB

  const handleFileUpload = async (file: File) => {
    if (isLoading) return;

    // Client-side size check (matches backend/nginx 1 GB limit)
    if (file.size > MAX_FILE_SIZE) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", text: "File is too large. Maximum size is 1 GB." },
      ]);
      return;
    }

    setIsLoading(true);

    // Add user message locally
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        text: "Uploaded file",
        fileName: file.name,
      },
    ]);

    try {
      const result = await uploadFile(file);
      setSessionId(result.sessionId);
      setFileInfo(result.fileInfo);
      localStorage.setItem("csv_analyzer_session_id", result.sessionId);

      // Queue auto-analysis — will be sent when WS connects (onopen)
      autoAnalyzePendingRef.current = true;
      // isLoading stays true — "done" event from WS will clear it
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", text: `Failed to upload file: ${message}` },
      ]);
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
    }
    setIsLoading(false);
    setStatusMessage(null);
  };

  const handleSend = (directText?: string) => {
    const text = directText?.trim() || chatInput.trim();
    if (!text || !fileInfo || isLoading) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "system", text: "Not connected to server. Please wait or refresh the page." },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }]);
    setChatInput("");
    setSuggestions([]);
    setIsLoading(true);
    responseReceivedRef.current = false;
    wsRef.current.send(JSON.stringify({ type: "message", text }));
  };

  const handleCopyMessage = async (msgId: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyPlotCode = async (plotId: number, spec: { data: unknown[]; layout?: Record<string, unknown> }) => {
    try {
      const code = JSON.stringify(spec, null, 2);
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(plotId);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSavePlotPng = async () => {
    const el = plotExportRef.current;
    if (!el || isSavingPlot) return;
    setIsSavingPlot(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, { backgroundColor: "#1e1b2e", scale: 2 });
      const link = document.createElement("a");
      link.download = `${fullscreenPlot?.title || "plot"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // html2canvas not available — fallback to SVG export
      const svg = el.querySelector("svg");
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const link = document.createElement("a");
      link.download = `${fullscreenPlot?.title || "plot"}.svg`;
      link.href = URL.createObjectURL(svgBlob);
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setIsSavingPlot(false);
    }
  };

  // Direct save: capture chart element from DOM and download as PNG
  const handleDirectSavePlot = async (title: string, chartElement: HTMLElement | null) => {
    if (!chartElement || isSavingPlot) return;
    setIsSavingPlot(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(chartElement, { backgroundColor: "#161328", scale: 2 });
      const link = document.createElement("a");
      link.download = `${title}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Fallback: try SVG export
      const svg = chartElement.querySelector("svg");
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const link = document.createElement("a");
        link.download = `${title}.svg`;
        link.href = URL.createObjectURL(svgBlob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } finally {
      setIsSavingPlot(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    e.target.value = "";
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // No re-upload — one file per session
    if (sessionId) return;
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    // No re-upload — one file per session
    if (sessionId) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".csv") || file.name.endsWith(".parquet") || file.name.endsWith(".pq") || file.type === "text/csv") {
        handleFileUpload(file);
      }
    }
  };

  return (
    <div
      className="flex overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        alignItems: 'stretch',
        backgroundColor: '#111111',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 0 : 12,
        padding: isMobile ? 0 : '16px 14px',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 backdrop-blur-sm flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(26,22,37,0.5)' }}>
          <div className="rounded-2xl px-8 py-6 shadow-xl border-2 border-dashed flex flex-col items-center gap-3" style={{ backgroundColor: '#252131', borderColor: '#9333ea' }}>
            <Upload className="w-10 h-10" style={{ color: '#9333ea' }} />
            <p className="text-[15px]" style={{ fontWeight: 590, color: '#e4e4e7' }}>
              Drop CSV or Parquet file here
            </p>
            <p className="text-[12px]" style={{ color: '#a1a1aa' }}>
              Release to upload
            </p>
          </div>
        </div>
      )}

      {/* Left sidebar — hidden on mobile */}
      {!isMobile && (
        <div ref={sidebarRef} className="flex flex-col gap-1.5 shrink-0 h-full min-w-0" style={{ width: sidebarWidth, position: 'relative' }}>
          {/* Tab bar */}
          <GlassPanel className="shrink-0" style={{ backgroundColor: '#111111' }}>
            <div className="flex items-center py-2.5 px-2.5">
              <button
                onClick={() => setActiveTab("data")}
                className="flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-all"
                style={activeTab === "data" ? {
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.3)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.2)',
                } : { border: '1px solid transparent' }}
                onMouseEnter={(e) => { if (activeTab !== "data") e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; }}
                onMouseLeave={(e) => { if (activeTab !== "data") e.currentTarget.style.backgroundColor = ''; }}
              >
                <TableProperties className="w-[14px] h-[14px]" style={{ color: activeTab === "data" ? '#fff' : '#a1a1aa' }} />
                <span className="text-[11px]" style={{ fontWeight: 510, color: activeTab === "data" ? '#fff' : '#a1a1aa' }}>
                  Data
                </span>
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className="flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-all"
                style={activeTab === "history" ? {
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.3)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.2)',
                } : { border: '1px solid transparent' }}
                onMouseEnter={(e) => { if (activeTab !== "history") e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; }}
                onMouseLeave={(e) => { if (activeTab !== "history") e.currentTarget.style.backgroundColor = ''; }}
              >
                <MessageCircle className="w-[14px] h-[14px]" style={{ color: activeTab === "history" ? '#fff' : '#a1a1aa' }} />
                <span className="text-[11px]" style={{ fontWeight: 510, color: activeTab === "history" ? '#fff' : '#a1a1aa' }}>
                  History
                </span>
              </button>
            </div>
          </GlassPanel>

          {/* Content panel */}
          <GlassPanel className="flex-1">
            <div className="h-full custom-scrollbar" style={{ backgroundColor: '#1e1b2e' }}>
              {activeTab === "data" ? (
                <DataTab
                  fileInfo={fileInfo}
                  onViewFullData={() => setShowFullData(true)}
                />
              ) : sessions.length === 0 ? (
                <div className="flex flex-col h-full items-center justify-center gap-1 p-5">
                  <p className="text-[12px] text-center" style={{ fontWeight: 470, color: '#71717a' }}>
                    No sessions yet
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(147,51,234,0.12)' }}>
                    <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>
                      {sessions.length}
                    </span>
                    <span className="text-[13px]" style={{ fontWeight: 590, color: '#e4e4e7' }}>Sessions</span>
                  </div>
                  <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="group"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 20px',
                          borderBottom: '1px solid rgba(147,51,234,0.08)',
                          backgroundColor: s.id === sessionId ? 'rgba(147,51,234,0.12)' : 'transparent',
                          cursor: loadingSessionId ? 'default' : 'pointer',
                          transition: 'background-color 0.15s',
                          opacity: loadingSessionId && loadingSessionId !== s.id ? 0.5 : 1,
                        }}
                        onClick={() => loadSession(s.id)}
                        onMouseEnter={(e) => { if (s.id !== sessionId && !loadingSessionId) e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.06)'; }}
                        onMouseLeave={(e) => { if (s.id !== sessionId) e.currentTarget.style.backgroundColor = s.id === sessionId ? 'rgba(147,51,234,0.12)' : 'transparent'; }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title || 'Untitled session'}
                          </div>
                          <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>
                            {new Date(s.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {loadingSessionId === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ flexShrink: 0, marginLeft: 8, color: '#9333ea' }} />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                            disabled={!!deletingSessionId}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              flexShrink: 0,
                              marginLeft: 8,
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'transparent',
                              border: '1px solid rgba(248,113,113,0.2)',
                              color: '#f87171',
                              cursor: deletingSessionId ? 'not-allowed' : 'pointer',
                              transition: 'background-color 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.1)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.2)'; }}
                          >
                            {deletingSessionId === s.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="shrink-0 px-5 py-3" style={{ borderTop: '1px solid rgba(147,51,234,0.12)' }}>
                    <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                      {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>

          {/* Resize handle */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: -12,
              width: 12,
              height: '100%',
              cursor: 'col-resize',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              isDraggingDelimiterRef.current = true;
              dragStartRef.current = { x: e.clientX, width: sidebarRef.current?.offsetWidth || sidebarWidth };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            onMouseEnter={(e) => {
              const pill = e.currentTarget.firstElementChild as HTMLElement;
              if (pill) pill.style.backgroundColor = 'rgba(147,51,234,0.5)';
            }}
            onMouseLeave={(e) => {
              const pill = e.currentTarget.firstElementChild as HTMLElement;
              if (pill) pill.style.backgroundColor = 'rgba(147,51,234,0.2)';
            }}
          >
            <div style={{ width: 3, height: 40, borderRadius: 99, backgroundColor: 'rgba(147,51,234,0.2)', transition: 'background-color 0.15s' }} />
          </div>
        </div>
      )}

      {/* Mobile: Data/History panel (shown when mobileView is data or history) */}
      {isMobile && mobileView !== "chat" && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <GlassPanel className="flex-1" style={{ borderRadius: 0, border: 'none' }}>
            <div className="h-full custom-scrollbar" style={{ backgroundColor: '#1e1b2e' }}>
              {mobileView === "data" ? (
                <DataTab
                  fileInfo={fileInfo}
                  onViewFullData={() => setShowFullData(true)}
                />
              ) : sessions.length === 0 ? (
                <div className="flex flex-col h-full items-center justify-center gap-1 p-5">
                  <p className="text-[12px] text-center" style={{ fontWeight: 470, color: '#71717a' }}>
                    No sessions yet
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(147,51,234,0.12)' }}>
                    <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>
                      {sessions.length}
                    </span>
                    <span className="text-[13px]" style={{ fontWeight: 590, color: '#e4e4e7' }}>Sessions</span>
                  </div>
                  <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
                    {sessions.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 20px',
                            borderBottom: '1px solid rgba(147,51,234,0.08)',
                            backgroundColor: s.id === sessionId ? 'rgba(147,51,234,0.12)' : 'transparent',
                            cursor: loadingSessionId ? 'default' : 'pointer',
                            opacity: loadingSessionId && loadingSessionId !== s.id ? 0.5 : 1,
                          }}
                          onClick={() => loadSession(s.id)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.title || 'Untitled session'}
                            </div>
                            <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>
                              {new Date(s.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {loadingSessionId === s.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ flexShrink: 0, marginLeft: 8, color: '#9333ea' }} />
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                              disabled={!!deletingSessionId}
                              style={{
                                flexShrink: 0,
                                marginLeft: 8,
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'transparent',
                                border: '1px solid rgba(248,113,113,0.2)',
                                color: '#f87171',
                                cursor: deletingSessionId ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.15s, border-color 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.1)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.2)'; }}
                            >
                              {deletingSessionId === s.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="shrink-0 px-5 py-3" style={{ borderTop: '1px solid rgba(147,51,234,0.12)' }}>
                    <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                      {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Right panel (chat) — on mobile, only shown when mobileView is "chat" */}
      {(!isMobile || mobileView === "chat") && (
      <GlassPanel className="flex-1 min-w-0" style={{ height: '100%', ...(isMobile ? { borderRadius: 0, border: 'none' } : {}) }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: '14px', paddingBottom: '14px' }}>
          {/* Title */}
          <div className="px-5 flex items-center justify-between" style={{ flexShrink: 0, marginBottom: 4 }}>
            <h2 className="text-[18px]" style={{ fontWeight: 590, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sessionTitle || "AI Data Analyzer"}
            </h2>
            <div className="flex items-center gap-2">
              {fileInfo && (
                <span className="text-[11px]" style={{ color: '#a1a1aa' }}>
                  {fileInfo.filename}
                </span>
              )}
              <button
                onClick={handleNewChat}
                disabled={isLoading}
                className="h-[28px] px-2.5 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(10px)',
                }}
                title="Start a new conversation"
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
              >
                <SquarePen className="w-[14px] h-[14px]" style={{ color: '#fff' }} />
                <span className="text-[12px]" style={{ fontWeight: 500, color: '#fff' }}>New</span>
              </button>
              <button
                onClick={onLogout}
                className="h-[28px] px-2.5 rounded-lg flex items-center gap-1.5 transition-all"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(147,51,234,0.2)',
                }}
                title="Sign out"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.2)'; }}
              >
                <LogOut className="w-[14px] h-[14px]" style={{ color: '#a1a1aa' }} />
              </button>
            </div>
          </div>

          {/* Chat area */}
          <div
            className="px-5 py-4 custom-scrollbar"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center" style={{ padding: isMobile ? '16px' : '32px' }}>
                <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
                  <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }}>
                    AI Data Analyzer
                  </h1>
                  <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 28, lineHeight: 1.5 }}>
                    {fileInfo
                      ? "Your data is ready. Ask anything below."
                      : "Upload a CSV or Parquet file and explore your data with AI-powered analysis."
                    }
                  </p>

                  {!fileInfo && (() => {
                    const features = [
                      {
                        icon: <Sparkles className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Auto-analysis on upload",
                        details: "As soon as you upload a file, the AI automatically performs a comprehensive analysis: dataset overview, column dictionary with descriptions, key statistics, data quality report (missing values, duplicates, type issues, anomalies), and actionable insights.",
                      },
                      {
                        icon: <FileText className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Ask questions in natural language",
                        details: "Ask anything about your data in plain language — in English or Ukrainian. \"What's the average salary by department?\", \"Show top 10 customers\", \"What drives revenue the most?\". The AI translates your questions into pandas code and interprets the results.",
                      },
                      {
                        icon: <BarChart3 className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Interactive charts & visualizations",
                        details: "Generate bar charts, scatter plots, histograms, pie charts, box plots, and more. Every chart is interactive — click to view fullscreen, customize colors and background, and save as PNG. Charts are saved in the Plots tab for quick access.",
                      },
                      {
                        icon: <Shield className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Data quality & cleaning",
                        details: "Automatic quality checks: missing values, duplicates, type mismatches, outliers, class imbalance. Ask to \"clean the data\" and the AI will fix types, remove duplicates, handle missing values, trim whitespace — all with a detailed before/after report.",
                      },
                      {
                        icon: <Filter className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Filter, sort & explore data",
                        details: "The Data tab gives you per-column filters with search, sorting by any column, and CSV export. Browse your data with infinite scroll and column-level filtering.",
                      },
                      {
                        icon: <FlaskConical className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "Statistical analysis & regression",
                        details: "Run t-tests, ANOVA, chi-squared, normality tests, correlation analysis, linear and polynomial regression. The AI interprets results in plain language — p-values, R-squared, confidence intervals — and formulates hypotheses.",
                      },
                      {
                        icon: <Upload className="w-[15px] h-[15px]" style={{ color: '#9333ea' }} />,
                        text: "CSV & Parquet support",
                        details: "Upload CSV or Apache Parquet files. Drag & drop or click to browse. Large datasets are handled efficiently with preview pagination and lazy loading.",
                      },
                    ];
                    return (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 24 }}>
                          {features.map((item, i) => (
                            <button key={i} onClick={() => setFeaturePopup(i)} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 14px',
                              borderRadius: 12,
                              backgroundColor: 'rgba(147,51,234,0.06)',
                              border: '1px solid rgba(147,51,234,0.12)',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s',
                              width: '100%',
                              textAlign: 'left',
                            }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.06)'}
                            >
                              {item.icon}
                              <span style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 450, flex: 1 }}>{item.text}</span>
                              <span style={{ fontSize: 11, color: '#52525b' }}>&#8250;</span>
                            </button>
                          ))}
                        </div>

                        {/* Feature detail popup */}
                        {featurePopup !== null && createPortal(
                          <div
                            style={{
                              position: 'fixed',
                              inset: 0,
                              zIndex: 99999,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              backdropFilter: 'blur(4px)',
                            }}
                            onClick={() => setFeaturePopup(null)}
                          >
                            <div
                              style={{
                                maxWidth: 420,
                                width: 'calc(100% - 32px)',
                                backgroundColor: '#1e1b2e',
                                borderRadius: 16,
                                border: '1px solid rgba(147,51,234,0.25)',
                                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                                padding: '24px',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                {features[featurePopup].icon}
                                <span style={{ fontSize: 16, fontWeight: 600, color: '#e4e4e7', flex: 1 }}>
                                  {features[featurePopup].text}
                                </span>
                                <button
                                  onClick={() => setFeaturePopup(null)}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'rgba(147,51,234,0.1)',
                                    border: '1px solid rgba(147,51,234,0.2)',
                                    cursor: 'pointer',
                                    color: '#a1a1aa',
                                    flexShrink: 0,
                                    transition: 'background-color 0.15s, border-color 0.15s',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.25)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.2)'; }}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.7, fontWeight: 400 }}>
                                {features[featurePopup].details}
                              </p>
                            </div>
                          </div>,
                          document.body
                        )}
                      </>
                    );
                  })()}

                  {fileInfo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
                      <p style={{ fontSize: 11, color: '#52525b', marginBottom: 4, textAlign: 'center' }}>Try asking:</p>
                      {[
                        "Summarize the key statistics",
                        "Show a distribution chart",
                        "Are there any missing values?",
                      ].map((hint, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(hint)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 12,
                            backgroundColor: 'rgba(147,51,234,0.06)',
                            border: '1px solid rgba(147,51,234,0.12)',
                            color: '#e4e4e7',
                            fontSize: 13,
                            fontWeight: 450,
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.06)'}
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex relative group ${
                      msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${msg.plotlySpec ? 'w-full' : 'max-w-[80%]'}`}
                      style={{
                        backgroundColor: msg.role === "user" ? '#9333ea' : msg.role === "system" ? 'rgba(147,51,234,0.15)' : '#1a1625',
                        color: msg.role === "user" ? '#fff' : '#e4e4e7',
                      }}
                    >
                      {msg.fileName && (
                        <div
                          className="flex items-center gap-1.5 mb-1.5 text-[11px]"
                          style={{ color: msg.role === "user" ? 'rgba(255,255,255,0.7)' : '#a1a1aa' }}
                        >
                          <FileText className="w-3 h-3" />
                          <span>{msg.fileName}</span>
                        </div>
                      )}
                      {msg.type === "table" && msg.tableHeaders ? (
                        <TableBlock
                          title={msg.tableTitle || ""}
                          headers={msg.tableHeaders}
                          rows={msg.tableRows || []}
                        />
                      ) : (
                        <div
                          className="text-[13px]"
                          style={{ fontWeight: 400, color: msg.role === "user" ? '#fff' : '#e4e4e7' }}
                        >
                          <MarkdownLatex>{msg.text}</MarkdownLatex>
                        </div>
                      )}
                      {/* Copy button for assistant messages */}
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ marginTop: 6 }}>
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.text)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 6,
                              backgroundColor: "transparent",
                              border: "1px solid rgba(147,51,234,0.15)",
                              color: "#a1a1aa",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(147,51,234,0.1)"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                          >
                            {copiedId === msg.id ? (
                              <><Check className="w-3 h-3" /> Copied</>
                            ) : (
                              <><Copy className="w-3 h-3" /> Copy</>
                            )}
                          </button>
                        </div>
                      )}
                      {/* Inline chart */}
                      {msg.plotlySpec && (() => {
                        const savedCustom = plotCustomizations[msg.id];
                        const inlineSpec = savedCustom
                          ? applyPlotCustomizations(msg.plotlySpec!, {
                              color: savedCustom.color,
                              showGrid: savedCustom.showGrid,
                              xLabel: savedCustom.xLabel,
                              yLabel: savedCustom.yLabel,
                              bgColor: savedCustom.bgColor,
                            })
                          : msg.plotlySpec!;
                        return (
                        <div className="mt-6">
                          <div
                            className="rounded-lg overflow-hidden cursor-pointer"
                            data-chart-id={msg.id}
                            style={{ width: '100%', height: 280, backgroundColor: savedCustom?.bgColor || '#161328', border: '1px solid rgba(147,51,234,0.12)', transition: 'background-color 0.2s' }}
                            onClick={() => setFullscreenPlot({
                              title: msg.plotTitle || "Plot",
                              plotlySpec: msg.plotlySpec!,
                              plotId: msg.id,
                            })}
                          >
                            <PlotlyChart spec={inlineSpec} />
                          </div>
                          <div className="flex gap-[5px] mt-5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const chartEl = document.querySelector(`[data-chart-id="${msg.id}"]`) as HTMLElement;
                                handleDirectSavePlot(msg.plotTitle || "Plot", chartEl);
                              }}
                              disabled={isSavingPlot}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
                                borderRadius: 6, backgroundColor: "transparent",
                                border: "1px solid rgba(147,51,234,0.15)", color: "#a1a1aa",
                                fontSize: 11, cursor: isSavingPlot ? "not-allowed" : "pointer",
                                opacity: isSavingPlot ? 0.6 : 1,
                              }}
                              onMouseEnter={(e) => { if (!isSavingPlot) e.currentTarget.style.backgroundColor = "rgba(147,51,234,0.1)"; }}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                              {isSavingPlot ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Save
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFullscreenPlot({
                                  title: msg.plotTitle || "Plot",
                                  plotlySpec: msg.plotlySpec!,
                                  plotId: msg.id,
                                });
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
                                borderRadius: 6, backgroundColor: "transparent",
                                border: "1px solid rgba(147,51,234,0.15)", color: "#a1a1aa",
                                fontSize: 11, cursor: "pointer",
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(147,51,234,0.1)"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                              <BarChart3 className="w-3 h-3" /> Fullscreen
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPlotCode(msg.id, msg.plotlySpec!);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
                                borderRadius: 6, backgroundColor: "transparent",
                                border: "1px solid rgba(147,51,234,0.15)", color: copiedCodeId === msg.id ? "#22c55e" : "#a1a1aa",
                                fontSize: 11, cursor: "pointer",
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(147,51,234,0.1)"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                              {copiedCodeId === msg.id ? <><Check className="w-3 h-3" /> Copied</> : <><Code className="w-3 h-3" /> Code</>}
                            </button>
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-5 py-3.5" style={{ backgroundColor: '#1a1625' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full status-pulse" style={{ backgroundColor: '#9333ea' }} />
                        <span className="text-[12px]" style={{ fontWeight: 510, color: '#a1a1aa' }}>
                          {statusMessage || "Thinking..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {suggestions.length > 0 && !isLoading && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(s)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 14,
                          backgroundColor: 'rgba(147,51,234,0.10)',
                          border: '1px solid rgba(147,51,234,0.25)',
                          color: '#e4e4e7',
                          fontSize: 13,
                          fontWeight: 470,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.20)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.10)'; e.currentTarget.style.borderColor = 'rgba(147,51,234,0.25)'; }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-5" style={{ flexShrink: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.parquet,.pq"
              onChange={handleFileChange}
              className="hidden"
            />

            {!fileInfo ? (
              /* No file uploaded - show upload button only */
              <button
                onClick={handleFileAttach}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-3 transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
              >
                {isLoading ? (
                  <Loader2 className="w-[15px] h-[15px] animate-spin" style={{ color: '#fff' }} />
                ) : (
                  <>
                    <Upload className="w-[15px] h-[15px]" style={{ color: '#fff' }} />
                    <span className="text-[13px]" style={{ fontWeight: 510, color: '#fff' }}>
                      Upload CSV or Parquet
                    </span>
                  </>
                )}
              </button>
            ) : (
              /* File uploaded - show text input */
              <div className="flex items-center">
                <div className="flex-1 flex items-center gap-0.5 rounded-full px-6 py-2.5" style={{ backgroundColor: '#1a1625', border: '1px solid rgba(113,113,122,0.3)' }}>
                  <input
                    type="text"
                    placeholder="Ask anything about your data"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-[13px] outline-none"
                    style={{ fontWeight: 510, color: '#e4e4e7' }}
                  />
                  <button
                    onClick={isLoading ? handleStop : () => handleSend()}
                    disabled={!isLoading && !hasContent}
                    className={`w-[36px] h-[36px] rounded-full flex items-center justify-center relative overflow-hidden shrink-0 transition-all duration-200 ${
                      isLoading || hasContent ? "cursor-pointer" : "cursor-default"
                    }`}
                    onMouseEnter={(e) => { if (isLoading || hasContent) e.currentTarget.style.transform = 'scale(1.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
                  >
                    <div className="absolute inset-0 rounded-full" style={isLoading ? {
                      background: 'linear-gradient(135deg, rgba(147,51,234,0.6) 0%, rgba(107,33,168,0.7) 100%)',
                      border: '1px solid rgba(147,51,234,0.4)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                    } : hasContent ? {
                      background: 'linear-gradient(135deg, rgba(147,51,234,0.6) 0%, rgba(107,33,168,0.7) 100%)',
                      border: '1px solid rgba(147,51,234,0.4)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                    } : {
                      background: 'linear-gradient(135deg, rgba(63,58,74,0.6) 0%, rgba(50,45,65,0.7) 100%)',
                      border: '1px solid rgba(147,51,234,0.15)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                    }} />
                    {isLoading ? (
                      <Square className="w-[12px] h-[12px] relative z-10" style={{ color: '#fff', fill: '#fff' }} />
                    ) : (
                      <ArrowUp
                        className="w-[15px] h-[15px] relative z-10 transition-colors duration-200"
                        style={{ color: hasContent ? '#fff' : '#a1a1aa' }}
                      />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>
      )}

      {/* Fullscreen data modal — portalled to document.body to escape overflow:hidden */}
      {showFullData && fileInfo && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowFullData(false)}
        >
          <div
            style={{
              position: 'relative',
              width: isMobile ? '100vw' : '90vw',
              height: isMobile ? '100vh' : '85vh',
              maxWidth: isMobile ? undefined : 1200,
              maxHeight: isMobile ? undefined : 800,
              backgroundColor: '#1e1b2e',
              borderRadius: isMobile ? 0 : 16,
              border: isMobile ? 'none' : '1px solid rgba(147,51,234,0.25)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column' as const,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with close button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              borderBottom: '1px solid rgba(147,51,234,0.15)',
              backgroundColor: '#161328',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 590, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileInfo.filename}
                </span>
                <span style={{ fontSize: 11, color: '#a1a1aa', backgroundColor: 'rgba(147,51,234,0.1)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                  {fileInfo.row_count} rows x {fileInfo.column_count} columns
                </span>
              </div>
              <button
                onClick={() => setShowFullData(false)}
                style={{
                  flexShrink: 0,
                  marginLeft: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  backgroundColor: '#9333ea',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(147,51,234,0.4)',
                  transition: 'filter 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>&times;</span>
                Close
              </button>
            </div>

            {/* Table */}
            <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto', backgroundColor: '#1e1b2e', minHeight: 0 }}>
              <table style={{ borderCollapse: 'collapse', backgroundColor: '#1e1b2e', minWidth: 'max-content', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {fileInfo.columns.map((col, i) => (
                      <th
                        key={col}
                        style={{
                          height: 32,
                          padding: '0 12px',
                          textAlign: 'left' as const,
                          minWidth: 120,
                          backgroundColor: '#161328',
                          borderBottom: '1px solid rgba(147,51,234,0.12)',
                          ...(i > 0 ? { borderLeft: '1px solid rgba(147,51,234,0.12)' } : { paddingLeft: 16 }),
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>
                          {col}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileInfo.preview.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {fileInfo.columns.map((col, i) => (
                        <td
                          key={col}
                          style={{
                            height: 30,
                            padding: '0 12px',
                            fontSize: 12,
                            fontWeight: 400,
                            color: '#e4e4e7',
                            borderBottom: '1px solid rgba(147,51,234,0.1)',
                            whiteSpace: 'nowrap',
                            ...(i > 0 ? { borderLeft: '1px solid rgba(147,51,234,0.1)' } : { paddingLeft: 16 }),
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

            {/* Footer */}
            <div style={{
              flexShrink: 0,
              padding: '8px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(147,51,234,0.12)',
              backgroundColor: '#161328',
            }}>
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                {`${fileInfo.preview.length} of ${fileInfo.row_count} rows (preview)`}
              </span>
              <span style={{ fontSize: 10, color: '#52525b' }}>
                Press Esc to close
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile bottom navigation */}
      {isMobile && (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          backgroundColor: '#1e1b2e',
          borderTop: '1px solid rgba(147,51,234,0.2)',
          padding: '6px 0',
          paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        }}>
          {[
            { key: "chat" as const, icon: <MessageCircle className="w-[18px] h-[18px]" />, label: "Chat" },
            { key: "data" as const, icon: <TableProperties className="w-[18px] h-[18px]" />, label: "Data" },
            { key: "history" as const, icon: <FileText className="w-[18px] h-[18px]" />, label: "History" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileView(tab.key)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '4px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: mobileView === tab.key ? '#9333ea' : '#a1a1aa',
                transition: 'color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={(e) => { if (mobileView !== tab.key) e.currentTarget.style.color = '#c084fc'; }}
              onMouseLeave={(e) => { if (mobileView !== tab.key) e.currentTarget.style.color = '#a1a1aa'; }}
            >
              {tab.icon}
              <span style={{ fontSize: 10, fontWeight: 510 }}>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen plot modal */}
      {fullscreenPlot && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setFullscreenPlot(null)}
        >
          <div
            style={{
              position: 'relative',
              width: isMobile ? 'calc(100vw - 24px)' : '85vw',
              height: isMobile ? 'auto' : '80vh',
              maxWidth: isMobile ? undefined : 1100,
              maxHeight: isMobile ? '85vh' : 750,
              backgroundColor: '#1e1b2e',
              borderRadius: isMobile ? 16 : 16,
              border: '1px solid rgba(147,51,234,0.25)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column' as const,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(147,51,234,0.15)',
              backgroundColor: '#161328',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 590, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {fullscreenPlot.title}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12, alignItems: 'center' }}>
                <button
                  onClick={handleSavePlotPng}
                  disabled={isSavingPlot}
                  title="Download as PNG"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: 'rgba(147,51,234,0.12)', color: '#a1a1aa',
                    border: '1px solid rgba(147,51,234,0.2)',
                    cursor: isSavingPlot ? 'not-allowed' : 'pointer',
                    opacity: isSavingPlot ? 0.5 : 1, transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isSavingPlot) { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.25)'; e.currentTarget.style.color = '#e4e4e7'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'; e.currentTarget.style.color = '#a1a1aa'; }}
                >
                  {isSavingPlot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleCopyPlotCode(fullscreenPlot.plotId, fullscreenPlot.plotlySpec)}
                  title="Copy Plotly JSON spec"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: copiedCodeId === fullscreenPlot.plotId ? 'rgba(34,197,94,0.15)' : 'rgba(147,51,234,0.12)',
                    color: copiedCodeId === fullscreenPlot.plotId ? '#22c55e' : '#a1a1aa',
                    border: copiedCodeId === fullscreenPlot.plotId ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(147,51,234,0.2)',
                    cursor: 'pointer', transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { if (copiedCodeId !== fullscreenPlot.plotId) { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.25)'; e.currentTarget.style.color = '#e4e4e7'; } }}
                  onMouseLeave={(e) => { if (copiedCodeId !== fullscreenPlot.plotId) { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'; e.currentTarget.style.color = '#a1a1aa'; } }}
                >
                  {copiedCodeId === fullscreenPlot.plotId ? <Check className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setFullscreenPlot(null)}
                  title="Close"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: 'rgba(147,51,234,0.12)', color: '#a1a1aa',
                    border: '1px solid rgba(147,51,234,0.2)', cursor: 'pointer',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.15)'; e.currentTarget.style.color = '#f87171'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.12)'; e.currentTarget.style.color = '#a1a1aa'; }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Body: chart + sidebar */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
              {/* Chart area */}
              <div ref={plotExportRef} style={{ flex: 1, minWidth: 0, padding: 16, backgroundColor: activePlotCustom.bgColor || 'transparent', transition: 'background-color 0.2s' }}>
                {customizedFullscreenSpec && <PlotlyChart spec={customizedFullscreenSpec} interactive={activePlotCustom.zoomEnabled} />}
              </div>
              {/* Customization sidebar */}
              <div style={{
                width: isMobile ? '100%' : 200,
                flexShrink: 0,
                borderLeft: '1px solid rgba(147,51,234,0.12)',
                backgroundColor: '#161328',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* Colors category */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(147,51,234,0.08)' }}>
                  <span style={{ fontSize: 10, fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trace Color</span>
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {PLOT_COLOR_PRESETS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => updatePlotCustom({ color: activePlotCustom.color === c.value ? null : c.value })}
                        style={{
                          width: 22, height: 22, borderRadius: 99, backgroundColor: c.value,
                          border: activePlotCustom.color === c.value ? '2.5px solid #fff' : '2px solid transparent',
                          outline: activePlotCustom.color === c.value ? '1px solid rgba(147,51,234,0.5)' : 'none',
                          cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
                        }}
                        title={c.name}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = ''}
                      />
                    ))}
                  </div>
                </div>
                {/* Background category */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(147,51,234,0.08)' }}>
                  <span style={{ fontSize: 10, fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Background</span>
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {PLOT_BG_PRESETS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => updatePlotCustom({ bgColor: activePlotCustom.bgColor === c.value ? null : c.value })}
                        style={{
                          width: 22, height: 22, borderRadius: 6, backgroundColor: c.value,
                          border: activePlotCustom.bgColor === c.value ? '2.5px solid #9333ea' : '1px solid rgba(255,255,255,0.12)',
                          cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
                        }}
                        title={c.name}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = ''}
                      />
                    ))}
                  </div>
                </div>
                {/* View category */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(147,51,234,0.08)' }}>
                  <span style={{ fontSize: 10, fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>View</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => updatePlotCustom({ showGrid: !activePlotCustom.showGrid })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                        borderRadius: 7, width: '100%',
                        backgroundColor: activePlotCustom.showGrid ? 'rgba(147,51,234,0.15)' : 'rgba(255,255,255,0.03)',
                        border: activePlotCustom.showGrid ? '1px solid rgba(147,51,234,0.35)' : '1px solid rgba(255,255,255,0.06)',
                        color: activePlotCustom.showGrid ? '#c084fc' : '#52525b',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <Grid3X3 className="w-3.5 h-3.5" /> Grid lines
                    </button>
                    <button
                      onClick={() => updatePlotCustom({ zoomEnabled: !activePlotCustom.zoomEnabled })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                        borderRadius: 7, width: '100%',
                        backgroundColor: activePlotCustom.zoomEnabled ? 'rgba(147,51,234,0.15)' : 'rgba(255,255,255,0.03)',
                        border: activePlotCustom.zoomEnabled ? '1px solid rgba(147,51,234,0.35)' : '1px solid rgba(255,255,255,0.06)',
                        color: activePlotCustom.zoomEnabled ? '#c084fc' : '#52525b',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <ZoomIn className="w-3.5 h-3.5" /> Zoom & Pan
                    </button>
                  </div>
                </div>
                {/* Labels category */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(147,51,234,0.08)' }}>
                  <span style={{ fontSize: 10, fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Axis Labels</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: '#52525b', marginBottom: 3, display: 'block' }}>X Axis</label>
                      <input
                        type="text"
                        value={activePlotCustom.xLabel}
                        onChange={(e) => updatePlotCustom({ xLabel: e.target.value })}
                        placeholder="X axis label"
                        style={{
                          width: '100%', padding: '4px 8px', borderRadius: 6,
                          backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: '#e4e4e7', fontSize: 12, outline: 'none', transition: 'border-color 0.15s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: '#52525b', marginBottom: 3, display: 'block' }}>Y Axis</label>
                      <input
                        type="text"
                        value={activePlotCustom.yLabel}
                        onChange={(e) => updatePlotCustom({ yLabel: e.target.value })}
                        placeholder="Y axis label"
                        style={{
                          width: '100%', padding: '4px 8px', borderRadius: 6,
                          backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: '#e4e4e7', fontSize: 12, outline: 'none', transition: 'border-color 0.15s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(147,51,234,0.4)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                      />
                    </div>
                  </div>
                </div>
                {/* Reset */}
                <div style={{ padding: '12px 14px', marginTop: 'auto' }}>
                  <button
                    onClick={() => {
                      if (!fullscreenPlot) return;
                      const ly = (fullscreenPlot.plotlySpec.layout || {}) as Record<string, unknown>;
                      updatePlotCustom({
                        ...DEFAULT_PLOT_CUSTOM,
                        xLabel: extractAxisTitle(ly.xaxis),
                        yLabel: extractAxisTitle(ly.yaxis),
                      });
                    }}
                    title="Reset all customizations"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 7, width: '100%',
                      backgroundColor: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.18)',
                      color: '#f87171', fontSize: 12, fontWeight: 510, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.12)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.35)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.06)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.18)'; }}
                  >
                    <X className="w-3.5 h-3.5" /> Reset All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
