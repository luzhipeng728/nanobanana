"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import {
  Bot,
  Send,
  Loader2,
  StopCircle,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Trash2,
  Settings2,
  FlaskConical,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { NodeTextarea, NodeInput, NodeScrollArea } from "@/components/ui/NodeUI";
import ToolCard, { ToolCardProps, ToolStatus } from "@/components/ui/ToolCard";
import { cn } from "@/lib/utils";
import type { ServerMessage, ToolResult } from "@/lib/chat-agent/types";
import { useCanvas } from "@/contexts/CanvasContext";

// Helper function to normalize markdown content
const normalizeMarkdown = (content: string) => {
  let normalized = content;
  // Replace unsupported language tags
  normalized = normalized.replace(/```prompt\b/g, "```text");
  // Remove excessive blank lines (more than 2 consecutive newlines)
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  // Trim leading/trailing whitespace from each line while preserving structure
  normalized = normalized.split("\n").map(line => line.trimEnd()).join("\n");
  // Remove [Image #X] placeholders as we show images separately
  normalized = normalized.replace(/\[Image #\d+\](?::\s*)?/g, "");
  return normalized.trim();
};

// 附件类型
interface Attachment {
  id: string;
  type: "image" | "document";
  file?: File;
  url?: string;
  content?: string;
  filename: string;
  preview?: string;
}

// 消息类型
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCardProps[];
  timestamp: string;
}

// 节点数据类型
interface ChatAgentNodeData {
  sessionId?: string;
  enableDeepResearch?: boolean;
}

const ChatAgentNode = ({
  data,
  id,
  isConnectable,
  selected,
}: NodeProps) => {
  const nodeData = data as ChatAgentNodeData;
  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, ToolCardProps>>(new Map());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sessionId, setSessionId] = useState<string>(nodeData.sessionId || "");
  const [enableDeepResearch, setEnableDeepResearch] = useState(nodeData.enableDeepResearch ?? false);
  const [showSettings, setShowSettings] = useState(false);
  const [contextTokens, setContextTokens] = useState(0);
  const [maxTokens] = useState(100000);

  // 获取全局 ImageModal
  const { openImageModal } = useCanvas();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamingContentRef = useRef<string>("");
  const currentToolCallsRef = useRef<Map<string, ToolCardProps>>(new Map());

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, currentToolCalls]);

  // 初始化 sessionId
  useEffect(() => {
    if (!sessionId) {
      fetch("/api/chat-agent")
        .then((res) => res.json())
        .then((data) => {
          if (data.sessionId) {
            setSessionId(data.sessionId);
          }
        })
        .catch(console.error);
    }
  }, [sessionId]);

  // 处理 SSE 事件
  const handleSSEEvent = useCallback((event: ServerMessage) => {
    switch (event.type) {
      case "content_chunk":
        streamingContentRef.current += event.content;
        setStreamingContent(streamingContentRef.current);
        break;

      case "tool_start":
        {
          const newMap = new Map(currentToolCallsRef.current);
          newMap.set(event.toolId, {
            toolId: event.toolId,
            name: event.name,
            input: event.input || {},
            status: "running" as ToolStatus,
          });
          currentToolCallsRef.current = newMap;
          setCurrentToolCalls(newMap);
        }
        break;

      case "tool_input":
        {
          const newMap = new Map(currentToolCallsRef.current);
          const existing = newMap.get(event.toolId);
          if (existing) {
            newMap.set(event.toolId, {
              ...existing,
              input: event.input,
            });
            currentToolCallsRef.current = newMap;
            setCurrentToolCalls(newMap);
          }
        }
        break;

      case "tool_progress":
        {
          const newMap = new Map(currentToolCallsRef.current);
          const existing = newMap.get(event.toolId);
          if (existing) {
            newMap.set(event.toolId, {
              ...existing,
              elapsed: event.elapsed,
              statusText: event.status,
            });
            currentToolCallsRef.current = newMap;
            setCurrentToolCalls(newMap);
          }
        }
        break;

      case "tool_chunk":
        {
          const newMap = new Map(currentToolCallsRef.current);
          const existing = newMap.get(event.toolId);
          if (existing) {
            newMap.set(event.toolId, {
              ...existing,
              streamingContent: (existing.streamingContent || "") + event.chunk,
            });
            currentToolCallsRef.current = newMap;
            setCurrentToolCalls(newMap);
          }
        }
        break;

      case "tool_end":
        {
          const newMap = new Map(currentToolCallsRef.current);
          const existing = newMap.get(event.toolId);
          if (existing) {
            const output = event.output as ToolResult;
            newMap.set(event.toolId, {
              ...existing,
              status: output.success ? "completed" : "error",
              output: output as unknown as Record<string, unknown>,
              duration: event.duration,
              streamingContent: undefined,
            });
            currentToolCallsRef.current = newMap;
            setCurrentToolCalls(newMap);
          }
        }
        break;

      case "context_update":
        setContextTokens(event.tokens);
        break;

      case "error":
        console.error("Chat Agent Error:", event.message);
        break;
    }
  }, []);

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const messageId = `msg-${Date.now()}`;
    const userMessage: Message = {
      id: messageId,
      role: "user",
      content: input,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsStreaming(true);
    setStreamingContent("");
    setCurrentToolCalls(new Map());
    // 重置 refs
    streamingContentRef.current = "";
    currentToolCallsRef.current = new Map();

    abortControllerRef.current = new AbortController();

    try {
      // 准备请求体
      const requestBody = {
        content: input,
        sessionId,
        attachments: attachments.map((att) => ({
          type: att.type,
          url: att.url,
          content: att.content,
          filename: att.filename,
        })),
        settings: {
          enableDeepResearch,
        },
      };

      const response = await fetch("/api/chat-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 从响应头获取 sessionId
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId);
      }

      // 处理 SSE 流
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: ServerMessage = JSON.parse(data);
              handleSSEEvent(event);
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 创建助手消息（使用 ref 获取最终值）
      const finalContent = streamingContentRef.current;
      const finalToolCalls = Array.from(currentToolCallsRef.current.values());

      // 只有有内容或工具调用时才添加消息
      if (finalContent || finalToolCalls.length > 0) {
        const assistantMessage: Message = {
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
        const errorMessage: Message = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: `错误: ${error.message}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // 停止生成
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // 清除对话
  const handleClear = async () => {
    if (sessionId) {
      await fetch(`/api/chat-agent?sessionId=${sessionId}`, {
        method: "DELETE",
      });
    }
    setMessages([]);
    setStreamingContent("");
    setCurrentToolCalls(new Map());
    setContextTokens(0);
    // 获取新的 sessionId
    const res = await fetch("/api/chat-agent");
    const data = await res.json();
    if (data.sessionId) {
      setSessionId(data.sessionId);
    }
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log("[ChatAgentNode] File select triggered, files:", files?.length);
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      console.log("[ChatAgentNode] Processing file:", file.name, file.type);
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        // 图片：上传到 R2
        const formData = new FormData();
        formData.append("file", file);

        try {
          console.log("[ChatAgentNode] Uploading image to /api/upload...");
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          console.log("[ChatAgentNode] Upload response:", data);

          if (data.url) {
            console.log("[ChatAgentNode] Image uploaded successfully:", data.url);
            setAttachments((prev) => [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random()}`,
                type: "image",
                url: data.url,
                filename: file.name,
                preview: data.url,
              },
            ]);
          } else {
            console.error("[ChatAgentNode] Upload failed - no URL in response");
          }
        } catch (error) {
          console.error("[ChatAgentNode] Upload error:", error);
        }
      } else {
        // 文档：读取内容
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random()}`,
              type: "document",
              content,
              filename: file.name,
            },
          ]);
        };
        reader.readAsText(file);
      }
    }

    // 清空 input
    e.target.value = "";
  };

  // 移除附件
  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 从工具调用中提取生成的图片
  const extractGeneratedImages = (toolCalls?: ToolCardProps[]) => {
    if (!toolCalls) return [];
    return toolCalls
      .filter(
        (tool) =>
          (tool.name === "generate_image" || tool.name === "edit_image") &&
          tool.output?.imageUrl
      )
      .map((tool) => ({
        url: tool.output!.imageUrl as string,
        prompt: tool.input?.prompt as string | undefined,
      }));
  };

  // Token 使用率
  const tokenUsagePercent = Math.min((contextTokens / maxTokens) * 100, 100);

  return (
    <div
      className={cn(
        "nowheel bg-[#0a0a12]/95 border rounded-2xl w-full h-full overflow-hidden flex flex-col transition-all duration-300",
        "shadow-[0_0_30px_rgba(99,102,241,0.2)]",
        selected
          ? "ring-2 ring-offset-0 ring-indigo-500/50 border-indigo-500/40 shadow-[0_0_40px_rgba(99,102,241,0.3)]"
          : "border-indigo-500/20 hover:border-indigo-500/30"
      )}
    >
      {/* 顶部霓虹边框 */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 z-10" />

      {/* 角落装饰 */}
      <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-indigo-500/50 z-10" />
      <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-indigo-500/50 z-10" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-indigo-500/50 z-10" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-indigo-500/50 z-10" />

      <NodeResizer
        isVisible={true}
        minWidth={450}
        minHeight={550}
        lineClassName="!border-indigo-500/50"
        handleClassName="!w-3 !h-3 !bg-indigo-500 !rounded-full !shadow-[0_0_8px_rgba(99,102,241,0.5)]"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-gradient-to-r !from-indigo-500 !to-purple-500 !border-2 !border-[#0a0a12] !shadow-[0_0_10px_rgba(99,102,241,0.5)]"
      />

      {/* 头部 - Neo-Cyber 风格 */}
      <div className="px-5 py-4 border-b border-indigo-500/20 flex items-center justify-between flex-shrink-0 bg-indigo-500/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-cyber text-xs font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              AGENT CHAT
            </h3>
            <p className="text-[10px] text-white/40 font-mono">
              TOOLS · IMAGE UPLOAD
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 rounded-lg transition-all border",
              showSettings
                ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                : "bg-white/5 border-white/10 text-white/50 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-400"
            )}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 设置面板 - Neo-Cyber 风格 */}
      {showSettings && (
        <div className="px-5 py-3 border-b border-indigo-500/20 bg-indigo-500/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-medium text-white/70">
                深度研究模式
              </span>
            </div>
            <button
              onClick={() => setEnableDeepResearch(!enableDeepResearch)}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative border",
                enableDeepResearch
                  ? "bg-indigo-500/30 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                  : "bg-white/5 border-white/20"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                  enableDeepResearch ? "left-5 bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "left-0.5 bg-white/50"
                )}
              />
            </button>
          </div>
          <p className="text-[10px] text-white/40 mt-1">
            启用后可使用深度研究工具进行更全面的信息收集
          </p>
        </div>
      )}

      {/* 上下文状态栏 - Neo-Cyber 风格 */}
      <div className="px-5 py-2 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <span className="text-[10px] text-white/40 font-mono">
          CTX: {contextTokens.toLocaleString()} / {maxTokens.toLocaleString()}
        </span>
        <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              tokenUsagePercent > 80
                ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                : tokenUsagePercent > 50
                ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            )}
            style={{ width: `${tokenUsagePercent}%` }}
          />
        </div>
      </div>

      {/* 消息列表 - Neo-Cyber 风格 */}
      <NodeScrollArea className="flex-1 overflow-y-auto overflow-x-hidden p-5 bg-transparent">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                {/* 发光背景 */}
                <div className="absolute inset-0 bg-indigo-500/20 rounded-2xl blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-[#0a0a12] border border-indigo-500/30 flex items-center justify-center rotate-3 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  <Bot className="w-8 h-8 text-indigo-400/70" />
                </div>
              </div>
              <h4 className="font-cyber text-sm font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-1">
                START CHAT
              </h4>
              <p className="text-xs text-white/40">
                支持上传图片、文档，可调用工具完成复杂任务
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
                  {/* 用户附件预览 - Neo-Cyber 风格 */}
                  {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att) => (
                        att.type === "image" && att.preview ? (
                          // 图片附件：显示缩略图
                          <div
                            key={att.id}
                            className="relative group rounded-lg overflow-hidden border border-cyan-500/30 shadow-[0_0_10px_rgba(0,245,255,0.2)]"
                          >
                            <img
                              src={att.preview}
                              alt={att.filename}
                              className="w-20 h-20 object-cover rounded-lg"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-cyan-500/20 transition-colors" />
                            <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[8px] text-cyan-400 truncate opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                              {att.filename}
                            </span>
                          </div>
                        ) : (
                          // 文档附件：显示文件名
                          <div
                            key={att.id}
                            className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-blue-400" />
                            <span className="text-[10px] text-blue-300 font-mono">
                              {att.filename}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {/* 工具调用卡片（显示在文字上方，与流式显示保持一致） */}
                  {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2 w-full mb-2">
                      {msg.toolCalls.map((tool) => (
                        <ToolCard key={tool.toolId} {...tool} onImageClick={openImageModal} />
                      ))}
                    </div>
                  )}

                  {/* 消息气泡 - Neo-Cyber 风格 */}
                  <div
                    className={cn(
                      "rounded-xl px-4 py-3 overflow-hidden w-full selectable-text",
                      msg.role === "user"
                        ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-tr-sm shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                        : "bg-[#0a0a12] text-white/90 border border-white/10 rounded-tl-sm"
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

                  {/* 生成的图片展示 */}
                  {msg.role === "assistant" && (() => {
                    const images = extractGeneratedImages(msg.toolCalls);
                    if (images.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-3 mt-3 w-full">
                        {images.map((img, idx) => (
                          <div
                            key={idx}
                            className="relative group cursor-pointer rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                            onClick={() => openImageModal(img.url, img.prompt)}
                          >
                            <img
                              src={img.url}
                              alt={`Generated ${idx + 1}`}
                              className="w-full max-w-[200px] h-auto aspect-square object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                              <span className="text-white text-xs font-medium bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                                点击查看大图
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 时间戳 */}
                  <span className="text-[9px] text-white/30 mt-1 px-2 font-mono">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 流式消息 */}
        {isStreaming && (streamingContent || currentToolCalls.size > 0) && (
          <div className="flex justify-start mt-4">
            <div className="flex flex-col items-start max-w-[90%] min-w-0 w-full">
              {/* 工具调用卡片 */}
              {currentToolCalls.size > 0 && (
                <div className="space-y-2 w-full mb-2">
                  {Array.from(currentToolCalls.values()).map((tool) => (
                    <ToolCard key={tool.toolId} {...tool} onImageClick={openImageModal} />
                  ))}
                </div>
              )}

              {/* 流式文本 - Neo-Cyber 风格 */}
              {streamingContent && (
                <div className="rounded-xl rounded-tl-sm px-4 py-3 bg-[#0a0a12] text-white/90 border border-indigo-500/30 overflow-hidden w-full selectable-text shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none break-words [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2">
                    <Streamdown>{normalizeMarkdown(streamingContent)}</Streamdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 加载指示器 - Neo-Cyber 风格 */}
        {isStreaming && !streamingContent && currentToolCalls.size === 0 && (
          <div className="flex justify-start mt-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a0a12] border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span className="font-cyber text-[10px] font-bold tracking-wider uppercase text-indigo-400">THINKING</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </NodeScrollArea>

      {/* 附件预览区 - Neo-Cyber 风格 */}
      {attachments.length > 0 && (
        <div className="px-5 py-2 border-t border-white/10 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative group px-3 py-2 bg-white/5 border border-white/10 rounded-lg flex items-center gap-2"
            >
              {att.type === "image" && att.preview && (
                <img src={att.preview} alt="" className="w-8 h-8 object-cover rounded border border-cyan-500/30" />
              )}
              {att.type === "document" && (
                <FileText className="w-4 h-4 text-blue-400" />
              )}
              <span className="text-xs text-white/60 max-w-[100px] truncate font-mono">
                {att.filename}
              </span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_8px_rgba(239,68,68,0.5)]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 - Neo-Cyber 风格 */}
      <div className="px-5 py-4 border-t border-white/10 bg-[#0a0a12]/80 flex items-end gap-3 flex-shrink-0">
        {/* 文件上传按钮 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.md"
          onChange={handleFileSelect}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="hidden"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            fileInputRef.current?.click();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={isStreaming}
          className="p-3 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-400 disabled:opacity-30 transition-all"
          title="上传文件"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* 输入框 */}
        <div className="flex-1 relative group">
          <NodeInput
            type="text"
            className="w-full text-sm px-4 py-3 pr-12 !rounded-xl !bg-[#050508] !border-white/10 focus:!border-indigo-500/50 focus:!shadow-[0_0_20px_rgba(99,102,241,0.15),inset_0_0_20px_rgba(99,102,241,0.05)] transition-all placeholder:text-white/30"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="输入消息..."
            disabled={isStreaming}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] font-mono font-bold text-white/20">
              {input.length}
            </span>
          </div>
        </div>

        {/* 发送/停止按钮 */}
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-95"
            title="停止生成"
          >
            <StopCircle className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/5 disabled:from-white/5 disabled:to-white/5 disabled:text-white/30 transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] active:scale-95 disabled:shadow-none hover:-translate-y-0.5"
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
        className="w-3 h-3 !bg-gradient-to-r !from-indigo-500 !to-purple-500 !border-2 !border-[#0a0a12] !shadow-[0_0_10px_rgba(99,102,241,0.5)]"
      />
    </div>
  );
};

export default memo(ChatAgentNode);
