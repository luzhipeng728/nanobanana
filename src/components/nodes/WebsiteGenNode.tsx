"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import {
  Globe,
  Send,
  Loader2,
  StopCircle,
  Trash2,
  FileCode,
  Image as ImageIcon,
  Search,
  Eye,
  AlertCircle,
  Wrench,
  CheckCircle,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { NodeInput, NodeScrollArea } from "@/components/ui/NodeUI";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  ToolCall,
  WebsiteGenSSEEvent,
  WebsiteGenNodeData,
  ImagePlaceholder,
} from "@/types/website-gen";

// Tool icons mapping
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  write_file: FileCode,
  read_file: FileCode,
  update_file: FileCode,
  list_files: FileCode,
  generate_image: ImageIcon,
  preview_ready: Eye,
  web_search: Search,
};

// Tool status colors
const TOOL_STATUS_COLORS: Record<string, string> = {
  pending: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500",
  running: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  completed: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  error: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

// Helper function to normalize markdown
const normalizeMarkdown = (content: string) => {
  let normalized = content;
  normalized = normalized.replace(/```prompt\b/g, "```text");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  normalized = normalized.split("\n").map(line => line.trimEnd()).join("\n");
  return normalized.trim();
};

// Tool Call Card Component
const ToolCallCard = ({ tool }: { tool: ToolCall }) => {
  const Icon = TOOL_ICONS[tool.name] || FileCode;
  const statusColor = TOOL_STATUS_COLORS[tool.status] || TOOL_STATUS_COLORS.pending;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all",
      statusColor
    )}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium">{tool.name}</span>
      {tool.status === "running" && (
        <Loader2 className="w-3 h-3 animate-spin ml-auto" />
      )}
      {tool.status === "completed" && (
        <CheckCircle className="w-3 h-3 ml-auto" />
      )}
      {tool.status === "error" && (
        <AlertCircle className="w-3 h-3 ml-auto" />
      )}
    </div>
  );
};

