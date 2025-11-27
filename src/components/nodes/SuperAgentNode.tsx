"use client";

import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { enqueue, getQueueStatus } from "@/lib/rate-limiter";
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Copy,
  Check,
  Zap,
  Brain,
  Target,
  Wand2,
  Link2,
  Eye,
  Palette,
  StopCircle,
} from "lucide-react";
import type {
  SuperAgentStreamEvent,
  ThoughtStep,
  FinalOutput,
  PromptItem,
} from "@/types/super-agent";
import { RESOLUTION_OPTIONS } from "@/types/image-gen";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeButton, NodeLabel, NodeTabSelect } from "@/components/ui/NodeUI";

// Tool icons mapping
const TOOL_ICONS: Record<string, React.ReactNode> = {
  skill_matcher: <Target className="w-3 h-3" />,
  load_skill: <Zap className="w-3 h-3" />,
  generate_prompt: <Wand2 className="w-3 h-3" />,
  web_search: <Search className="w-3 h-3" />,
  analyze_image: <ImageIcon className="w-3 h-3" />,
  optimize_prompt: <Sparkles className="w-3 h-3" />,
  evaluate_prompt: <CheckCircle2 className="w-3 h-3" />,
  finalize_output: <Check className="w-3 h-3" />,
};

// Tool names mapping
const TOOL_NAMES: Record<string, string> = {
  skill_matcher: "匹配技能",
  load_skill: "加载技能",
  generate_prompt: "生成提示词",
  web_search: "搜索资料",
  analyze_image: "分析图片",
  optimize_prompt: "优化提示词",
  evaluate_prompt: "质量评估",
  finalize_output: "输出结果",
};

// Extended PromptItem with status
interface PromptItemWithStatus extends PromptItem {
  status: "pending" | "generating" | "completed" | "error";
  taskId?: string;
  error?: string;
}

const SuperAgentNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addImageNode, getConnectedImageNodes } = useCanvas();
  const { getNode: getReactFlowNode, getNodes: getReactFlowNodes } = useReactFlow();

  // States
  const [userRequest, setUserRequest] = useState(data.userRequest || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [matchedSkill, setMatchedSkill] = useState<{
    id: string;
    name: string;
    confidence: number;
  } | null>(null);
  const [prompts, setPrompts] = useState<PromptItemWithStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Reference images
  const [connectedImages, setConnectedImages] = useState<string[]>([]);
  const [useForAnalysis, setUseForAnalysis] = useState(true);
  const [useForImageGen, setUseForImageGen] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<"nano-banana" | "nano-banana-pro">("nano-banana");
  const [imageSize, setImageSize] = useState<string>("2K");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [autoGenerate, setAutoGenerate] = useState(true);

  // Generation state
  const [generatingCount, setGeneratingCount] = useState(0);
  const [progress, setProgress] = useState(0);

  // Refs
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Monitor edge changes
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  // Get connected images
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    const imageUrls = connectedNodes
      .map(node => node.data.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    setConnectedImages(imageUrls);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

  // Auto-scroll to latest step
  useEffect(() => {
    if (stepsContainerRef.current) {
      stepsContainerRef.current.scrollTop = stepsContainerRef.current.scrollHeight;
    }
  }, [thoughtSteps]);

  // Batch generate images
  const generateImagesInBatches = useCallback(async (promptsList: PromptItemWithStatus[]) => {
    const currentNode = getReactFlowNode(id);
    if (!currentNode) return;

    const NODE_WIDTH = 450;
    const NODE_HEIGHT = 500;
    const HORIZONTAL_GAP = 30;
    const VERTICAL_GAP = 30;

    // Position calculation
    const getNodePosition = (index: number) => {
      const allNodes = getReactFlowNodes();
      const column = Math.floor(index / 2);
      const row = index % 2;

      let startCol = 0;
      while (startCol < 100) {
        const testX = currentNode.position.x + 420 + startCol * (NODE_WIDTH + HORIZONTAL_GAP);
        const testY = currentNode.position.y;
        const occupied = allNodes.some((node) => {
          if (node.id === id) return false;
          const nodeWidth = (node.style?.width as number) || NODE_WIDTH;
          const nodeHeight = (node.style?.height as number) || NODE_HEIGHT;
          return (
            testX < node.position.x + nodeWidth &&
            testX + NODE_WIDTH > node.position.x &&
            testY < node.position.y + nodeHeight &&
            testY + NODE_HEIGHT > node.position.y
          );
        });
        if (!occupied) break;
        startCol++;
      }

      return {
        x: currentNode.position.x + 420 + (startCol + column) * (NODE_WIDTH + HORIZONTAL_GAP),
        y: currentNode.position.y + row * (NODE_HEIGHT + VERTICAL_GAP),
      };
    };

    let completedCount = 0;
    const totalCount = promptsList.length;

    // Queue all tasks
    const promises = promptsList.map((prompt, index) => {
      setPrompts((prev) =>
        prev.map((p) => (p.id === prompt.id ? { ...p, status: "pending" as const } : p))
      );

      return enqueue(selectedModel, async () => {
        try {
          setGeneratingCount((prev) => prev + 1);
          setPrompts((prev) =>
            prev.map((p) => (p.id === prompt.id ? { ...p, status: "generating" as const } : p))
          );

          const referenceImagesForGen = useForImageGen ? connectedImages : [];
          const config: any = {};
          if (referenceImagesForGen.length === 0) {
            config.aspectRatio = aspectRatio;
          }
          if (selectedModel === "nano-banana-pro") {
            config.imageSize = imageSize;
          }

          // 验证 prompt 不为空
          if (!prompt.prompt || prompt.prompt.trim().length === 0) {
            console.error(`[SuperAgentNode] Empty prompt for scene "${prompt.scene}", skipping`);
            throw new Error(`场景 "${prompt.scene}" 的提示词为空`);
          }

          console.log(`[SuperAgentNode] Generating image ${index + 1}: scene="${prompt.scene}", prompt="${prompt.prompt.substring(0, 80)}..."`);

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
            const errorText = await response.text();
            console.error(`[SuperAgentNode] API error for scene "${prompt.scene}":`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          if (result.success && result.taskId) {
            const position = getNodePosition(index);
            addImageNode(
              undefined,
              prompt.prompt,
              position,
              result.taskId,
              { model: selectedModel, config, referenceImages: referenceImagesForGen },
              prompt.scene
            );

            setPrompts((prev) =>
              prev.map((p) =>
                p.id === prompt.id
                  ? { ...p, status: "completed" as const, taskId: result.taskId }
                  : p
              )
            );

            completedCount++;
            setProgress(90 + (completedCount / totalCount) * 10);
          }
        } catch (err) {
          setPrompts((prev) =>
            prev.map((p) =>
              p.id === prompt.id
                ? { ...p, status: "error" as const, error: err instanceof Error ? err.message : "生成失败" }
                : p
            )
          );
        } finally {
          setGeneratingCount((prev) => prev - 1);
        }
      });
    });

    await Promise.allSettled(promises);
    setProgress(100);
  }, [id, getReactFlowNode, getReactFlowNodes, addImageNode, connectedImages, useForImageGen, selectedModel, aspectRatio, imageSize]);

  // Handle stream event
  const handleStreamEvent = useCallback((event: SuperAgentStreamEvent) => {
    switch (event.type) {
      case "start":
        setProgress(10);
        break;

      case "skill_matched":
        setMatchedSkill({
          id: event.skillId,
          name: event.skillName,
          confidence: event.confidence,
        });
        setProgress(20);
        break;

      case "skill_not_matched":
        setMatchedSkill(null);
        break;

      case "thought":
        setCurrentIteration(event.iteration);
        setProgress(Math.min(80, 20 + event.iteration * 10));
        setThoughtSteps((prev) => {
          const existing = prev.find((s) => s.iteration === event.iteration);
          if (existing) {
            return prev.map((s) =>
              s.iteration === event.iteration
                ? { ...s, thought: event.content }
                : s
            );
          }
          return [
            ...prev,
            {
              iteration: event.iteration,
              thought: event.content,
              action: "",
              actionInput: {},
              observation: "",
            },
          ];
        });
        break;

      case "action":
        setThoughtSteps((prev) =>
          prev.map((s) =>
            s.iteration === event.iteration
              ? { ...s, action: event.tool, actionInput: event.input }
              : s
          )
        );
        break;

      case "observation":
        setThoughtSteps((prev) =>
          prev.map((s) =>
            s.iteration === event.iteration
              ? { ...s, observation: JSON.stringify(event.result, null, 2) }
              : s
          )
        );
        break;

      case "complete":
        setProgress(90);
        // Convert result prompts to PromptItemWithStatus
        const promptsWithStatus: PromptItemWithStatus[] = (event.result.prompts || []).map((p: PromptItem) => ({
          ...p,
          status: "pending" as const,
        }));
        setPrompts(promptsWithStatus);
        break;

      case "error":
        setError(event.error);
        break;
    }
  }, []);

  // Start generation
  const handleGenerate = useCallback(async () => {
    if (!userRequest.trim() || isProcessing) return;

    setIsProcessing(true);
    setThoughtSteps([]);
    setPrompts([]);
    setError(null);
    setMatchedSkill(null);
    setCurrentIteration(0);
    setProgress(0);

    abortControllerRef.current = new AbortController();

    try {
      const referenceImages = useForAnalysis && connectedImages.length > 0
        ? connectedImages
        : [];

      const response = await fetch("/api/super-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRequest,
          referenceImages,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalPrompts: PromptItemWithStatus[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: SuperAgentStreamEvent = JSON.parse(line.slice(6));
              handleStreamEvent(event);

              if (event.type === "complete") {
                console.log('[SuperAgentNode] Received prompts:', event.result.prompts);
                finalPrompts = (event.result.prompts || [])
                  .filter((p: PromptItem) => p.prompt && p.prompt.trim().length > 0)
                  .map((p: PromptItem) => ({
                    ...p,
                    status: "pending" as const,
                  }));
                console.log('[SuperAgentNode] Filtered prompts:', finalPrompts.length);
              }
            } catch (e) {
              console.warn("Failed to parse event:", line);
            }
          }
        }
      }

      // Auto-generate images
      if (autoGenerate && finalPrompts.length > 0) {
        setTimeout(() => {
          generateImagesInBatches(finalPrompts);
        }, 500);
      }

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
      } else {
        console.error("Generation failed:", err);
        setError(err instanceof Error ? err.message : "生成失败");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userRequest, connectedImages, useForAnalysis, isProcessing, handleStreamEvent, autoGenerate, generateImagesInBatches]);

  // Stop generation
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
    }
  }, []);

  // Copy all prompts
  const handleCopyAll = useCallback(() => {
    const text = prompts.map(p => `【${p.scene}】\n${p.prompt}`).join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
  }, [prompts]);

  // Manual generate single prompt
  const handleGenerateSingle = useCallback((prompt: PromptItemWithStatus) => {
    generateImagesInBatches([prompt]);
  }, [generateImagesInBatches]);

  return (
    <BaseNode
      title="Prompt Expert"
      icon={Sparkles}
      color="purple"
      selected={selected}
      className="w-[380px]"
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
          {isProcessing && (
            <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
          )}
        </div>
      }
    >
      {/* Left handle */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-pink-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-purple-500/50"
        title="连接图片作为参考"
      />

      {/* Right handle */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-violet-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full"
      />

      {/* Reference images section */}
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
                checked={useForAnalysis}
                onChange={(e) => setUseForAnalysis(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
              />
              <Eye className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                让 AI 分析图片生成提示词
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={useForImageGen}
                onChange={(e) => setUseForImageGen(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
              />
              <Palette className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                作为生图模型参考图
              </span>
            </label>
          </div>
          {/* Preview */}
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

      {/* Input area */}
      <div className="space-y-1">
        <NodeLabel>需求描述</NodeLabel>
        <NodeTextarea
          rows={3}
          value={userRequest}
          onChange={(e) => setUserRequest(e.target.value)}
          placeholder="描述你想要生成的图片类型，例如：&#10;• 公司介绍PPT，5页，科技风格&#10;• 4步骤使用教程图&#10;• 皮克斯风格故事场景（3个场景）..."
          disabled={isProcessing}
          className="focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      {/* Model & options - Tab style */}
      <div className="space-y-3">
        {/* Model selection */}
        <div className="space-y-1.5">
          <NodeLabel>模型</NodeLabel>
          <NodeTabSelect
            value={selectedModel}
            onChange={(val) => setSelectedModel(val as "nano-banana" | "nano-banana-pro")}
            options={[
              { value: "nano-banana", label: "快速" },
              { value: "nano-banana-pro", label: "高级" },
            ]}
            disabled={isProcessing}
            color="purple"
          />
        </div>

        {/* Resolution - Pro model only */}
        {selectedModel === "nano-banana-pro" && (
          <div className="space-y-1.5">
            <NodeLabel>分辨率</NodeLabel>
            <NodeTabSelect
              value={imageSize}
              onChange={setImageSize}
              options={Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => ({
                value: option.value,
                label: option.label,
              }))}
              disabled={isProcessing}
              color="purple"
              size="sm"
            />
          </div>
        )}

        {/* Aspect ratio - only when no reference images */}
        {!(connectedImages.length > 0 && useForImageGen) && (
          <div className="space-y-1.5">
            <NodeLabel>画面比例</NodeLabel>
            <NodeTabSelect
              value={aspectRatio}
              onChange={setAspectRatio}
              options={[
                { value: "16:9", label: "横屏" },
                { value: "9:16", label: "竖屏" },
                { value: "1:1", label: "方形" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
              ]}
              disabled={isProcessing}
              color="purple"
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Auto generate toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoGenerate}
          onChange={(e) => setAutoGenerate(e.target.checked)}
          disabled={isProcessing}
          className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
        />
        <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
          生成提示词后自动生成图片
        </span>
      </label>

      {/* Generate button */}
      <div className="flex gap-2">
        <NodeButton
          onClick={handleGenerate}
          disabled={!userRequest.trim() || isProcessing}
          className="flex-1 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-400 hover:to-violet-400 text-white"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              思考中 (迭代 {currentIteration})
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              智能生成
            </>
          )}
        </NodeButton>
        {isProcessing && (
          <NodeButton onClick={handleStop} className="bg-red-500 hover:bg-red-400 text-white px-3">
            <StopCircle className="w-4 h-4" />
          </NodeButton>
        )}
      </div>

      {/* Progress bar */}
      {(isProcessing || progress > 0) && progress < 100 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              {isProcessing ? "分析中..." : generatingCount > 0 ? `生成中 (${generatingCount})` : "准备中..."}
            </span>
            <span className="text-purple-600 font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Skill match badge */}
      {matchedSkill && (
        <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            匹配技能: <strong>{matchedSkill.name}</strong>
          </span>
          <span className="ml-auto text-[10px] text-emerald-600/70">
            {Math.round(matchedSkill.confidence * 100)}%
          </span>
        </div>
      )}

      {/* ReAct process */}
      {thoughtSteps.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Brain className="w-3 h-3" />
              思考过程 ({thoughtSteps.length} 步)
            </span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDetails && (
            <div ref={stepsContainerRef} className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {thoughtSteps.map((step) => (
                <div
                  key={step.iteration}
                  className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 rounded text-[10px]"
                >
                  <span className="w-4 h-4 flex items-center justify-center bg-purple-100 dark:bg-purple-900/50 rounded text-purple-600 dark:text-purple-300 font-medium">
                    {step.iteration}
                  </span>
                  {step.action && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-300">
                      {TOOL_ICONS[step.action]}
                      {TOOL_NAMES[step.action]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        </div>
      )}

      {/* Generated Prompts */}
      {prompts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <NodeLabel>场景 ({prompts.length})</NodeLabel>
            <button
              onClick={handleCopyAll}
              className="text-[10px] text-purple-600 hover:text-purple-500 flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              复制全部
            </button>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 transition-colors hover:border-purple-200 dark:hover:border-purple-900/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                    {prompt.scene}
                  </span>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {prompt.status === "pending" && !autoGenerate && (
                      <button
                        onClick={() => handleGenerateSingle(prompt)}
                        className="p-1 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
                        title="生成此图"
                      >
                        <Wand2 className="w-3 h-3 text-purple-500" />
                      </button>
                    )}
                    <span className="text-[10px] text-neutral-500">
                      {prompt.status === "pending" && "等待中"}
                      {prompt.status === "generating" && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          生成中
                        </span>
                      )}
                      {prompt.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      {prompt.status === "error" && <XCircle className="w-3 h-3 text-red-500" />}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-neutral-500 line-clamp-2 leading-relaxed">
                  {prompt.prompt}
                </div>
                {prompt.chineseTexts.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {prompt.chineseTexts.map((text, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded text-[9px] text-purple-700 dark:text-purple-300"
                      >
                        "{text}"
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </BaseNode>
  );
};

export default memo(SuperAgentNode);
