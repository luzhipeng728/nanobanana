"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { enqueue, getQueueStatus } from "@/lib/rate-limiter";
import {
  Loader2,
  Brain,
  Search,
  Lightbulb,
  Wand2,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Link2,
  Eye,
  Palette,
} from "lucide-react";
import type { AgentNodeData, AgentPrompt, AgentStreamEvent } from "@/types/agent";
import { RESOLUTION_OPTIONS } from "@/types/image-gen";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeSelect, NodeButton, NodeLabel } from "@/components/ui/NodeUI";
import ReactMarkdown from "react-markdown";

const AgentNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addImageNode, updateImageNode, getNode, getConnectedImageNodes } = useCanvas();
  const { getNode: getReactFlowNode, getNodes: getReactFlowNodes } = useReactFlow();

  const [userRequest, setUserRequest] = useState(data.userRequest || "");
  const [selectedModel, setSelectedModel] = useState<"nano-banana" | "nano-banana-pro">("nano-banana");
  const [imageSize, setImageSize] = useState<string>("2K"); // Default resolution for Pro model
  const [aspectRatio, setAspectRatio] = useState<string>("16:9"); // 默认比例
  const [status, setStatus] = useState<AgentNodeData["status"]>(data.status || "idle");
  const [currentStep, setCurrentStep] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [error, setError] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0); // 当前正在生成的数量

  // 参考图相关状态
  const [connectedImages, setConnectedImages] = useState<string[]>([]);
  const [useForClaude, setUseForClaude] = useState(true); // 给 Claude 理解图片
  const [useForImageGen, setUseForImageGen] = useState(true); // 给生图模型作为参考

  // Claude 分析流式展示
  const [claudeAnalysis, setClaudeAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 监听连接的图片节点
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    const imageUrls = connectedNodes
      .map(node => node.data.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    setConnectedImages(imageUrls);
  }, [id, getConnectedImageNodes]);

  const statusIcons = {
    idle: Brain,
    searching: Search,
    planning: Lightbulb,
    generating: Wand2,
    creating: ImageIcon,
    completed: CheckCircle2,
    error: XCircle,
  };

  const StatusIcon = statusIcons[status];

  // 使用全局速率限制器生成图片
  const generateImagesInBatches = async (promptsList: AgentPrompt[]) => {
    console.log(`🎬 [generateImagesInBatches] Starting with ${promptsList.length} prompts`);
    console.log(`🎬 [generateImagesInBatches] Model: ${selectedModel}`);
    console.log(`🎬 [generateImagesInBatches] Queue status:`, getQueueStatus());

    const currentNode = getReactFlowNode(id);

    if (!currentNode) {
      console.error(`❌ [generateImagesInBatches] Current node not found! id=${id}`);
      return;
    }

    console.log(`✅ [generateImagesInBatches] Current node found at position:`, currentNode.position);

    let completedCount = 0;
    const totalCount = promptsList.length;

    // 创建图片节点位置计算（2×n 网格布局：最多2行，然后往右排）
    const NODE_WIDTH = 420;
    const NODE_HEIGHT = 270;
    const HORIZONTAL_GAP = 50;
    const VERTICAL_GAP = 50;

    // 检查位置是否被占用
    const isPositionOccupied = (x: number, y: number) => {
      const allNodes = getReactFlowNodes();
      return allNodes.some((node) => {
        if (node.id === id) return false;
        const nodeWidth = (node.style?.width as number) || NODE_WIDTH;
        const nodeHeight = (node.style?.height as number) || NODE_HEIGHT;
        return (
          x < node.position.x + nodeWidth &&
          x + NODE_WIDTH > node.position.x &&
          y < node.position.y + nodeHeight &&
          y + NODE_HEIGHT > node.position.y
        );
      });
    };

    // 寻找未被占用的起始列位置
    const findStartColumn = () => {
      let col = 0;
      while (col < 100) {
        const testX = currentNode.position.x + 450 + col * (NODE_WIDTH + HORIZONTAL_GAP);
        const testY = currentNode.position.y;
        const row0Occupied = isPositionOccupied(testX, testY);
        const row1Occupied = isPositionOccupied(testX, testY + NODE_HEIGHT + VERTICAL_GAP);
        if (!row0Occupied && !row1Occupied) {
          return col;
        }
        col++;
      }
      return col;
    };

    const startColumn = findStartColumn();

    const getNodePosition = (index: number) => {
      const column = startColumn + Math.floor(index / 2);
      const row = index % 2;
      return {
        x: currentNode.position.x + 450 + column * (NODE_WIDTH + HORIZONTAL_GAP),
        y: currentNode.position.y + row * (NODE_HEIGHT + VERTICAL_GAP),
      };
    };

    console.log(`📋 [generateImagesInBatches] Adding ${promptsList.length} tasks to rate-limited queue...`);

    // 为每个 prompt 创建一个 Promise，通过速率限制器排队执行
    const promises = promptsList.map((prompt, index) => {
      // 更新 prompt 状态为排队中
      setPrompts((prev) =>
        prev.map((p) => (p.id === prompt.id ? { ...p, status: "pending" } : p))
      );

      // 使用速率限制器排队执行
      return enqueue(selectedModel, async () => {
        const startTime = Date.now();

        try {
          // 增加正在生成的计数
          setGeneratingCount((prev) => prev + 1);

          // 更新 prompt 状态为生成中
          setPrompts((prev) =>
            prev.map((p) => (p.id === prompt.id ? { ...p, status: "generating" } : p))
          );

          const startTimeStr = new Date().toLocaleTimeString() + '.' + Date.now() % 1000;
          console.log(`🚀 [START ${startTimeStr}] Task ${index + 1}/${totalCount}: ${prompt.scene}`);

          // 如果启用了"给生图模型"，添加参考图
          const referenceImagesForGen = useForImageGen ? connectedImages : [];

          // 构建配置
          const config: any = {};
          if (referenceImagesForGen.length === 0) {
            config.aspectRatio = aspectRatio;
          }
          if (selectedModel === "nano-banana-pro") {
            config.imageSize = imageSize;
          }

          const response = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: prompt.prompt,
              model: selectedModel,
              config,
              referenceImages: referenceImagesForGen,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);

          if (result.success && result.taskId) {
            // 创建 Image 节点
            const position = getNodePosition(index);
            addImageNode(
              undefined,
              prompt.prompt,
              position,
              result.taskId,
              { model: selectedModel, config, referenceImages: referenceImagesForGen }
            );

            // 更新 prompt 状态
            setPrompts((prev) =>
              prev.map((p) =>
                p.id === prompt.id
                  ? { ...p, status: "completed", taskId: result.taskId }
                  : p
              )
            );

            completedCount++;
            setProgress(90 + (completedCount / totalCount) * 10);
            console.log(`✅ [SUCCESS] Task ${index + 1}/${totalCount} created in ${duration}s (${completedCount}/${totalCount} done)`);

            return result;
          } else {
            throw new Error(result.error || "创建任务失败");
          }
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`❌ [FAILED] Image ${index + 1}/${totalCount} failed after ${duration}s:`, err);
          setPrompts((prev) =>
            prev.map((p) =>
              p.id === prompt.id
                ? { ...p, status: "error", error: err instanceof Error ? err.message : "生成失败" }
                : p
            )
          );
          throw err;
        } finally {
          setGeneratingCount((prev) => prev - 1);
        }
      });
    });

    console.log(`📥 [generateImagesInBatches] ${promises.length} tasks queued, waiting for completion...`);
    console.log(`📊 [generateImagesInBatches] Queue status:`, getQueueStatus());

    // 等待所有任务完成（会自动按速率限制执行）
    try {
      await Promise.allSettled(promises);
    } catch (err) {
      console.error("Some tasks failed:", err);
    }

    // 完成
    setStatus("idle");
    setCurrentStep("");
    setProgress(100);
    setGeneratingCount(0);
    console.log("🎉 All tasks completed! Images are generating in background.");
  };

  const onGenerate = useCallback(async () => {
    if (!userRequest.trim() || isRunning) return;

    setIsRunning(true);
    setError("");
    setStatus("searching");
    setProgress(0);
    setPrompts([]);
    setClaudeAnalysis("");
    setIsAnalyzing(false);

    abortControllerRef.current = new AbortController();

    try {
      // 准备参考图数据
      const referenceImages = connectedImages.length > 0 ? {
        urls: connectedImages,
        useForClaude,    // 给 Claude 理解
        useForImageGen,  // 给生图模型
      } : undefined;

      const response = await fetch("/api/agent/generate-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userRequest,
          referenceImages,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const eventData = line.slice(6);
            try {
              const event: AgentStreamEvent = JSON.parse(eventData);

              if (event.type === "status") {
                if (event.status) setStatus(event.status);
                if (event.step) setCurrentStep(event.step);
                if (event.progress !== undefined) setProgress(event.progress);
              } else if (event.type === "progress") {
                if (event.progress !== undefined) setProgress(event.progress);
              } else if (event.type === "claude_analysis_start") {
                setIsAnalyzing(true);
                setClaudeAnalysis("");
              } else if (event.type === "claude_analysis_chunk") {
                if (event.chunk) {
                  setClaudeAnalysis(prev => prev + event.chunk);
                  // 自动滚动到底部
                  if (analysisRef.current) {
                    analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
                  }
                }
              } else if (event.type === "claude_analysis_end") {
                setIsAnalyzing(false);
              } else if (event.type === "prompts") {
                if (event.prompts) {
                  setPrompts(event.prompts);
                  // 开始并发生成图片
                  setTimeout(() => {
                    generateImagesInBatches(event.prompts!);
                  }, 500);
                }
              } else if (event.type === "error") {
                setError(event.error || "未知错误");
                setStatus("error");
              } else if (event.type === "complete") {
                if (event.status) setStatus(event.status);
                if (event.progress !== undefined) setProgress(event.progress);
              }
            } catch (e) {
              console.error("Failed to parse event:", e);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
      } else {
        console.error("Generation error:", err);
        setError(err instanceof Error ? err.message : "未知错误");
        setStatus("error");
      }
    } finally {
      setIsRunning(false);
    }
  }, [userRequest, selectedModel, imageSize, aspectRatio, isRunning, id, getReactFlowNode, addImageNode, updateImageNode, connectedImages, useForClaude, useForImageGen]);

  const onStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      setStatus("idle");
      setCurrentStep("");
    }
  };

  return (
    <BaseNode
      title="Agent"
      icon={Brain}
      color="purple"
      selected={selected}
      className="w-[350px]"
      headerActions={
        <div className="flex items-center gap-1.5">
          {connectedImages.length > 0 ? (
            <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
              <Link2 className="w-3 h-3" />
              {connectedImages.length} 张参考图
            </span>
          ) : (
            <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
              ← 可连接参考图
            </span>
          )}
          {status !== "idle" && status !== "error" && (
            <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
          )}
          <StatusIcon className="w-3.5 h-3.5 text-purple-600" />
        </div>
      }
    >
      {/* 左侧输入连接点 - 接收参考图片 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-pink-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-purple-500/50"
        title="连接图片作为参考"
      />

      {/* 参考图选项 - 只有连接了图片才显示 */}
      {connectedImages.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-purple-700 dark:text-purple-300">
            <ImageIcon className="w-3.5 h-3.5" />
            参考图用途
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={useForClaude}
                onChange={(e) => setUseForClaude(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
              />
              <Eye className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[11px] text-neutral-700 dark:text-neutral-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                让 AI 理解图片内容（Claude Sonnet）
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={useForImageGen}
                onChange={(e) => setUseForImageGen(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
              />
              <Palette className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[11px] text-neutral-700 dark:text-neutral-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                作为生图模型参考图
              </span>
            </label>
          </div>
          {/* 参考图预览 */}
          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
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

      {/* User Request Input */}
      <div className="space-y-1">
        <NodeLabel>Goal Description</NodeLabel>
        <NodeTextarea
          rows={4}
          value={userRequest}
          onChange={(e) => setUserRequest(e.target.value)}
          placeholder="Describe the scene you want to generate..."
          disabled={isRunning}
          className="focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      {/* Model, Resolution & Aspect Ratio */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <NodeLabel>Model</NodeLabel>
          <NodeSelect
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as any)}
            disabled={isRunning}
          >
            <option value="nano-banana">Fast</option>
            <option value="nano-banana-pro">Pro</option>
          </NodeSelect>
        </div>

        {/* Aspect Ratio - 只有没有参考图（或没勾选给生图模型）时才显示 */}
        {!(connectedImages.length > 0 && useForImageGen) && (
          <div className="space-y-1">
            <NodeLabel>Aspect Ratio</NodeLabel>
            <NodeSelect
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={isRunning}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </NodeSelect>
          </div>
        )}

        {/* Resolution for Pro model */}
        {selectedModel === "nano-banana-pro" && (
          <div className="space-y-1">
            <NodeLabel>Resolution</NodeLabel>
            <NodeSelect
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={isRunning}
            >
              {Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => (
                <option key={key} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NodeSelect>
          </div>
        )}
      </div>

      {/* Status & Progress */}
      {status !== "idle" && (
        <div className="space-y-2 bg-neutral-50 dark:bg-neutral-900/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-600 dark:text-neutral-400 truncate flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              {currentStep}
              {generatingCount > 0 && status === "creating" && (
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  ({generatingCount})
                </span>
              )}
            </span>
            <span className="text-purple-600 dark:text-purple-400 font-medium">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Claude 分析流式展示 */}
      {(isAnalyzing || claudeAnalysis) && (
        <div className="relative overflow-hidden rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-purple-950/30 dark:via-pink-950/20 dark:to-blue-950/30">
          {/* 动态背景效果 */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-blue-500/5 animate-pulse" />
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 opacity-60" />
          
          {/* Header */}
          <div className="relative px-3 py-2 border-b border-purple-100 dark:border-purple-900/50 flex items-center gap-2">
            <div className="relative">
              <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              {isAnalyzing && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
              Claude Vision 分析中
            </span>
            {isAnalyzing && (
              <div className="ml-auto flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
          
          {/* Content - 流式 Markdown 渲染 */}
          <div 
            ref={analysisRef}
            className="relative p-3 max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800"
          >
            <div className="text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300 prose prose-xs prose-purple dark:prose-invert max-w-none
              prose-headings:text-[12px] prose-headings:font-bold prose-headings:text-purple-700 dark:prose-headings:text-purple-300 prose-headings:mt-2 prose-headings:mb-1
              prose-p:my-1 prose-p:text-[11px]
              prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-[11px]
              prose-ol:my-1 prose-ol:pl-4
              prose-strong:text-purple-600 dark:prose-strong:text-purple-400
              prose-code:text-[10px] prose-code:bg-purple-100 dark:prose-code:bg-purple-900/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            ">
              <ReactMarkdown>{claudeAnalysis}</ReactMarkdown>
              {isAnalyzing && (
                <span className="inline-block w-2 h-4 bg-purple-500 ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 flex gap-2 items-start">
          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400 leading-tight">{error}</p>
        </div>
      )}

      {/* Generated Prompts */}
      {prompts.length > 0 && (
        <div className="space-y-2">
          <NodeLabel>Scenes ({prompts.length})</NodeLabel>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 transition-colors hover:border-purple-200 dark:hover:border-purple-900/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                    {prompt.scene}
                  </span>
                  <span className="text-[10px] text-neutral-500 ml-2 flex-shrink-0">
                    {prompt.status === "pending" && "Waiting"}
                    {prompt.status === "generating" && (
                      <span className="flex items-center gap-1 text-purple-600">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Gen
                      </span>
                    )}
                    {prompt.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    {prompt.status === "error" && <XCircle className="w-3 h-3 text-red-500" />}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 line-clamp-2 leading-relaxed">
                  {prompt.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2">
        {!isRunning ? (
          <NodeButton
            onClick={onGenerate}
            disabled={!userRequest.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Brain className="w-3.5 h-3.5" />
            Start Agent
          </NodeButton>
        ) : (
          <NodeButton
            onClick={onStop}
            variant="danger"
            className="w-full"
          >
            <XCircle className="w-3.5 h-3.5" />
            Stop Generation
          </NodeButton>
        )}
      </div>

      </BaseNode>
  );
};

export default memo(AgentNode);