const WebsiteGenNode = ({
  data,
  id,
  isConnectable,
  selected,
}: NodeProps) => {
  const nodeData = data as WebsiteGenNodeData;
  const { setNodes } = useReactFlow();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, ToolCall>>(new Map());
  const [projectId, setProjectId] = useState<string>(nodeData.projectId || "");
  const [error, setError] = useState<string | null>(null);
  const [imagePlaceholders, setImagePlaceholders] = useState<Map<string, ImagePlaceholder>>(new Map());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>("");
  const currentToolCallsRef = useRef<Map<string, ToolCall>>(new Map());

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, currentToolCalls]);

  // Initialize project ID
  useEffect(() => {
    if (!projectId) {
      const newProjectId = `website-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setProjectId(newProjectId);
    }
  }, [projectId]);

  // Handle SSE events
  const handleSSEEvent = useCallback((event: WebsiteGenSSEEvent) => {
    switch (event.type) {
      case "content_chunk":
        streamingContentRef.current += event.content;
        setStreamingContent(streamingContentRef.current);
        break;

      case "tool_start": {
        const newMap = new Map(currentToolCallsRef.current);
        newMap.set(event.toolId, {
          id: event.toolId,
          name: event.name,
          args: event.args,
          status: "running",
        });
        currentToolCallsRef.current = newMap;
        setCurrentToolCalls(newMap);
        break;
      }

      case "tool_end": {
        const newMap = new Map(currentToolCallsRef.current);
        const existing = newMap.get(event.toolId);
        if (existing) {
          newMap.set(event.toolId, {
            ...existing,
            status: event.result.success ? "completed" : "error",
            result: event.result,
          });
          currentToolCallsRef.current = newMap;
          setCurrentToolCalls(newMap);
        }
        break;
      }

      case "preview_ready":
        // 创建预览节点
        createPreviewNode(event.projectId);
        break;

      case "image_placeholder": {
        const newPlaceholders = new Map(imagePlaceholders);
        newPlaceholders.set(event.placeholder.id, event.placeholder);
        setImagePlaceholders(newPlaceholders);
        break;
      }

      case "image_completed": {
        const newPlaceholders = new Map(imagePlaceholders);
        const placeholder = newPlaceholders.get(event.placeholderId);
        if (placeholder) {
          newPlaceholders.set(event.placeholderId, {
            ...placeholder,
            status: "completed",
            imageUrl: event.imageUrl,
          });
          setImagePlaceholders(newPlaceholders);
        }
        break;
      }

      case "image_failed": {
        const newPlaceholders = new Map(imagePlaceholders);
        const placeholder = newPlaceholders.get(event.placeholderId);
        if (placeholder) {
          newPlaceholders.set(event.placeholderId, {
            ...placeholder,
            status: "failed",
            error: event.error,
          });
          setImagePlaceholders(newPlaceholders);
        }
        break;
      }

      case "error":
        setError(event.message);
        break;

      case "done":
        // Stream completed
        break;
    }
  }, [imagePlaceholders]);

  // Create preview node
  const createPreviewNode = useCallback((projId: string) => {
    setNodes((nds) => {
      // Check if preview node already exists
      const existingPreview = nds.find(
        (n) => n.type === "websitePreview" && (n.data as any).projectId === projId
      );

      if (existingPreview) {
        // Update existing preview node
        return nds.map((n) =>
          n.id === existingPreview.id
            ? { ...n, data: { ...n.data, updatedAt: Date.now() } }
            : n
        );
      }

      // Find current node position
      const currentNode = nds.find((n) => n.id === id);
      const position = currentNode
        ? { x: currentNode.position.x + 500, y: currentNode.position.y }
        : { x: 600, y: 100 };

      // Create new preview node
      const newNode = {
        id: `websitePreview-${Date.now()}`,
        type: "websitePreview",
        position,
        style: { width: 600, height: 500 },
        data: {
          projectId: projId,
          title: "网站预览",
          files: {},
          imagePlaceholders: Object.fromEntries(imagePlaceholders),
        },
      };

      return [...nds, newNode];
    });
  }, [id, setNodes, imagePlaceholders]);

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const messageId = `msg-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: messageId,
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setCurrentToolCalls(new Map());
    setError(null);
    streamingContentRef.current = "";
    currentToolCallsRef.current = new Map();

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/website-gen/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: input,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: WebsiteGenSSEEvent = JSON.parse(data);
              handleSSEEvent(event);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Create assistant message
      const finalContent = streamingContentRef.current;
      const finalToolCalls = Array.from(currentToolCallsRef.current.values());

      if (finalContent || finalToolCalls.length > 0) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: finalContent,
          toolCalls: finalToolCalls,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setStreamingContent("");
      setCurrentToolCalls(new Map());
      streamingContentRef.current = "";
      currentToolCallsRef.current = new Map();
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Chat error:", error);
        setError(error.message);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Stop generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Clear conversation
  const handleClear = async () => {
    setMessages([]);
    setStreamingContent("");
    setCurrentToolCalls(new Map());
    setImagePlaceholders(new Map());
    setError(null);
    // Generate new project ID
    const newProjectId = `website-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setProjectId(newProjectId);
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={cn(
        "nowheel bg-white dark:bg-neutral-950 border-2 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full h-full overflow-hidden flex flex-col transition-all duration-300",
        selected
          ? "ring-4 ring-offset-0 ring-emerald-400/40 border-emerald-200 dark:border-emerald-800 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.15)]"
          : "border-neutral-200 dark:border-neutral-800 hover:shadow-lg"
      )}
    >
      <NodeResizer
        isVisible={true}
        minWidth={450}
        minHeight={550}
        lineClassName="!border-emerald-400"
        handleClassName="!w-3 !h-3 !bg-emerald-500 !rounded-full"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-emerald-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* Header */}
      <div className="px-5 py-4 border-b border-emerald-100 dark:border-emerald-900/20 flex items-center justify-between flex-shrink-0 bg-emerald-50/50 dark:bg-emerald-900/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shadow-sm text-emerald-600 dark:text-emerald-300">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100 tracking-tight">
              网站生成器
            </h3>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              描述需求 · AI 生成 · 实时预览
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-all"
              title="清空对话"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner with Fix Options */}
      {error && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-red-600 dark:text-red-400 flex-1 break-words">{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full flex-shrink-0"
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setInput(`请修复以下错误:\n${error}`);
                setError(null);
              }}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Wrench className="w-3 h-3" />
              一键修复
            </button>
            <button
              onClick={() => {
                setInput(`错误信息: ${error}\n\n我的补充说明: `);
                setError(null);
              }}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              描述问题
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <NodeScrollArea className="flex-1 overflow-y-auto overflow-x-hidden p-5 bg-white/50 dark:bg-neutral-950/50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-emerald-50 dark:bg-emerald-900/10 flex items-center justify-center rotate-3">
                <Globe className="w-8 h-8 text-emerald-400/70 dark:text-emerald-400/50" />
              </div>
              <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1">
                开始创建网站
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 max-w-[200px]">
                描述你想要的网站，AI 将为你生成 React 代码并提供实时预览
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } max-w-[90%] min-w-0`}
                >
                  {/* Tool calls */}
                  {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1 w-full mb-2">
                      {msg.toolCalls.map((tool) => (
                        <ToolCallCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  )}

                  {/* Message bubble */}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 overflow-hidden w-full shadow-sm",
                      msg.role === "user"
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-tr-sm"
                        : "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 rounded-tl-sm"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2">
                        <Streamdown>{normalizeMarkdown(msg.content)}</Streamdown>
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[9px] text-neutral-400 dark:text-neutral-600 mt-1 px-2">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Streaming message */}
        {isStreaming && (streamingContent || currentToolCalls.size > 0) && (
          <div className="flex justify-start mt-4">
            <div className="flex flex-col items-start max-w-[90%] min-w-0 w-full">
              {/* Tool calls */}
              {currentToolCalls.size > 0 && (
                <div className="space-y-1 w-full mb-2">
                  {Array.from(currentToolCalls.values()).map((tool) => (
                    <ToolCallCard key={tool.id} tool={tool} />
                  ))}
                </div>
              )}

              {/* Streaming text */}
              {streamingContent && (
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 overflow-hidden w-full shadow-sm">
                  <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2">
                    <Streamdown>{normalizeMarkdown(streamingContent)}</Streamdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && currentToolCalls.size === 0 && (
          <div className="flex justify-start mt-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              <span className="text-xs font-medium text-neutral-500">分析需求...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </NodeScrollArea>

      {/* Input area */}
      <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-end gap-3 flex-shrink-0">
        <div className="flex-1 relative group">
          <NodeInput
            type="text"
            className="w-full text-sm px-4 py-3 pr-12 rounded-full bg-neutral-50 dark:bg-neutral-900 border-2 border-transparent focus:border-emerald-300 dark:focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/20 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="描述你想要的网站..."
            disabled={isStreaming}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] font-bold text-neutral-300 dark:text-neutral-700">
              {input.length}
            </span>
          </div>
        </div>

        {/* Send/Stop button */}
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-md hover:shadow-lg active:scale-95 hover:-translate-y-0.5"
            title="停止生成"
          >
            <StopCircle className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:shadow-none hover:-translate-y-0.5"
            title="发送消息"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-emerald-500 !border-0"
      />
    </div>
  );
};

export default memo(WebsiteGenNode);
