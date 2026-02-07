import { useState, useRef, useEffect } from "react";
import { ArrowUp, Paperclip, TableProperties, BarChart3, FileText, Loader2, Upload, SquarePen, X } from "lucide-react";
import { DataTab } from "./components/DataTab";
import { PlotsTab, PlotData } from "./components/PlotsTab";
import { MarkdownLatex } from "./components/MarkdownLatex";

interface FileInfo {
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  fileName?: string;
  plotPath?: string;  // Path to inline plot image
  plotTitle?: string; // Title for the plot
}

function GlassPanel({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative rounded-[18px] overflow-hidden flex flex-col ${className || ""}`}
      style={{ minHeight: 0, ...style }}
    >
      {/* Background fill */}
      <div className="absolute inset-0 rounded-[18px]">
        <div className="absolute inset-0 pointer-events-none rounded-[18px]">
          <div className="absolute bg-[#262626] inset-0 mix-blend-color-dodge rounded-[18px]" />
          <div className="absolute bg-[rgba(245,245,245,0.67)] inset-0 rounded-[18px]" />
        </div>
      </div>
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
  const [fullscreenPlot, setFullscreenPlot] = useState<{ path: string; title: string } | null>(null);
  const [dataVersion, setDataVersion] = useState<"current" | "original">("current");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const hasContent = chatInput.trim().length > 0;

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
                    }) => ({
                      id: msg.id,
                      role: msg.role as "user" | "assistant" | "system",
                      text: msg.text,
                      plotPath: msg.plot_path,
                      plotTitle: msg.plot_title,
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
                  const restoredPlots: PlotData[] = plotsData.plots.map((plot: { id: string; title: string; columns_used: string; summary?: string; path?: string }) => ({
                    id: parseInt(plot.id) || Date.now(),
                    title: plot.title,
                    columnsUsed: plot.columns_used || "",
                    summary: plot.summary || "",
                    insights: "",
                    path: plot.path,
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
  const sendChatMessage = async (message: string): Promise<void> => {
    if (!sessionId) return;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Chat failed");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

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
            handleSSEEvent(currentEvent, data);
          } catch {
            // Ignore parse errors
          }
          currentEvent = "";
        }
      }
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
        // Add plot to plots array
        const plotData: PlotData = {
          id: Date.now(),
          title: data.title as string,
          columnsUsed: (data.columns_used as string) || "",
          summary: (data.summary as string) || "",
          insights: "",
          path: data.path as string,
        };
        setPlots((prev) => [...prev, plotData]);

        // Add inline plot message to chat
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "system",
            text: `📊 ${data.title}`,
            plotPath: data.path as string,
            plotTitle: data.title as string,
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
        // Log errors to console only, don't show to user
        console.error("[Chat Error]", data.message);
        break;

      case "done":
        // Refresh data if updated
        if (data.data_updated) {
          refreshFileInfo();
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

        // Add system message locally and persist to backend
        const systemMessageText = `File uploaded successfully. ${data.row_count} rows loaded.`;
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "system",
            text: systemMessageText,
          },
        ]);
        await saveMessageToBackend("system", systemMessageText);
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

  const handleSend = async () => {
    // Can only send text queries after file is uploaded
    if (!chatInput.trim() || !fileInfo || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      text: chatInput.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = chatInput.trim();
    setChatInput("");
    setIsLoading(true);

    try {
      await sendChatMessage(currentInput);
    } catch (error) {
      // Log error to console, don't show to user
      console.error("[Send Error]", error);
    } finally {
      setIsLoading(false);
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
      if (file.name.endsWith(".csv") || file.type === "text/csv") {
        handleFileUpload(file);
      }
    }
  };

  return (
    <div
      className="bg-white flex gap-2.5 p-2.5 fixed inset-0 overflow-hidden"
      style={{ height: '100vh', alignItems: 'stretch' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-black/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl border-2 border-dashed border-[#08f] flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-[#08f]" />
            <p className="text-[15px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 590 }}>
              Drop CSV file here
            </p>
            <p className="text-[12px] text-[#8E8E93]">
              {fileInfo ? "This will replace the current file" : "Release to upload"}
            </p>
          </div>
        </div>
      )}

      {/* Left sidebar */}
      <div className="flex flex-col gap-2.5 w-[340px] shrink-0 h-full min-w-0">
        {/* Tab bar */}
        <GlassPanel className="shrink-0">
          <div className="flex items-center py-2.5 px-2.5">
            <button
              onClick={() => setActiveTab("data")}
              className={`flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${
                activeTab === "data" ? "bg-black/10" : ""
              }`}
            >
              <TableProperties className="w-[14px] h-[14px] text-[rgba(0,0,0,0.85)]" />
              <span className="text-[11px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 510 }}>
                Data
              </span>
            </button>
            <button
              onClick={() => setActiveTab("plots")}
              className={`flex-1 h-[24px] flex items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${
                activeTab === "plots" ? "bg-black/10" : ""
              }`}
            >
              <BarChart3 className="w-[14px] h-[14px] text-[rgba(0,0,0,0.85)]" />
              <span className="text-[11px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 510 }}>
                Plots
              </span>
            </button>
          </div>
        </GlassPanel>

        {/* Content panel */}
        <GlassPanel className="flex-1">
          <div className="h-full overflow-auto custom-scrollbar">
            {activeTab === "data" ? (
              <DataTab
                fileInfo={fileInfo}
                dataVersion={dataVersion}
                onVersionChange={switchVersion}
              />
            ) : (
              <PlotsTab plots={plots} />
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Right panel */}
      <GlassPanel className="flex-1 min-w-0" style={{ height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: '14px', paddingBottom: '14px' }}>
          {/* Title */}
          <div className="px-5 flex items-center justify-between" style={{ flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 590 }}>
                CSV Analyzer
              </h2>
              <button
                onClick={handleNewChat}
                disabled={isLoading}
                className="h-[28px] px-2.5 rounded-lg bg-black/5 hover:bg-black/10 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Start a new conversation"
              >
                <SquarePen className="w-[14px] h-[14px] text-[rgba(0,0,0,0.6)]" />
                <span className="text-[12px] text-[rgba(0,0,0,0.6)]" style={{ fontWeight: 500 }}>New</span>
              </button>
            </div>
            {fileInfo && (
              <span className="text-[11px] text-[#8E8E93]">
                {fileInfo.filename}
              </span>
            )}
          </div>

          {/* Chat area */}
          <div
            className="px-5 py-4 custom-scrollbar"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <p className="text-[13px] text-[#8E8E93]" style={{ fontWeight: 510 }}>
                  {fileInfo ? "Ask a question about your data" : "Upload a CSV file to get started"}
                </p>
                {!sessionId && (
                  <p className="text-[11px] text-[#8E8E93]">Creating session...</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        msg.role === "user"
                          ? "bg-black text-white"
                          : msg.role === "system"
                          ? "bg-green-100 text-green-800"
                          : "bg-white shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]"
                      }`}
                    >
                      {msg.fileName && (
                        <div
                          className={`flex items-center gap-1.5 mb-1.5 text-[11px] ${
                            msg.role === "user" ? "text-white/70" : "text-[#8E8E93]"
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                          <span>{msg.fileName}</span>
                        </div>
                      )}
                      <div
                        className={`text-[13px] ${
                          msg.role === "user" ? "text-white" : "text-[rgba(0,0,0,0.85)]"
                        }`}
                        style={{ fontWeight: 400 }}
                      >
                        <MarkdownLatex>{msg.text}</MarkdownLatex>
                      </div>
                      {/* Inline plot image */}
                      {msg.plotPath && (
                        <div className="mt-2">
                          <div
                            className="relative rounded-lg overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white cursor-pointer hover:border-[#08f] transition-colors"
                            onClick={() => setFullscreenPlot({ path: msg.plotPath!, title: msg.plotTitle || "Plot" })}
                          >
                            <img
                              src={`/api/plot-image/${msg.plotPath.replace(/\\/g, '/')}`}
                              alt={msg.plotTitle || "Plot"}
                              className="w-full max-w-[300px] h-auto"
                            />
                            <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-[10px] opacity-0 hover:opacity-100 transition-opacity">
                              Click to expand
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-5 py-3.5 bg-white shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#08f] typing-dot" />
                        <div className="w-2 h-2 rounded-full bg-[#08f] typing-dot" />
                        <div className="w-2 h-2 rounded-full bg-[#08f] typing-dot" />
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
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {!fileInfo ? (
              /* No file uploaded - show upload button only */
              <button
                onClick={handleFileAttach}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-white rounded-full px-6 py-3 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)] hover:bg-black/[0.02] transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-[15px] h-[15px] animate-spin text-[#8E8E93]" />
                ) : (
                  <>
                    <Upload className="w-[15px] h-[15px] text-[#08f]" />
                    <span className="text-[13px] text-[rgba(0,0,0,0.85)]" style={{ fontWeight: 510 }}>
                      Upload CSV file
                    </span>
                  </>
                )}
              </button>
            ) : (
              /* File uploaded - show text input */
              <div className="flex items-center gap-2.5">
                <div className="flex-1 flex items-center gap-0.5 bg-white rounded-full px-6 py-2.5 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]">
                  <input
                    type="text"
                    placeholder="Ask anything about your data"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-[13px] text-[#4c4c4c] outline-none placeholder:text-[#4c4c4c]"
                    style={{ fontWeight: 510 }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!hasContent || isLoading}
                    className={`w-[36px] h-[36px] rounded-full flex items-center justify-center relative overflow-hidden shrink-0 transition-all duration-200 ${
                      hasContent && !isLoading ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="absolute inset-0 rounded-full">
                      <div
                        className={`absolute inset-0 rounded-full transition-colors duration-200 ${
                          hasContent && !isLoading ? "bg-black" : "bg-[#f7f7f7]"
                        }`}
                      />
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-[15px] h-[15px] relative z-10 animate-spin text-[#8E8E93]" />
                    ) : (
                      <ArrowUp
                        className={`w-[15px] h-[15px] relative z-10 transition-colors duration-200 ${
                          hasContent ? "text-white" : "text-[#8E8E93]"
                        }`}
                      />
                    )}
                  </button>
                </div>

                {/* Replace file button */}
                <button
                  onClick={handleFileAttach}
                  disabled={isLoading}
                  className="w-[42px] h-[42px] rounded-full flex items-center justify-center relative overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity outline-none focus:outline-none disabled:opacity-50"
                  title="Upload new file"
                >
                  <div className="absolute inset-0 rounded-full">
                    <div className="absolute inset-0 rounded-full bg-[#f7f7f7]" />
                  </div>
                  <Paperclip className="w-[15px] h-[15px] relative z-10 text-[#8E8E93]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Fullscreen plot modal */}
      {fullscreenPlot && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setFullscreenPlot(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-[15px] font-semibold">{fullscreenPlot.title}</h3>
              <button
                onClick={() => setFullscreenPlot(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <img
                src={`/api/plot-image/${fullscreenPlot.path.replace(/\\/g, '/')}`}
                alt={fullscreenPlot.title}
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
