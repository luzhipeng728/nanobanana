"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { MessageSquare, Send, Loader2, StopCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import { NodeTextarea, NodeInput, NodeScrollArea } from "@/components/NodeInputs";

// Helper function to replace unsupported language tags
const normalizeMarkdown = (content: string) => {
  // Replace ```prompt with ```text to avoid Shiki errors
  return content.replace(/```prompt\b/g, '```text');
};

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

type ChatNodeData = {
  messages?: Message[];
  systemPrompt?: string;
};

const ChatNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const [messages, setMessages] = useState<Message[]>(data.messages || []);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(data.systemPrompt || "You are a helpful AI assistant that generates image prompts. When user asks for images, wrap your prompt suggestions in ```text\n[prompt text]\n``` blocks.");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          systemPrompt,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      // Add assistant message to history
      const assistantMessage: Message = {
        role: "assistant",
        content: fullContent,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Chat error:", error);
        const errorMessage: Message = {
          role: "assistant",
          content: `Error: ${error.message}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setStreamingContent("");
  };

  // Helper function to format timestamp
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to check if messages should be grouped
  const shouldGroupMessage = (currentMsg: Message, prevMsg?: Message) => {
    if (!prevMsg) return false;
    return prevMsg.role === currentMsg.role;
  };

  return (
    <div className="nowheel bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-[500px] h-[650px] overflow-hidden flex flex-col">
      <NodeResizer
        isVisible={selected}
        minWidth={400}
        minHeight={500}
        lineClassName="!border-purple-500"
        handleClassName="!w-3 !h-3 !bg-purple-500 !rounded-full"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">AI Assistant</h3>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">Always online</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-all"
          >
            {showSystemPrompt ? "Hide System" : "System"}
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* System Prompt (collapsible) */}
      {showSystemPrompt && (
        <div className="px-4 py-3 border-b border-purple-100 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-950/20 flex-shrink-0">
          <NodeTextarea
            className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-purple-200 dark:border-purple-800/50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent shadow-sm transition-all"
            rows={3}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter system prompt..."
          />
        </div>
      )}

      {/* Messages */}
      <NodeScrollArea className="flex-1 overflow-y-auto overflow-x-hidden p-5 bg-neutral-50 dark:bg-neutral-950">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-purple-500 dark:text-purple-400" />
              </div>
              <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Start a conversation</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">Send a message to begin chatting with AI</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : undefined;
              const isGrouped = shouldGroupMessage(msg, prevMsg);

              return (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${isGrouped ? "mt-1" : "mt-4"}`}
                >
                  <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[80%] min-w-0`}>
                    {!isGrouped && msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
                          <MessageSquare className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">AI Assistant</span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 break-words overflow-wrap-anywhere overflow-hidden w-full ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md"
                          : "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 shadow-sm"
                      } ${isGrouped ? (msg.role === "user" ? "rounded-tr-md" : "rounded-tl-md") : ""}`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="text-[13px] leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:break-words prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:whitespace-pre prose-code:break-words prose-p:my-1.5 prose-p:leading-relaxed prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:text-xs">
                          <Streamdown>{normalizeMarkdown(msg.content)}</Streamdown>
                        </div>
                      ) : (
                        <div className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                      )}
                    </div>
                    {msg.timestamp && (
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-1 px-1">
                        {formatTime(msg.timestamp)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Streaming Message */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start mt-4">
            <div className="flex flex-col items-start max-w-[80%] min-w-0">
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">AI Assistant</span>
                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              </div>
              <div className="rounded-2xl px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 break-words overflow-wrap-anywhere overflow-hidden w-full shadow-sm">
                <div className="text-[13px] leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:break-words prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:whitespace-pre prose-code:break-words prose-p:my-1.5 prose-p:leading-relaxed prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:text-xs">
                  <Streamdown>{normalizeMarkdown(streamingContent)}</Streamdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start mt-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              <span className="text-xs text-neutral-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </NodeScrollArea>

      {/* Input */}
      <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-end gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <NodeInput
            type="text"
            className="w-full text-sm px-4 py-3 pr-12 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500 resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            disabled={isStreaming}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-600 mr-1">{input.length}</span>
          </div>
        </div>
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-md hover:shadow-lg active:scale-95"
            title="Stop generating"
          >
            <StopCircle className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-3 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:from-neutral-300 disabled:to-neutral-400 dark:disabled:from-neutral-700 dark:disabled:to-neutral-800 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:shadow-none"
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-purple-500 !border-0"
      />
    </div>
  );
};

export default memo(ChatNode);
