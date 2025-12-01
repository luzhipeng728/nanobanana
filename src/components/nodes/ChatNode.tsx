"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, NodeResizer, useStore } from "@xyflow/react";
import { MessageSquare, Send, Loader2, StopCircle, Link2, Image as ImageIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { NodeTextarea, NodeInput, NodeScrollArea } from "@/components/ui/NodeUI";
import { cn } from "@/lib/utils";
import { useCanvas } from "@/contexts/CanvasContext";

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
  const { getConnectedImageNodes } = useCanvas();
  const [messages, setMessages] = useState<Message[]>(data.messages || []);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(data.systemPrompt || "You are a helpful AI assistant that generates image prompts. When user asks for images, wrap your prompt suggestions in ```text\n[prompt text]\n``` blocks.");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reference images with marker data
  const [connectedImages, setConnectedImages] = useState<string[]>([]);
  const [connectedImagesWithMarkers, setConnectedImagesWithMarkers] = useState<{
    imageUrl: string;
    markedImageUrl?: string;
    marksCount: number;
  }[]>([]);

  // Monitor edge changes
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  // Get connected images with marker data
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);

    // Extract image URLs for display
    const imageUrls = connectedNodes
      .map(node => node.data.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    setConnectedImages(imageUrls);

    // Extract images with marker data for API
    const imagesWithMarkers = connectedNodes
      .filter(node => {
        const nodeData = node.data as { imageUrl?: string };
        return typeof nodeData.imageUrl === 'string' && nodeData.imageUrl.length > 0;
      })
      .map(node => {
        const nodeData = node.data as { imageUrl: string; markerData?: { markedImageUrl?: string; marks?: unknown[] } };
        return {
          imageUrl: nodeData.imageUrl,
          markedImageUrl: nodeData.markerData?.markedImageUrl,
          marksCount: nodeData.markerData?.marks?.length || 0,
        };
      });
    setConnectedImagesWithMarkers(imagesWithMarkers);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

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
      // Build reference images array (include marked images if available)
      const referenceImages: string[] = [];
      connectedImagesWithMarkers.forEach(img => {
        referenceImages.push(img.imageUrl);
        // Include marked image if it has markers
        if (img.markedImageUrl && img.marksCount > 0) {
          referenceImages.push(img.markedImageUrl);
          console.log(`[ChatNode] Including marked image with ${img.marksCount} markers`);
        }
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          systemPrompt,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
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
    <div className={cn(
      "nowheel bg-white dark:bg-neutral-950 border-2 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-[500px] h-[650px] overflow-hidden flex flex-col transition-all duration-300",
      selected ? "ring-4 ring-offset-0 ring-purple-400/40 border-purple-200 dark:border-purple-800 shadow-[0_8px_20px_-6px_rgba(168,85,247,0.15)] scale-[1.02]" : "border-neutral-200 dark:border-neutral-800 hover:shadow-lg hover:scale-[1.01]"
    )}>
      <NodeResizer
        isVisible={selected}
        minWidth={400}
        minHeight={500}
        lineClassName="!border-purple-400"
        handleClassName="!w-3 !h-3 !bg-purple-500 !rounded-full"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* Header */}
      <div className="px-5 py-4 border-b border-purple-100 dark:border-purple-900/20 flex items-center justify-between flex-shrink-0 bg-purple-50/50 dark:bg-purple-900/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shadow-sm text-purple-600 dark:text-purple-300">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100 tracking-tight">AI Assistant</h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">Always online</p>
              {connectedImages.length > 0 && (
                <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                  <Link2 className="w-3 h-3" />
                  {connectedImages.length} 张参考图
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 px-3 py-1.5 rounded-full transition-all"
          >
            {showSystemPrompt ? "Hide System" : "System"}
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-[10px] font-bold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-full transition-all"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* System Prompt (collapsible) */}
      {showSystemPrompt && (
        <div className="px-4 py-3 border-b border-purple-100 dark:border-purple-900/20 bg-purple-50/30 dark:bg-purple-900/10 flex-shrink-0">
          <NodeTextarea
            className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border-2 border-purple-100 dark:border-purple-800/30 resize-none focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/20 focus:border-purple-300 dark:focus:border-purple-700 shadow-sm transition-all"
            rows={3}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter system prompt..."
          />
        </div>
      )}

      {/* Reference images preview */}
      {connectedImages.length > 0 && (
        <div className="px-4 py-2 border-b border-purple-100 dark:border-purple-900/20 bg-purple-50/30 dark:bg-purple-900/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300">参考图片</span>
          </div>
          <div className="flex gap-1 mt-1.5 overflow-x-auto pb-1">
            {connectedImages.slice(0, 4).map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`参考图 ${idx + 1}`}
                className="w-10 h-10 rounded-lg object-cover border border-purple-200 dark:border-purple-700 flex-shrink-0"
              />
            ))}
            {connectedImages.length > 4 && (
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-800 flex items-center justify-center text-[10px] font-bold text-purple-600 dark:text-purple-300 flex-shrink-0">
                +{connectedImages.length - 4}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <NodeScrollArea className="flex-1 overflow-y-auto overflow-x-hidden p-5 bg-white/50 dark:bg-neutral-950/50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-purple-50 dark:bg-purple-900/10 flex items-center justify-center rotate-3">
                <MessageSquare className="w-8 h-8 text-purple-400/70 dark:text-purple-400/50" />
              </div>
              <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1">Start a conversation</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">Send a message to begin chatting with AI</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : undefined;
              const isGrouped = shouldGroupMessage(msg, prevMsg);

              return (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${isGrouped ? "mt-1" : "mt-4"}`}
                >
                  <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[85%] min-w-0`}>
                    {!isGrouped && msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shadow-sm">
                          <MessageSquare className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                        </div>
                        <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">AI Assistant</span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 overflow-hidden w-full shadow-sm ${
                        msg.role === "user"
                          ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-tr-sm"
                          : "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 rounded-tl-sm"
                      } ${isGrouped ? (msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm") : ""}`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap">
                          <Streamdown>{normalizeMarkdown(msg.content)}</Streamdown>
                        </div>
                      ) : (
                        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                      )}
                    </div>
                    {msg.timestamp && !isGrouped && (
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-600 mt-1 px-2 font-medium">
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
            <div className="flex flex-col items-start max-w-[85%] min-w-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shadow-sm">
                  <MessageSquare className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                </div>
                <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">AI Assistant</span>
                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-2 border-neutral-100 dark:border-neutral-800 overflow-hidden w-full shadow-sm">
                <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap">
                  <Streamdown>{normalizeMarkdown(streamingContent)}</Streamdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start mt-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
              <span className="text-xs font-medium text-neutral-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </NodeScrollArea>

      {/* Input */}
      <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-end gap-3 flex-shrink-0">
        <div className="flex-1 relative group">
          <NodeInput
            type="text"
            className="w-full text-sm px-4 py-3 pr-12 rounded-full bg-neutral-50 dark:bg-neutral-900 border-2 border-transparent focus:border-purple-300 dark:focus:border-purple-700 focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/20 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            disabled={isStreaming}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1 pointer-events-none">
            <span className="text-[10px] font-bold text-neutral-300 dark:text-neutral-700">{input.length}</span>
          </div>
        </div>
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-md hover:shadow-lg active:scale-95 hover:-translate-y-0.5"
            title="Stop generating"
          >
            <StopCircle className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-3 rounded-full bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 dark:disabled:text-neutral-600 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:shadow-none hover:-translate-y-0.5"
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
