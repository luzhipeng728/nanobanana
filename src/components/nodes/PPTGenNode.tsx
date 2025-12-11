"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore, addEdge } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Presentation, Link2, Palette, Sparkles, Send, Download, RefreshCw, Eye, ExternalLink } from "lucide-react";
import { Streamdown } from "streamdown";
import { NodeTextarea, NodeLabel, NodeButton, NodeTabSelect } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";
import { cn } from "@/lib/utils";

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

// PPT 模板类型
type PPTTemplate = "business" | "tech" | "minimal" | "creative";

// PPT 主色调
const COLOR_PALETTE = [
  { value: "#3B82F6", label: "蓝色", className: "bg-blue-500" },
  { value: "#8B5CF6", label: "紫色", className: "bg-purple-500" },
  { value: "#10B981", label: "绿色", className: "bg-green-500" },
  { value: "#F59E0B", label: "橙色", className: "bg-orange-500" },
  { value: "#EF4444", label: "红色", className: "bg-red-500" },
  { value: "#6366F1", label: "靛蓝", className: "bg-indigo-500" },
];

// Agent 消息类型
interface AgentMessage {
  id: string;
  type: string;
  role: "system" | "assistant" | "tool" | "user";
  content?: string;
  toolName?: string;
  toolId?: string;
  input?: any;
  isError?: boolean;
  timestamp: number;
  streamContent?: string;
  isStreaming?: boolean;
}

// 幻灯片预览类型
interface SlidePreview {
  id: string;
  title: string;
  content?: string[];
  layout: string;
}

// PPT 版本类型
interface PPTVersion {
  id: string;           // taskId
  version: number;      // 版本号
  previewUrl: string;   // Office Online 预览链接
  downloadUrl: string;  // R2 下载链接
  createdAt: number;    // 创建时间戳
  description: string;  // 版本描述（用户输入的主题或修改需求）
  slides: SlidePreview[]; // 该版本的幻灯片
}

const PPTGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { getConnectedImageNodes } = useCanvas();
  const { getNode, setNodes, setEdges } = useReactFlow();

  // 基础状态
  const [theme, setTheme] = useState(data.theme || "");
  const [description, setDescription] = useState(data.description || "");
  const [template, setTemplate] = useState<PPTTemplate>(data.template || "business");
  const [primaryColor, setPrimaryColor] = useState<string>(data.primaryColor || "#3B82F6");
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);
  const [connectedImageUrls, setConnectedImageUrls] = useState<string[]>([]);

  // 聊天状态
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  // PPT 版本状态
  const [pptVersions, setPptVersions] = useState<PPTVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);

  // 当前版本的便捷访问
  const currentVersion = pptVersions[currentVersionIndex] || null;
  const slides = currentVersion?.slides || [];
  const previewUrl = currentVersion?.previewUrl || null;
  const downloadUrl = currentVersion?.downloadUrl || null;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 触摸设备支持
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode, setOnConnectionComplete } = useTouchContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  useEffect(() => {
    setOnConnectionComplete((sourceId: string, targetId: string) => {
      setEdges((eds) => addEdge({
        id: `edge-${sourceId}-${targetId}-${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      }, eds));
    });
  }, [setOnConnectionComplete, setEdges]);

  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;
    if (connectMode.isActive && connectMode.sourceNodeId !== id) {
      e.preventDefault();
      e.stopPropagation();
      completeConnection(id);
      return;
    }
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      const options = createNodeMenuOptions(id, {
        onDelete: handleDeleteNode,
        onConnect: () => startConnectMode(id),
      });
      showMenu({ x: touch.clientX, y: touch.clientY }, id, options);
    }, 500);
  }, [isTouchDevice, connectMode, id, completeConnection, handleDeleteNode, startConnectMode, showMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.current.x, 2) +
      Math.pow(touch.clientY - touchStartPos.current.y, 2)
    );
    if (distance > 10 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    touchStartPos.current = null;
  }, []);

  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  // 监听连接的图片节点
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    const imageNodes = connectedNodes.filter(n => n.type === 'image');
    setConnectedImagesCount(imageNodes.length);
    const imageUrls: string[] = [];
    imageNodes.forEach(node => {
      const nodeData = node.data as { imageUrl?: string };
      if (nodeData.imageUrl) imageUrls.push(nodeData.imageUrl);
    });
    setConnectedImageUrls(imageUrls);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

  // 添加消息
  const addMessage = useCallback((msg: Omit<AgentMessage, "id" | "timestamp">) => {
    setAgentMessages(prev => {
      const updatedPrev = prev.map(m =>
        m.isStreaming ? { ...m, isStreaming: false, content: m.streamContent || m.content } : m
      );
      return [...updatedPrev, {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }];
    });
  }, []);

  // 更新流式消息
  const updateLastStreamMessage = useCallback((content: string) => {
    setAgentMessages(prev => {
      const newMessages = [...prev];
      const lastIdx = newMessages.length - 1;
      if (lastIdx >= 0 && newMessages[lastIdx].isStreaming) {
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          streamContent: (newMessages[lastIdx].streamContent || "") + content,
        };
      }
      return newMessages;
    });
  }, []);

  // 完成流式
  const finishStreamMessage = useCallback(() => {
    setAgentMessages(prev => {
      const newMessages = [...prev];
      const lastIdx = newMessages.length - 1;
      if (lastIdx >= 0 && newMessages[lastIdx].isStreaming) {
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          isStreaming: false,
          content: newMessages[lastIdx].streamContent || newMessages[lastIdx].content,
        };
      }
      return newMessages;
    });
  }, []);

  // 发送消息 / 生成 PPT
  const onGenerate = useCallback(async (customPrompt?: string) => {
    const prompt = customPrompt || theme;
    if (!prompt || isGenerating) return;

    setIsGenerating(true);
    if (!customPrompt) {
      setAgentMessages([]);
      // 重置版本时会清除 slides（因为 slides 从 currentVersion 派生）
      // 但保留版本历史，以便对比
    }

    // 添加用户消息
    addMessage({
      type: "user_request",
      role: "user",
      content: customPrompt || `生成 PPT：${theme}${description ? `\n${description}` : ""}`,
    });

    // 获取连接的图片
    const connectedNodes = getConnectedImageNodes(id);
    const images: string[] = [];
    connectedNodes.forEach(node => {
      const nodeData = node.data as { imageUrl?: string };
      if (nodeData.imageUrl) images.push(nodeData.imageUrl);
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/ppt/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: customPrompt || theme,
          description: customPrompt ? undefined : description || undefined,
          template,
          primaryColor,
          materials: images.length > 0 ? images.map(url => ({ type: "image", url })) : undefined,
          sessionId: sessionId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "task_created":
                  setTaskId(data.taskId);
                  break;

                case "system_init":
                  if (data.sessionId) setSessionId(data.sessionId);
                  addMessage({
                    type: "system_init",
                    role: "system",
                    content: `🚀 Agent 已就绪`,
                  });
                  break;

                case "stream_start":
                  if (data.blockType === "text") {
                    addMessage({
                      type: "stream_text",
                      role: "assistant",
                      content: "",
                      streamContent: "",
                      isStreaming: true,
                    });
                  } else if (data.blockType === "tool_use") {
                    addMessage({
                      type: "tool_start",
                      role: "assistant",
                      content: `🔧 ${data.toolName}`,
                      toolName: data.toolName,
                      toolId: data.toolId,
                      isStreaming: true,
                      streamContent: "",
                    });
                  }
                  break;

                case "stream_delta":
                  if (!data.isToolInput) {
                    updateLastStreamMessage(data.content);
                  }
                  break;

                case "stream_stop":
                  finishStreamMessage();
                  break;

                case "tool_call":
                  addMessage({
                    type: "tool_call",
                    role: "assistant",
                    content: `🔧 ${data.toolName}`,
                    toolName: data.toolName,
                    toolId: data.toolId,
                    input: data.input,
                  });
                  break;

                case "tool_result":
                  addMessage({
                    type: "tool_result",
                    role: "tool",
                    content: data.content,
                    toolId: data.toolId,
                    isError: data.isError,
                  });
                  break;

                case "completed":
                  // 添加新版本到版本列表
                  if (data.previewUrl || data.downloadUrl) {
                    setPptVersions(prev => {
                      const newVersion: PPTVersion = {
                        id: data.taskId || `v${prev.length + 1}`,
                        version: prev.length + 1,
                        previewUrl: data.previewUrl || "",
                        downloadUrl: data.downloadUrl || data.pptUrl || "",
                        createdAt: Date.now(),
                        description: prev.length === 0
                          ? (theme || "初始版本")
                          : (chatInput || `优化版本 ${prev.length + 1}`),
                        slides: data.slides || [],
                      };
                      const updated = [...prev, newVersion];
                      // 自动切换到最新版本
                      setCurrentVersionIndex(updated.length - 1);
                      setCurrentSlide(0);
                      return updated;
                    });
                  }
                  addMessage({
                    type: "completed",
                    role: "system",
                    content: `✅ PPT 生成完成！共 ${data.slides?.length || 0} 页（版本 ${pptVersions.length + 1}）`,
                  });
                  break;

                case "error":
                  addMessage({
                    type: "error",
                    role: "system",
                    content: `❌ ${data.message}`,
                    isError: true,
                  });
                  break;
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        addMessage({ type: "cancelled", role: "system", content: "⏹️ 已取消" });
      } else {
        addMessage({ type: "error", role: "system", content: `❌ ${(error as Error).message}`, isError: true });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [theme, description, template, primaryColor, isGenerating, sessionId, id, getConnectedImageNodes, addMessage, updateLastStreamMessage, finishStreamMessage]);

  // 发送追加需求
  const sendChatMessage = useCallback(() => {
    if (!chatInput.trim() || isGenerating) return;
    const msg = chatInput.trim();
    setChatInput("");
    onGenerate(msg);
  }, [chatInput, isGenerating, onGenerate]);

  // 取消生成
  const onCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // 下载 PPT
  const downloadPPT = useCallback(() => {
    if (taskId) window.open(`/api/ppt/export?id=${taskId}`, "_blank");
  }, [taskId]);

  // 重置
  const resetChat = useCallback(() => {
    setAgentMessages([]);
    setPptVersions([]);
    setCurrentVersionIndex(0);
    setSessionId(null);
    setTaskId(null);
    setCurrentSlide(0);
  }, []);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className={cn(
      "touch-node-wrapper",
      connectMode.isActive && connectMode.sourceNodeId !== id && "ring-2 ring-purple-400 ring-offset-2 rounded-2xl"
    )}>
      <GeneratorNodeLayout
        title="PPT Generator"
        icon={Presentation}
        color="purple"
        selected={selected}
        className="w-[360px]"
        isGenerating={isGenerating}
        onGenerate={() => onGenerate()}
        generateButtonText={agentMessages.length > 0 ? "重新生成" : "生成 PPT"}
        generateButtonDisabled={!theme}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        headerActions={
          <div className="flex items-center gap-1">
            {previewUrl && (
              <button
                onClick={() => window.open(previewUrl, "_blank")}
                className="p-1 rounded hover:bg-purple-100"
                title="在线预览"
              >
                <Eye className="w-3.5 h-3.5 text-purple-600" />
              </button>
            )}
            {downloadUrl && (
              <button
                onClick={() => window.open(downloadUrl, "_blank")}
                className="p-1 rounded hover:bg-purple-100"
                title="下载 PPT"
              >
                <Download className="w-3.5 h-3.5 text-purple-600" />
              </button>
            )}
            {agentMessages.length > 0 && (
              <button onClick={resetChat} className="p-1 rounded hover:bg-purple-100" title="重置">
                <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
              </button>
            )}
            {connectedImagesCount > 0 && (
              <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                <Link2 className="w-3 h-3" />
                {connectedImagesCount}
              </span>
            )}
          </div>
        }
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-pink-500 !border-2 !border-white !rounded-full"
        />

        {/* Agent 工作流 - Liquid Mercury 美学 */}
        {(isGenerating || agentMessages.length > 0) && (
          <div className="relative rounded-2xl overflow-hidden mb-3 noise-texture">
            {/* 外层边框 - 生成中全息效果 */}
            <div className={cn(
              "absolute inset-0 rounded-2xl p-[1.5px]",
              isGenerating ? "holographic-border" : "bg-gradient-to-br from-zinc-300/80 via-zinc-200/60 to-zinc-300/80"
            )}>
              <div className="absolute inset-0 rounded-2xl mercury-surface" />
            </div>

            {/* 主体面板 */}
            <div className="relative glass-panel rounded-2xl">
              {/* 顶部高光线 */}
              <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/90 to-transparent" />
              {/* 底部反光 */}
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-100/30 to-transparent pointer-events-none" />

              {/* 头部区域 */}
              <div className="relative px-3 py-2.5 border-b border-zinc-200/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {/* 状态指示器 - 三点式 */}
                    <div className="flex items-center gap-1">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-500",
                        isGenerating ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-zinc-300"
                      )} />
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-500 delay-100",
                        isGenerating ? "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]" : "bg-zinc-300"
                      )} />
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-500 delay-200",
                        isGenerating ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]" : "bg-zinc-300"
                      )} />
                    </div>
                    {/* 标题 */}
                    <span className={cn(
                      "text-[10px] font-bold tracking-[0.12em] uppercase",
                      isGenerating ? "text-chrome" : "text-zinc-400"
                    )}>
                      Agent Workflow
                    </span>
                  </div>
                  {isGenerating && (
                    <button
                      onClick={onCancel}
                      className="px-2.5 py-1 rounded-md text-[9px] font-semibold bg-gradient-to-br from-rose-50 to-rose-100 text-rose-500 hover:from-rose-100 hover:to-rose-200 border border-rose-200/50 transition-all shadow-sm"
                    >
                      停止
                    </button>
                  )}
                </div>
              </div>

              {/* 消息流 - 添加交错动画 */}
              <div className="max-h-44 overflow-y-auto p-2.5 space-y-2">
                {agentMessages.map((msg, idx) => {
                  const isLast = idx === agentMessages.length - 1;
                  const isActive = msg.isStreaming && isLast;
                  const animationDelay = `${Math.min(idx * 50, 200)}ms`;

                  return (
                    <div
                      key={msg.id}
                      className="animate-message-in"
                      style={{ animationDelay }}
                    >
                      {/* 用户消息 */}
                      {msg.role === "user" && (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-md bg-gradient-to-br from-violet-500 via-purple-500 to-purple-600 text-white text-[10px] shadow-lg shadow-purple-200/50 font-medium leading-relaxed">
                            {msg.content}
                          </div>
                        </div>
                      )}

                      {/* 系统消息 */}
                      {msg.role === "system" && (
                        <div className="flex justify-center">
                          <div className={cn(
                            "px-3 py-1.5 rounded-full text-[9px] font-semibold",
                            "bg-gradient-to-r from-zinc-50 via-white to-zinc-50",
                            "border border-zinc-200/60 shadow-sm",
                            msg.isError && "from-rose-50 via-rose-25 to-rose-50 border-rose-200 text-rose-600"
                          )}>
                            <span className={msg.isError ? "" : "text-zinc-500"}>{msg.content}</span>
                          </div>
                        </div>
                      )}

                      {/* 助手输出 - Markdown 渲染 */}
                      {msg.role === "assistant" && !msg.toolName && (
                        <div className="flex justify-start">
                          <div className={cn(
                            "max-w-[90%] px-3 py-2 rounded-2xl rounded-tl-md text-[10px] text-zinc-700",
                            "bg-white border shadow-sm transition-all duration-300 leading-relaxed",
                            "prose prose-xs prose-zinc max-w-none",
                            "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-[10px]",
                            "[&_code]:text-[9px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:bg-zinc-100 [&_code]:rounded",
                            isActive
                              ? "border-purple-200/80 shadow-purple-100/50 shadow-md"
                              : "border-zinc-100/80"
                          )}>
                            {msg.isStreaming ? (
                              <div>
                                <Streamdown>{normalizeMarkdown(msg.streamContent || msg.content || "")}</Streamdown>
                                <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-gradient-to-b from-violet-400 to-purple-600 animate-pulse rounded-full" />
                              </div>
                            ) : (
                              <Streamdown>{normalizeMarkdown(msg.content || "")}</Streamdown>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 工具调用 - Liquid Mercury 风格 */}
                      {msg.role === "assistant" && msg.toolName && (
                        <div className="flex justify-start pl-1">
                          <div className={cn(
                            "relative max-w-[95%] px-3 py-2 rounded-xl border overflow-hidden transition-all duration-300",
                            isActive
                              ? "bg-gradient-to-br from-slate-50/95 via-zinc-50/90 to-slate-100/85 border-zinc-300/80 shadow-md"
                              : "bg-zinc-50/80 border-zinc-200/60"
                          )}>
                            {/* 数据流脉冲 - 只在活跃时 */}
                            {isActive && (
                              <div className="absolute inset-0 data-flow-pulse overflow-hidden rounded-xl" />
                            )}

                            <div className="relative flex items-center gap-2 mb-1.5">
                              {/* 工具图标容器 */}
                              <div className={cn(
                                "w-5 h-5 rounded-md flex items-center justify-center border transition-all",
                                isActive
                                  ? "bg-gradient-to-br from-violet-100 via-purple-50 to-violet-100 border-violet-200/60 shadow-sm"
                                  : "bg-zinc-100/80 border-zinc-200/60"
                              )}>
                                <Sparkles className={cn(
                                  "w-3 h-3 transition-all",
                                  isActive ? "text-violet-500 animate-tool-spin" : "text-zinc-400"
                                )} />
                              </div>
                              {/* 工具名 */}
                              <span className={cn(
                                "text-[10px] font-bold tracking-wide",
                                isActive ? "text-chrome" : "text-zinc-600"
                              )}>
                                {msg.toolName}
                              </span>
                              {isActive && (
                                <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-violet-100 text-violet-600 animate-pulse">
                                  运行中
                                </span>
                              )}
                            </div>

                            {/* 工具输入参数 */}
                            {msg.input && (
                              <details className="group relative" open={isActive}>
                                <summary className="text-[9px] text-zinc-500 cursor-pointer hover:text-violet-600 flex items-center gap-1 transition-colors">
                                  <span className="group-open:rotate-90 transition-transform duration-200 text-[8px]">▶</span>
                                  <span className="font-medium">查看内容</span>
                                </summary>
                                <pre className="mt-1.5 p-2.5 text-[9px] text-zinc-600 bg-white/90 rounded-lg border border-zinc-200/60 overflow-x-auto max-h-32 whitespace-pre-wrap break-all backdrop-blur-sm font-mono leading-relaxed">
                                  {typeof msg.input === 'string'
                                    ? msg.input
                                    : JSON.stringify(msg.input, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 工具结果 */}
                      {msg.role === "tool" && (
                        <div className="flex justify-start pl-5">
                          <div className={cn(
                            "max-w-[95%] px-2.5 py-1.5 rounded-lg border-l-2",
                            "bg-gradient-to-r from-slate-50/90 to-zinc-50/70",
                            msg.isError ? "border-rose-400" : "border-violet-300"
                          )}>
                            {(msg.content || "").length > 150 ? (
                              <details className="group">
                                <summary className="text-[9px] text-zinc-500 cursor-pointer hover:text-zinc-700 transition-colors">
                                  <span className={cn("font-mono", msg.isError && "text-rose-600")}>
                                    {(msg.content || "").substring(0, 100)}...
                                  </span>
                                  <span className="ml-1 text-violet-500 font-medium">[展开]</span>
                                </summary>
                                <pre className="mt-1.5 p-2.5 text-[9px] text-zinc-600 bg-white/90 rounded-lg border border-zinc-200/60 overflow-x-auto max-h-48 whitespace-pre-wrap break-all font-mono backdrop-blur-sm leading-relaxed">
                                  {msg.content}
                                </pre>
                              </details>
                            ) : (
                              <span className={cn("text-[9px] font-mono leading-relaxed", msg.isError ? "text-rose-600" : "text-zinc-600")}>
                                {msg.content}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* 追加输入框 - 优化样式 */}
              {agentMessages.length > 0 && !isGenerating && (
                <div className="px-2.5 py-2.5 border-t border-zinc-200/40 bg-gradient-to-r from-white/60 via-zinc-50/40 to-white/60">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="继续修改要求..."
                      className="flex-1 px-3 py-2 text-[10px] rounded-xl border border-zinc-200/80 bg-white/80 focus:outline-none focus:border-violet-400 focus:bg-white input-focus-glow transition-all placeholder:text-zinc-400"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim()}
                      className={cn(
                        "p-2 rounded-xl transition-all duration-300",
                        chatInput.trim()
                          ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-200/50 send-button-ready"
                          : "bg-zinc-100 text-zinc-400"
                      )}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PPT 预览 - 浮动卡片效果 */}
        {slides.length > 0 && (
          <div className="mb-3 relative">
            {/* 流光边框 */}
            <div className="absolute inset-0 rounded-2xl p-[1.5px] flowing-border">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-50 to-white" />
            </div>

            <div className="relative p-2.5 rounded-2xl bg-gradient-to-br from-zinc-50/95 via-white/90 to-zinc-50/95">
              {/* 预览卡片 */}
              <div className="aspect-[16/9] bg-white rounded-xl shadow-lg border border-zinc-100/80 p-3 mb-2.5 preview-card-float">
                {/* 顶部装饰线 */}
                <div className="absolute top-0 left-4 right-4 h-[2px] bg-gradient-to-r from-violet-400 via-purple-500 to-violet-400 rounded-full opacity-60" />

                <h4 className="text-xs font-bold text-zinc-800 mb-1.5 leading-tight">{slides[currentSlide]?.title}</h4>
                {slides[currentSlide]?.content && (
                  <ul className="text-[9px] text-zinc-600 space-y-1">
                    {slides[currentSlide].content.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 mt-1 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 页码角标 */}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-zinc-100/80 text-[8px] font-bold text-zinc-500">
                  {currentSlide + 1} / {slides.length}
                </div>
              </div>

              {/* 导航按钮 */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                  disabled={currentSlide === 0}
                  className="px-3 py-1 text-[9px] font-semibold rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 hover:from-zinc-200 hover:to-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-zinc-200/60 shadow-sm"
                >
                  上一页
                </button>

                {/* 页码指示器 */}
                <div className="flex items-center gap-1">
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-300",
                        idx === currentSlide
                          ? "bg-gradient-to-br from-violet-500 to-purple-600 w-3"
                          : "bg-zinc-300 hover:bg-zinc-400"
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                  disabled={currentSlide === slides.length - 1}
                  className="px-3 py-1 text-[9px] font-semibold rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 hover:from-zinc-200 hover:to-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-zinc-200/60 shadow-sm"
                >
                  下一页
                </button>
              </div>

              {/* 版本选择器 */}
              {pptVersions.length > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2.5 pt-2.5 border-t border-zinc-200/40">
                  <span className="text-[9px] text-zinc-500">版本:</span>
                  <div className="flex items-center gap-1">
                    {pptVersions.map((v, idx) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setCurrentVersionIndex(idx);
                          setCurrentSlide(0);
                        }}
                        title={`${v.description} (${new Date(v.createdAt).toLocaleTimeString()})`}
                        className={cn(
                          "min-w-[24px] h-6 px-1.5 text-[9px] font-semibold rounded-md transition-all",
                          idx === currentVersionIndex
                            ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        )}
                      >
                        V{v.version}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 当前版本信息 */}
              {currentVersion && pptVersions.length > 0 && (
                <div className="text-center text-[8px] text-zinc-400 mt-1">
                  {currentVersion.description}
                  {pptVersions.length > 1 && ` · ${new Date(currentVersion.createdAt).toLocaleTimeString()}`}
                </div>
              )}

              {/* 预览和下载按钮 */}
              {(previewUrl || downloadUrl) && (
                <div className="flex items-center justify-center gap-2 mt-2.5 pt-2.5 border-t border-zinc-200/40">
                  {previewUrl && (
                    <button
                      onClick={() => window.open(previewUrl, "_blank")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-semibold rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 transition-all shadow-md shadow-purple-200/50"
                    >
                      <Eye className="w-3 h-3" />
                      在线预览
                    </button>
                  )}
                  {downloadUrl && (
                    <button
                      onClick={() => window.open(downloadUrl, "_blank")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-semibold rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 hover:from-zinc-200 hover:to-zinc-300 transition-all border border-zinc-200/60 shadow-sm"
                    >
                      <Download className="w-3 h-3" />
                      下载 PPT
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {/* 主题输入 */}
          <div>
            <NodeLabel>演示主题 *</NodeLabel>
            <NodeTextarea
              className="w-full resize-none"
              rows={2}
              value={theme}
              onChange={(e) => { setTheme(e.target.value); data.theme = e.target.value; }}
              placeholder="输入 PPT 主题，如：产品发布会、季度总结..."
            />
          </div>

          {/* 补充说明 */}
          <div>
            <NodeLabel>补充说明</NodeLabel>
            <NodeTextarea
              className="w-full resize-none"
              rows={2}
              value={description}
              onChange={(e) => { setDescription(e.target.value); data.description = e.target.value; }}
              placeholder="（可选）添加更多说明或要求..."
            />
          </div>

          {/* 模板风格 */}
          <div className="space-y-1.5">
            <NodeLabel>模板风格</NodeLabel>
            <NodeTabSelect
              value={template}
              onChange={(val) => { setTemplate(val as PPTTemplate); data.template = val; }}
              options={[
                { value: "business", label: "商务" },
                { value: "tech", label: "科技" },
                { value: "minimal", label: "简约" },
                { value: "creative", label: "创意" },
              ]}
              color="purple"
              size="sm"
            />
          </div>

          {/* 主色调 - 优化选择器 */}
          <div className="space-y-2">
            <NodeLabel>
              <div className="flex items-center gap-1.5">
                <Palette className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] font-semibold tracking-wide">主色调</span>
              </div>
            </NodeLabel>
            <div className="flex items-center justify-between px-1">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => { setPrimaryColor(color.value); data.primaryColor = color.value; }}
                  className={cn(
                    "w-8 h-8 rounded-xl transition-all duration-300 relative group",
                    color.className,
                    primaryColor === color.value
                      ? "ring-2 ring-offset-2 ring-violet-500 scale-110 shadow-lg"
                      : "hover:scale-110 opacity-60 hover:opacity-100 hover:shadow-md"
                  )}
                  title={color.label}
                >
                  {/* 选中指示器 */}
                  {primaryColor === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
                    </div>
                  )}
                  {/* Hover 提示 */}
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-medium text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {color.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </GeneratorNodeLayout>
    </div>
  );
};

export default memo(PPTGenNode);
