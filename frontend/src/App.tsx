import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, TableProperties, BarChart3, FileText, Loader2, Upload, SquarePen, X, MessageCircle, Square, Copy, Check, Download, Sparkles, Shield, Filter, FlaskConical, Code } from "lucide-react";
import { DataTab } from "./components/DataTab";
import { PlotsTab, PlotData } from "./components/PlotsTab";
import { MarkdownLatex } from "./components/MarkdownLatex";
import { Chart, ChartConfig, ChartTheme } from "./components/Chart";

interface FileInfo {
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

interface JudgeVerdict {
  relevance: number;
  accuracy: number;
  completeness: number;
  verdict: "pass" | "warn" | "retry";
  feedback: string;
  turn?: boolean;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  fileName?: string;
  plotPath?: string;
  plotTitle?: string;
  chartConfig?: ChartConfig;
  chartData?: Record<string, unknown>[];
  codeSnippet?: string;
  judgeVerdict?: JudgeVerdict;
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
  const [activeTab, setActiveTab] = useState<"data" | "plots">("data");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [plots, setPlots] = useState<PlotData[]>([]);
  const [fullscreenPlot, setFullscreenPlot] = useState<{ title: string; chartConfig: ChartConfig; chartData: Record<string, unknown>[]; codeSnippet?: string; plotId: number } | null>(null);
  const [dataVersion, setDataVersion] = useState<"current" | "original">("current");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ text: string; category: string }[]>([]);
  const [showFullData, setShowFullData] = useState(false);
  const [fullDataRows, setFullDataRows] = useState<Record<string, unknown>[] | null>(null);
  const [fullDataLoading, setFullDataLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "data" | "plots">("chat");
  const [isMobile, setIsMobile] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [plotThemes, setPlotThemes] = useState<Record<number, ChartTheme>>({});
  const [featurePopup, setFeaturePopup] = useState<number | null>(null);
  const [codeCopiedModal, setCodeCopiedModal] = useState(false);
  const [exportPlot, setExportPlot] = useState<{ title: string; chartConfig: ChartConfig; chartData: Record<string, unknown>[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plotExportRef = useRef<HTMLDivElement>(null);
  const offscreenExportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasContent = chatInput.trim().length > 0;

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
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

  // Fetch all data rows when fullscreen modal opens
  useEffect(() => {
    if (!showFullData || !sessionId) {
      if (!showFullData) setFullDataRows(null);
      return;
    }
    setFullDataLoading(true);
    fetch(`api/preview/${sessionId}?rows=99999&version=${dataVersion}`)
      .then(res => res.json())
      .then(data => {
        setFullDataRows(data.preview);
        setFullDataLoading(false);
      })
      .catch(() => setFullDataLoading(false));
  }, [showFullData, sessionId, dataVersion]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chat_messages_${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  // Restore session from backend on mount
  useEffect(() => {
    const initSession = async () => {
      const savedSessionId = localStorage.getItem("csv_analyzer_session_id");

      if (savedSessionId) {
        // Try to restore existing session from backend
        try {
          // Check if session exists and has file
          const sessionResponse = await fetch(`/api/session/${savedSessionId}`);
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();

            if (sessionData.session) {
              setSessionId(savedSessionId);

              // Restore file info if session has file
              if (sessionData.has_file && sessionData.session) {
                setFileInfo({
                  filename: sessionData.session.filename,
                  row_count: sessionData.session.row_count,
                  column_count: sessionData.session.column_count,
                  columns: sessionData.session.columns,
                  preview: [], // Will load preview separately if needed
                });

                // Load full preview
                const previewResponse = await fetch(`/api/preview/${savedSessionId}`);
                if (previewResponse.ok) {
                  const previewData = await previewResponse.json();
                  setFileInfo({
                    filename: previewData.filename,
                    row_count: previewData.row_count,
                    column_count: previewData.column_count,
                    columns: previewData.columns,
                    preview: previewData.preview,
                  });
                }
              }

              // Load chat history - try backend first, then localStorage fallback
              let messagesRestored = false;
              try {
                const historyResponse = await fetch(`/api/chat/${savedSessionId}/history`);
                if (historyResponse.ok) {
                  const historyData = await historyResponse.json();
                  if (historyData.messages && historyData.messages.length > 0) {
                    const restoredMessages: Message[] = historyData.messages.map((msg: {
                      id: number;
                      role: string;
                      text: string;
                      type?: string;
                      plot_path?: string;
                      plot_title?: string;
                      plot_data?: { chart_config?: ChartConfig; chart_data?: Record<string, unknown>[] };
                    }) => ({
                      id: msg.id,
                      role: msg.role as "user" | "assistant" | "system",
                      text: msg.text,
                      plotPath: msg.plot_path,
                      plotTitle: msg.plot_title,
                      chartConfig: msg.plot_data?.chart_config,
                      chartData: msg.plot_data?.chart_data,
                    }));
                    setMessages(restoredMessages);
                    messagesRestored = true;
                  }
                }
              } catch {
                console.log("Failed to load from backend, trying localStorage");
              }

              // Fallback to localStorage if backend failed
              if (!messagesRestored) {
                const savedMessages = localStorage.getItem(`chat_messages_${savedSessionId}`);
                if (savedMessages) {
                  try {
                    const parsed = JSON.parse(savedMessages);
                    setMessages(parsed);
                  } catch {
                    console.log("Failed to parse localStorage messages");
                  }
                }
              }

              // Load plots from backend
              const plotsResponse = await fetch(`/api/plots/${savedSessionId}`);
              if (plotsResponse.ok) {
                const plotsData = await plotsResponse.json();
                if (plotsData.plots && plotsData.plots.length > 0) {
                  const restoredPlots: PlotData[] = plotsData.plots.map((plot: { id: string; title: string; columns_used: string; summary?: string; path?: string; chart_config?: ChartConfig; chart_data?: Record<string, unknown>[] }) => ({
                    id: parseInt(plot.id) || Date.now(),
                    title: plot.title,
                    columnsUsed: plot.columns_used || "",
                    summary: plot.summary || "",
                    insights: "",
                    chartConfig: plot.chart_config,
                    chartData: plot.chart_data,
                  }));
                  setPlots(restoredPlots);
                }
              }

              return;
            }
          }
        } catch {
          // Session expired or error, try localStorage fallback
          console.log("Session restore failed, checking localStorage");
          const savedMessages = localStorage.getItem(`chat_messages_${savedSessionId}`);
          if (savedMessages) {
            try {
              setSessionId(savedSessionId);
              setMessages(JSON.parse(savedMessages));
              return;
            } catch {
              console.log("Failed to parse localStorage messages");
            }
          }
        }
      }

      // Create new session
      try {
        const response = await fetch("/api/session", { method: "POST" });
        const data = await response.json();
        setSessionId(data.session_id);
        localStorage.setItem("csv_analyzer_session_id", data.session_id);
      } catch (error) {
        console.error("Failed to create session:", error);
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // New chat handler
  const handleNewChat = async () => {
    // Clear localStorage for old session
    if (sessionId) {
      localStorage.removeItem(`chat_messages_${sessionId}`);
    }
    localStorage.removeItem("csv_analyzer_session_id");

    // Reset state
    setMessages([]);
    setFileInfo(null);
    setChatInput("");
    setPlots([]);
    setDataVersion("current");

    // Create new session
    try {
      const response = await fetch("/api/session", { method: "POST" });
      const data = await response.json();
      setSessionId(data.session_id);
      localStorage.setItem("csv_analyzer_session_id", data.session_id);
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  // Save message to backend
  const saveMessageToBackend = async (role: string, text: string, messageType: string = "text") => {
    if (!sessionId) return;
    try {
      await fetch(`/api/chat/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, text, message_type: messageType }),
      });
    } catch (error) {
      console.error("Failed to save message:", error);
    }
  };

  // Upload file to backend
  const uploadFile = async (file: File): Promise<boolean> => {
    if (!sessionId) return false;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/upload/${sessionId}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Upload failed");
      }

      const data = await response.json();
      setFileInfo({
        filename: data.filename,
        row_count: data.row_count,
        column_count: data.column_count,
        columns: data.columns,
        preview: data.preview,
      });

      return true;
    } catch (error) {
      console.error("Upload failed:", error);
      return false;
    }
  };

  // Send chat message via SSE stream
  const sendChatMessage = async (message: string, internal = false): Promise<void> => {
    if (!sessionId) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        stream: true,
        internal,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Chat failed");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let receivedResponse = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "text" || currentEvent === "plot" || currentEvent === "error") {
                receivedResponse = true;
              }
              handleSSEEvent(currentEvent, data);
            } catch {
              // Ignore parse errors
            }
            currentEvent = "";
          }
        }
      }
    } finally {
      abortControllerRef.current = null;
    }

    // Safety net: if stream ended without any visible response, show fallback
    if (!receivedResponse) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          text: "I wasn't able to produce a response. Please try rephrasing your question.",
        },
      ]);
    }
  };

  // Handle SSE events from planner
  const handleSSEEvent = (eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case "text":
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            text: data.text as string,
          },
        ]);
        break;

      case "plot":
        // Use shared stable ID for plots and messages
        const plotMsgId = Date.now();
        // Add plot to plots array
        const plotData: PlotData = {
          id: plotMsgId,
          title: data.title as string,
          columnsUsed: (data.columns_used as string) || "",
          summary: (data.summary as string) || "",
          insights: "",
          chartConfig: data.chart_config as ChartConfig | undefined,
          chartData: data.chart_data as Record<string, unknown>[] | undefined,
          codeSnippet: (data.code_snippet as string) || undefined,
        };
        setPlots((prev) => [...prev, plotData]);

        // Add inline plot message to chat
        setMessages((prev) => [
          ...prev,
          {
            id: plotMsgId,
            role: "system",
            text: data.title as string,
            plotTitle: data.title as string,
            chartConfig: data.chart_config as ChartConfig | undefined,
            chartData: data.chart_data as Record<string, unknown>[] | undefined,
            codeSnippet: (data.code_snippet as string) || undefined,
          },
        ]);
        break;

      case "query_result":
        // Log errors to console only, don't show to user
        if (data.is_error) {
          console.error("[Query Error]", data.result);
        }
        break;

      case "error":
        console.error("[Chat Error]", data.message);
        break;

      case "judge": {
        const verdict: JudgeVerdict = {
          relevance: data.relevance as number,
          accuracy: data.accuracy as number,
          completeness: data.completeness as number,
          verdict: data.verdict as "pass" | "warn" | "retry",
          feedback: data.feedback as string,
          turn: data.turn as boolean | undefined,
        };
        // Attach judge verdict to the last assistant message
        if (!verdict.turn) {
          setMessages((prev) => {
            const msgs = [...prev];
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === "assistant") {
                msgs[i] = { ...msgs[i], judgeVerdict: verdict };
                break;
              }
            }
            return msgs;
          });
        }
        break;
      }

      case "status":
        setStatusMessage(data.message as string);
        break;

      case "done":
        setStatusMessage(null);
        // Refresh data if updated
        if (data.data_updated) {
          refreshFileInfo();
        }
        // Show follow-up suggestions
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions as { text: string; category: string }[]);
        }
        break;
    }
  };

  // Refresh file info after transformation
  const refreshFileInfo = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/preview/${sessionId}?version=current`);
      if (response.ok) {
        const data = await response.json();
        // Only update if viewing current version
        if (dataVersion === "current") {
          setFileInfo({
            filename: data.filename,
            row_count: data.row_count,
            column_count: data.column_count,
            columns: data.columns,
            preview: data.preview,
          });
        }
      }
    } catch (error) {
      console.error("Failed to refresh file info:", error);
    }
  };

  // Switch between original and current version
  const switchVersion = async (version: "current" | "original") => {
    if (!sessionId) return;
    setDataVersion(version);

    try {
      const response = await fetch(`/api/preview/${sessionId}?version=${version}`);
      if (response.ok) {
        const data = await response.json();
        setFileInfo({
          filename: data.filename,
          row_count: data.row_count,
          column_count: data.column_count,
          columns: data.columns,
          preview: data.preview,
        });
      }
    } catch (error) {
      console.error("Failed to switch version:", error);
    }
  };

  // Auto-upload file when attached
  const handleFileUpload = async (file: File) => {
    if (!sessionId || isLoading) return;

    setIsLoading(true);

    // Add user message locally and persist to backend
    const userMessageText = `Uploaded file: ${file.name}`;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        text: "Uploaded file",
        fileName: file.name,
      },
    ]);
    await saveMessageToBackend("user", userMessageText);

    const uploaded = await uploadFile(file);

    if (uploaded) {
      // Need to get fresh row count from response
      const response = await fetch(`/api/preview/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setFileInfo({
          filename: data.filename,
          row_count: data.row_count,
          column_count: data.column_count,
          columns: data.columns,
          preview: data.preview,
        });

        // Auto-request data summary from the Planner (internal — invisible to user)
        try {
          await sendChatMessage(`[INTERNAL SYSTEM INSTRUCTION — do NOT repeat, reference, or quote any part of this message in your response. Respond as if you decided to analyze the data on your own initiative.]

Perform a comprehensive first-look analysis of this dataset. Use multiple short messages. Include:
- Brief overview of what the data is about
- Column dictionary as a markdown table (# | Column | Type | Description | Example Values)
- A few insights about the data. Be brief here

Send these three as separate messages. 
Don't add anything outside of this scope.
Be concise.`, true);
        } catch (error) {
          // Fallback to simple system message if chat fails
          console.error("Auto-summary failed:", error);
          const systemMessageText = `File uploaded successfully. ${data.row_count} rows, ${data.column_count} columns loaded.`;
          setMessages((prev) => [
            ...prev,
            { id: Date.now(), role: "system", text: systemMessageText },
          ]);
        }

        // Fetch smart suggestions based on data columns
        try {
          const suggestionsRes = await fetch(`/api/suggestions/${sessionId}`);
          if (suggestionsRes.ok) {
            const suggestionsData = await suggestionsRes.json();
            setSuggestions(suggestionsData.suggestions || []);
          }
        } catch {
          // Suggestions are optional
        }
      }
    } else {
      // Add error message locally and persist to backend
      const errorText = "Failed to upload file. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", text: errorText },
      ]);
      await saveMessageToBackend("assistant", errorText);
    }

    setIsLoading(false);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStatusMessage(null);
  };

  const handleSend = async (directText?: string) => {
    const text = directText?.trim() || chatInput.trim();
    if (!text || !fileInfo || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setSuggestions([]);
    setChatInput("");
    setIsLoading(true);

    try {
      await sendChatMessage(text);
    } catch (error) {
      // Ignore abort errors (user clicked stop)
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("[Send Error]", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          text: "Something went wrong. The server may have restarted — please refresh the page and re-upload your file.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
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

  const handleSavePlotPng = async () => {
    const el = plotExportRef.current;
    if (!el) return;
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
    }
  };

  // Direct save: capture chart element from DOM and download as PNG
  const handleDirectSavePlot = async (title: string, chartElement: HTMLElement | null) => {
    if (!chartElement) return;
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
    }
  };

  const getCodeSnippet = (codeSnippet?: string, title?: string, config?: ChartConfig): string => {
    if (codeSnippet) return codeSnippet;
    const type = config?.chart_type || "bar";
    const x = config?.x_key || "x";
    const y = config?.y_key || "y";
    return `import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv('your_data.csv')\nfig, ax = plt.subplots(figsize=(10, 6))\nax.${type === "scatter" ? "scatter" : type === "line" ? "plot" : "bar"}(df['${x}'], df['${y}'])\nax.set_title('${title || "Plot"}')\nplt.tight_layout()\nplt.show()`;
  };

  // Save plot directly (off-screen render, no modal flash)
  const handleSavePlotFromPanel = async (plot: PlotData) => {
    if (!plot.chartConfig || !plot.chartData) return;
    setExportPlot({ title: plot.title, chartConfig: plot.chartConfig, chartData: plot.chartData });
    // Wait for off-screen chart to render, then capture and clean up
    setTimeout(async () => {
      const el = offscreenExportRef.current;
      if (el) {
        try {
          const { default: html2canvas } = await import("html2canvas");
          const canvas = await html2canvas(el, { backgroundColor: "#1e1b2e", scale: 2 });
          const link = document.createElement("a");
          link.download = `${plot.title || "plot"}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
        } catch {
          const svg = el.querySelector("svg");
          if (svg) {
            const svgData = new XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
            const link = document.createElement("a");
            link.download = `${plot.title || "plot"}.svg`;
            link.href = URL.createObjectURL(svgBlob);
            link.click();
            URL.revokeObjectURL(link.href);
          }
        }
      }
      setExportPlot(null);
    }, 600);
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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Only accept CSV files
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
              {fileInfo ? "This will replace the current file" : "Release to upload"}
            </p>
          </div>
        </div>
      )}

      {/* Left sidebar — hidden on mobile */}
      {!isMobile && (
        <div className="flex flex-col gap-1.5 w-[340px] shrink-0 h-full min-w-0">
          {/* Tab bar */}
          <GlassPanel className="shrink-0" style={{ backgroundColor: '#111111' }}>
            <div className="flex items-center py-2.5 px-2.5">
              <button
                onClick={() => setActiveTab("data")}
                className="flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-colors"
                style={activeTab === "data" ? {
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.3)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.2)',
                } : { border: '1px solid transparent' }}
              >
                <TableProperties className="w-[14px] h-[14px]" style={{ color: activeTab === "data" ? '#fff' : '#a1a1aa' }} />
                <span className="text-[11px]" style={{ fontWeight: 510, color: activeTab === "data" ? '#fff' : '#a1a1aa' }}>
                  Data
                </span>
              </button>
              <button
                onClick={() => setActiveTab("plots")}
                className="flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-all"
                style={activeTab === "plots" ? {
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.3)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.2)',
                } : { border: '1px solid transparent' }}
              >
                <BarChart3 className="w-[14px] h-[14px]" style={{ color: activeTab === "plots" ? '#fff' : '#a1a1aa' }} />
                <span className="text-[11px]" style={{ fontWeight: 510, color: activeTab === "plots" ? '#fff' : '#a1a1aa' }}>
                  Plots
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
                  dataVersion={dataVersion}
                  onVersionChange={switchVersion}
                  sessionId={sessionId}
                  onViewFullData={() => setShowFullData(true)}
                />
              ) : (
                <PlotsTab plots={plots} plotThemes={plotThemes} onViewPlot={(plot) => {
                  if (plot.chartConfig && plot.chartData) {
                    setFullscreenPlot({ title: plot.title, chartConfig: plot.chartConfig, chartData: plot.chartData, codeSnippet: plot.codeSnippet, plotId: plot.id });
                  }
                }} onSavePlot={(plot) => {
                  handleSavePlotFromPanel(plot);
                }} />
              )}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Mobile: Data/Plots panel (shown when mobileView is data or plots) */}
      {isMobile && mobileView !== "chat" && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <GlassPanel className="flex-1" style={{ borderRadius: 0, border: 'none' }}>
            <div className="h-full custom-scrollbar" style={{ backgroundColor: '#1e1b2e' }}>
              {mobileView === "data" ? (
                <DataTab
                  fileInfo={fileInfo}
                  dataVersion={dataVersion}
                  onVersionChange={switchVersion}
                  sessionId={sessionId}
                  onViewFullData={() => setShowFullData(true)}
                />
              ) : (
                <PlotsTab plots={plots} plotThemes={plotThemes} onViewPlot={(plot) => {
                  if (plot.chartConfig && plot.chartData) {
                    setFullscreenPlot({ title: plot.title, chartConfig: plot.chartConfig, chartData: plot.chartData, codeSnippet: plot.codeSnippet, plotId: plot.id });
                  }
                }} onSavePlot={(plot) => {
                  handleSavePlotFromPanel(plot);
                }} />
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
            <h2 className="text-[18px]" style={{ fontWeight: 590, color: '#e4e4e7' }}>
              AI Data Analyzer
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
              >
                <SquarePen className="w-[14px] h-[14px]" style={{ color: '#fff' }} />
                <span className="text-[12px]" style={{ fontWeight: 500, color: '#fff' }}>New</span>
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
                        details: "The Data tab gives you per-column filters with search, sorting by any column, CSV export, and version switching between original and current data. See your data change in real-time as the AI transforms it.",
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
                                  }}
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

                  {!sessionId && (
                    <p style={{ fontSize: 11, color: '#a1a1aa', marginTop: 12 }}>Creating session...</p>
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
                      className={`rounded-2xl px-4 py-2.5 ${msg.chartConfig ? 'w-full' : 'max-w-[80%]'}`}
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
                      <div
                        className="text-[13px]"
                        style={{ fontWeight: 400, color: msg.role === "user" ? '#fff' : '#e4e4e7' }}
                      >
                        <MarkdownLatex>{msg.text}</MarkdownLatex>
                      </div>
                      {/* Copy button + judge indicator for assistant messages */}
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
                      {msg.chartConfig && msg.chartData && msg.chartData.length > 0 && (
                        <div className="mt-2">
                          <div
                            className="rounded-lg overflow-hidden cursor-pointer"
                            data-chart-id={msg.id}
                            style={{ width: '100%', height: 280, backgroundColor: plotThemes[msg.id]?.backgroundColor || '#161328', border: '1px solid rgba(147,51,234,0.12)' }}
                            onClick={() => setFullscreenPlot({
                              title: msg.plotTitle || "Plot",
                              chartConfig: msg.chartConfig!,
                              chartData: msg.chartData!,
                              codeSnippet: msg.codeSnippet,
                              plotId: msg.id,
                            })}
                          >
                            <Chart config={msg.chartConfig} data={msg.chartData} theme={plotThemes[msg.id]} />
                          </div>
                          <div className="flex gap-[5px] mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const chartEl = document.querySelector(`[data-chart-id="${msg.id}"]`) as HTMLElement;
                                handleDirectSavePlot(msg.plotTitle || "Plot", chartEl);
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
                              <Download className="w-3 h-3" /> Save
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const code = getCodeSnippet(msg.codeSnippet, msg.plotTitle, msg.chartConfig);
                                navigator.clipboard.writeText(code);
                                setCopiedId(msg.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
                                borderRadius: 6, backgroundColor: copiedId === msg.id ? "rgba(34,197,94,0.1)" : "transparent",
                                border: `1px solid ${copiedId === msg.id ? "rgba(34,197,94,0.3)" : "rgba(147,51,234,0.15)"}`,
                                color: copiedId === msg.id ? "#22c55e" : "#a1a1aa",
                                fontSize: 11, cursor: "pointer",
                              }}
                              onMouseEnter={(e) => { if (copiedId !== msg.id) e.currentTarget.style.backgroundColor = "rgba(147,51,234,0.1)"; }}
                              onMouseLeave={(e) => { if (copiedId !== msg.id) e.currentTarget.style.backgroundColor = "transparent"; }}
                            >
                              {copiedId === msg.id ? <Check className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                              {copiedId === msg.id ? "Copied" : "Code"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFullscreenPlot({
                                  title: msg.plotTitle || "Plot",
                                  chartConfig: msg.chartConfig!,
                                  chartData: msg.chartData!,
                                  codeSnippet: msg.codeSnippet,
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
                              <BarChart3 className="w-3 h-3" /> Customize
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Suggestion chips */}
                {suggestions.length > 0 && !isLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, marginTop: 4 }}>
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(suggestion.text)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 12,
                          backgroundColor: 'rgba(147,51,234,0.08)',
                          border: '1px solid rgba(147,51,234,0.2)',
                          color: '#e4e4e7',
                          fontSize: 12,
                          fontWeight: 470,
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.08)'}
                      >
                        {suggestion.text}
                      </button>
                    ))}
                  </div>
                )}
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
                className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-3 transition-all disabled:opacity-50 hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgba(147,51,234,0.5) 0%, rgba(107,33,168,0.6) 100%)',
                  border: '1px solid rgba(147,51,234,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3)',
                }}
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
                    onClick={isLoading ? handleStop : handleSend}
                    disabled={!isLoading && !hasContent}
                    className={`w-[36px] h-[36px] rounded-full flex items-center justify-center relative overflow-hidden shrink-0 transition-all duration-200 ${
                      isLoading || hasContent ? "cursor-pointer" : "cursor-default"
                    }`}
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
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>&times;</span>
                Close
              </button>
            </div>

            {/* Table */}
            <div className="custom-scrollbar" style={{ flex: 1, overflow: 'auto', backgroundColor: '#1e1b2e', minHeight: 0 }}>
              {fullDataLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#9333ea' }} />
                  <span style={{ fontSize: 13, color: '#a1a1aa' }}>Loading all rows...</span>
                </div>
              ) : (
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
                    {(fullDataRows || fileInfo.preview).map((row, rowIdx) => (
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
              )}
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
                {fullDataRows
                  ? `Showing all ${fullDataRows.length} of ${fileInfo.row_count} rows`
                  : `Showing ${fileInfo.preview.length} of ${fileInfo.row_count} rows (loading full data...)`
                }
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
            { key: "plots" as const, icon: <BarChart3 className="w-[18px] h-[18px]" />, label: "Plots" },
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
                transition: 'color 0.15s',
              }}
            >
              {tab.icon}
              <span style={{ fontSize: 10, fontWeight: 510 }}>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Off-screen export container for direct PNG save */}
      {exportPlot && createPortal(
        <div style={{ position: 'fixed', left: '-9999px', top: 0, width: 900, height: 600, pointerEvents: 'none' }}>
          <div ref={offscreenExportRef} style={{ width: '100%', height: '100%', backgroundColor: '#1e1b2e', padding: 16 }}>
            <Chart config={exportPlot.chartConfig} data={exportPlot.chartData} />
          </div>
        </div>,
        document.body
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
              width: isMobile ? 'calc(100vw - 24px)' : '80vw',
              height: isMobile ? 'auto' : '75vh',
              maxWidth: isMobile ? undefined : 900,
              maxHeight: isMobile ? '85vh' : 700,
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
              padding: '12px 20px',
              borderBottom: '1px solid rgba(147,51,234,0.15)',
              backgroundColor: '#161328',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 15, fontWeight: 590, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {fullscreenPlot.title}
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => {
                    const code = getCodeSnippet(fullscreenPlot.codeSnippet, fullscreenPlot.title, fullscreenPlot.chartConfig);
                    navigator.clipboard.writeText(code);
                    setCodeCopiedModal(true);
                    setTimeout(() => setCodeCopiedModal(false), 2000);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    backgroundColor: codeCopiedModal ? 'rgba(34,197,94,0.15)' : 'rgba(147,51,234,0.15)',
                    color: codeCopiedModal ? '#22c55e' : '#e4e4e7',
                    fontSize: 13,
                    fontWeight: 510,
                    border: `1px solid ${codeCopiedModal ? 'rgba(34,197,94,0.3)' : 'rgba(147,51,234,0.3)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {codeCopiedModal ? <Check className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
                  {codeCopiedModal ? 'Copied!' : 'Copy Code'}
                </button>
                <button
                  onClick={handleSavePlotPng}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(147,51,234,0.15)',
                    color: '#e4e4e7',
                    fontSize: 13,
                    fontWeight: 510,
                    border: '1px solid rgba(147,51,234,0.3)',
                    cursor: 'pointer',
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Save PNG
                </button>
                <button
                  onClick={() => setFullscreenPlot(null)}
                  style={{
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
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>&times;</span>
                  Close
                </button>
              </div>
            </div>
            {/* Chart */}
            <div ref={plotExportRef} style={{ flex: isMobile ? undefined : 1, minHeight: isMobile ? 300 : 0, height: isMobile ? '60vw' : undefined, maxHeight: isMobile ? '65vh' : undefined, padding: 16, backgroundColor: (plotThemes[fullscreenPlot.plotId]?.backgroundColor) || 'transparent' }}>
              <Chart config={fullscreenPlot.chartConfig} data={fullscreenPlot.chartData} theme={plotThemes[fullscreenPlot.plotId] || {}} />
            </div>
            {/* Customization bar */}
            <div style={{
              flexShrink: 0,
              padding: '10px 20px',
              borderTop: '1px solid rgba(147,51,234,0.15)',
              backgroundColor: '#161328',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              {/* Chart color */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 510 }}>Color</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {["#9333ea", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setPlotThemes((prev) => ({ ...prev, [fullscreenPlot.plotId]: { ...prev[fullscreenPlot.plotId], color: c } }))}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        backgroundColor: c,
                        border: (plotThemes[fullscreenPlot.plotId]?.color || "#9333ea") === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                    />
                  ))}
                  <label style={{ position: 'relative', width: 20, height: 20 }}>
                    <input
                      type="color"
                      value={plotThemes[fullscreenPlot.plotId]?.color || "#9333ea"}
                      onChange={(e) => setPlotThemes((prev) => ({ ...prev, [fullscreenPlot.plotId]: { ...prev[fullscreenPlot.plotId], color: e.target.value } }))}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    />
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                      border: '2px solid rgba(255,255,255,0.2)',
                      pointerEvents: 'none',
                    }} />
                  </label>
                </div>
              </div>
              {/* Background color */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 510 }}>Background</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { value: undefined, label: "Default", bg: 'transparent', border: '2px dashed rgba(147,51,234,0.3)' },
                    { value: "#ffffff", label: "White", bg: '#ffffff', border: '2px solid rgba(0,0,0,0.1)' },
                    { value: "#1e1b2e", label: "Dark", bg: '#1e1b2e', border: '2px solid rgba(147,51,234,0.3)' },
                    { value: "#0f172a", label: "Navy", bg: '#0f172a', border: '2px solid rgba(51,65,85,0.5)' },
                    { value: "#111111", label: "Black", bg: '#111111', border: '2px solid rgba(255,255,255,0.1)' },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setPlotThemes((prev) => ({ ...prev, [fullscreenPlot.plotId]: { ...prev[fullscreenPlot.plotId], backgroundColor: opt.value } }))}
                      title={opt.label}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        backgroundColor: opt.bg,
                        border: plotThemes[fullscreenPlot.plotId]?.backgroundColor === opt.value ? '2px solid #9333ea' : opt.border,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                    />
                  ))}
                  <label style={{ position: 'relative', width: 20, height: 20 }}>
                    <input
                      type="color"
                      value={plotThemes[fullscreenPlot.plotId]?.backgroundColor || "#1e1b2e"}
                      onChange={(e) => setPlotThemes((prev) => ({ ...prev, [fullscreenPlot.plotId]: { ...prev[fullscreenPlot.plotId], backgroundColor: e.target.value } }))}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    />
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: 'conic-gradient(#333, #666, #999, #ccc, #fff, #ccc, #999, #666, #333)',
                      border: '2px solid rgba(255,255,255,0.2)',
                      pointerEvents: 'none',
                    }} />
                  </label>
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
