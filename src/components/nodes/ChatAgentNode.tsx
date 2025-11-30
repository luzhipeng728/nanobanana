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

// Helper function to replace unsupported language tags
const normalizeMarkdown = (content: string) => {
  return content.replace(/```prompt\b/g, "```text");
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
    if (!files) return;

    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        // 图片：上传到 R2
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (data.url) {
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
          }
        } catch (error) {
          console.error("Upload error:", error);
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

  // Token 使用率
  const tokenUsagePercent = Math.min((contextTokens / maxTokens) * 100, 100);

  return (
    <div
      className={cn(
        "nowheel bg-white dark:bg-neutral-950 border-2 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full h-full overflow-hidden flex flex-col transition-all duration-300",
        selected
          ? "ring-4 ring-offset-0 ring-indigo-400/40 border-indigo-200 dark:border-indigo-800 shadow-[0_8px_20px_-6px_rgba(99,102,241,0.15)]"
          : "border-neutral-200 dark:border-neutral-800 hover:shadow-lg"
      )}
    >
      <NodeResizer
        isVisible={true}
        minWidth={450}
        minHeight={550}
        lineClassName="!border-indigo-400"
        handleClassName="!w-3 !h-3 !bg-indigo-500 !rounded-full"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-indigo-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* 头部 */}
      <div className="px-5 py-4 border-b border-indigo-100 dark:border-indigo-900/20 flex items-center justify-between flex-shrink-0 bg-indigo-50/50 dark:bg-indigo-900/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shadow-sm text-indigo-600 dark:text-indigo-300">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100 tracking-tight">
              智能助手
            </h3>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              支持工具调用 · 图片上传
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 rounded-full transition-all",
              showSettings
                ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
            )}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/20 bg-indigo-50/30 dark:bg-indigo-900/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                深度研究模式
              </span>
            </div>
            <button
              onClick={() => setEnableDeepResearch(!enableDeepResearch)}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative",
                enableDeepResearch
                  ? "bg-indigo-500"
                  : "bg-neutral-300 dark:bg-neutral-700"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                  enableDeepResearch ? "left-5" : "left-0.5"
                )}
              />
            </button>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            启用后可使用深度研究工具进行更全面的信息收集
          </p>
        </div>
      )}

      {/* 上下文状态栏 */}
      <div className="px-5 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
        <span className="text-[10px] text-neutral-500">
          上下文: {contextTokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens
        </span>
        <div className="w-24 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              tokenUsagePercent > 80
                ? "bg-red-500"
                : tokenUsagePercent > 50
                ? "bg-yellow-500"
                : "bg-green-500"
            )}
            style={{ width: `${tokenUsagePercent}%` }}
          />
        </div>
      </div>

      {/* 消息列表 */}
      <NodeScrollArea className="flex-1 overflow-y-auto overflow-x-hidden p-5 bg-white/50 dark:bg-neutral-950/50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-indigo-50 dark:bg-indigo-900/10 flex items-center justify-center rotate-3">
                <Bot className="w-8 h-8 text-indigo-400/70 dark:text-indigo-400/50" />
              </div>
              <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1">
                开始对话
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
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
                  {/* 用户附件预览 */}
                  {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center gap-1"
                        >
                          {att.type === "image" ? (
                            <ImageIcon className="w-3 h-3 text-green-500" />
                          ) : (
                            <FileText className="w-3 h-3 text-blue-500" />
                          )}
                          <span className="text-[10px] text-neutral-600 dark:text-neutral-400">
                            {att.filename}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 工具调用卡片（显示在文字上方，与流式显示保持一致） */}
                  {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2 w-full mb-2">
                      {msg.toolCalls.map((tool) => (
                        <ToolCard key={tool.toolId} {...tool} />
                      ))}
                    </div>
                  )}

                  {/* 消息气泡 */}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 overflow-hidden w-full shadow-sm",
                      msg.role === "user"
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-tr-sm"
                        : "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 rounded-tl-sm"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap">
                        <Streamdown>{normalizeMarkdown(msg.content)}</Streamdown>
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    )}
                  </div>

                  {/* 时间戳 */}
                  <span className="text-[9px] text-neutral-400 dark:text-neutral-600 mt-1 px-2">
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
                    <ToolCard key={tool.toolId} {...tool} />
                  ))}
                </div>
              )}

              {/* 流式文本 */}
              {streamingContent && (
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 overflow-hidden w-full shadow-sm">
                  <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap">
                    <Streamdown>{normalizeMarkdown(streamingContent)}</Streamdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 加载指示器 */}
        {isStreaming && !streamingContent && currentToolCalls.size === 0 && (
          <div className="flex justify-start mt-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span className="text-xs font-medium text-neutral-500">思考中...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </NodeScrollArea>

      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className="px-5 py-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative group px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center gap-2"
            >
              {att.type === "image" && att.preview && (
                <img src={att.preview} alt="" className="w-8 h-8 object-cover rounded" />
              )}
              {att.type === "document" && (
                <FileText className="w-4 h-4 text-blue-500" />
              )}
              <span className="text-xs text-neutral-600 dark:text-neutral-400 max-w-[100px] truncate">
                {att.filename}
              </span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-end gap-3 flex-shrink-0">
        {/* 文件上传按钮 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.md"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          className="p-3 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 transition-all"
          title="上传文件"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* 输入框 */}
        <div className="flex-1 relative group">
          <NodeInput
            type="text"
            className="w-full text-sm px-4 py-3 pr-12 rounded-full bg-neutral-50 dark:bg-neutral-900 border-2 border-transparent focus:border-indigo-300 dark:focus:border-indigo-700 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="输入消息..."
            disabled={isStreaming}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] font-bold text-neutral-300 dark:text-neutral-700">
              {input.length}
            </span>
          </div>
        </div>

        {/* 发送/停止按钮 */}
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
            className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:shadow-none hover:-translate-y-0.5"
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
        className="w-2 h-2 !bg-indigo-500 !border-0"
      />
    </div>
  );
};

export default memo(ChatAgentNode);
