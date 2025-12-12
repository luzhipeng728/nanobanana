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
  XCircle,
  Copy,
  Brain,
  Link2,
  Eye,
  Palette,
  StopCircle,
  MessageSquare,
  Trash2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import type {
  SuperAgentStreamEvent,
  ThoughtStep,
  FinalOutput,
  PromptItem,
} from "@/types/super-agent";
import { BaseNode } from "./BaseNode";
import { useImageModels, getDefaultModelId } from "@/hooks/useImageModels";
import { NodeTextarea, NodeButton, NodeLabel, NodeTabSelect } from "@/components/ui/NodeUI";
import {
  StreamingThought,
  AnimatedProgress,
  StepTimeline,
  PromptCard,
  SkillBadge,
  ThinkingIndicator,
} from "@/components/ui/StreamingUI";

// Tool names mapping (for step timeline)
const TOOL_NAMES: Record<string, string> = {
  skill_matcher: "匹配技能",
  load_skill: "加载技能",
  generate_prompt: "生成提示词",
  web_search: "搜索资料",
  deep_research: "🔬 深度研究",  // 新的深度研究智能体
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

  // 获取可用模型列表
  const {
    models,
    isLoading: isLoadingModels,
    supportsReferenceImages,
    getSupportedResolutions,
    getSupportedAspectRatios,
  } = useImageModels();

  // States
  const [userRequest, setUserRequest] = useState(data.userRequest || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [streamingThought, setStreamingThought] = useState(""); // 实时流式思考内容
  const [matchedSkill, setMatchedSkill] = useState<{
    id: string;
    name: string;
    confidence: number;
  } | null>(null);
  const [prompts, setPrompts] = useState<PromptItemWithStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Reference images with marker data
  const [connectedImages, setConnectedImages] = useState<string[]>([]);
  const [connectedImagesWithMarkers, setConnectedImagesWithMarkers] = useState<{
    imageUrl: string;
    markedImageUrl?: string;
    marksCount: number;
  }[]>([]);
  const [useForAnalysis, setUseForAnalysis] = useState(true);
  const [useForImageGen, setUseForImageGen] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<string>("nano-banana-pro");
  const [imageSize, setImageSize] = useState<string>("2K");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [autoGenerate, setAutoGenerate] = useState(true);

  // 当模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (models.length > 0 && !data.model) {
      const defaultModel = getDefaultModelId(models);
      setSelectedModel(defaultModel);
    }
  }, [models, data.model]);

  // 检查当前模型是否支持参考图
  const currentModelSupportsRef = React.useMemo(() => {
    return supportsReferenceImages(selectedModel);
  }, [selectedModel, supportsReferenceImages]);

  // 模型选项
  const modelOptions = React.useMemo(() => {
    return models.map(m => ({
      value: m.id,
      label: m.label,
    }));
  }, [models]);

  // 当前模型支持的分辨率和比例
  const supportedResolutions = React.useMemo(() => {
    return getSupportedResolutions(selectedModel);
  }, [selectedModel, getSupportedResolutions]);

  const supportedAspectRatios = React.useMemo(() => {
    return getSupportedAspectRatios(selectedModel);
  }, [selectedModel, getSupportedAspectRatios]);

  // 分辨率选项
  const resolutionOptions = React.useMemo(() => {
    return supportedResolutions.map(r => ({
      value: r,
      label: r,
    }));
  }, [supportedResolutions]);

  // 比例选项
  const aspectRatioOptions = React.useMemo(() => {
    const labelMap: Record<string, string> = {
      '16:9': '横屏',
      '9:16': '竖屏',
      '1:1': '方形',
      '4:3': '4:3',
      '3:4': '3:4',
    };
    return supportedAspectRatios.map(r => ({
      value: r,
      label: labelMap[r] || r,
    }));
  }, [supportedAspectRatios]);

  // 当模型变更时，校验并重置分辨率和比例
  useEffect(() => {
    if (supportedResolutions.length > 0 && !supportedResolutions.includes(imageSize)) {
      setImageSize(supportedResolutions[0]);
    }
  }, [selectedModel, supportedResolutions, imageSize]);

  useEffect(() => {
    if (supportedAspectRatios.length > 0 && !supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(supportedAspectRatios[0]);
    }
  }, [selectedModel, supportedAspectRatios, aspectRatio]);

  // Deep research settings
  const [enableDeepResearch, setEnableDeepResearch] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('low');

  // Multi-turn conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTokens, setConversationTokens] = useState(0);
  const [hasCompressedHistory, setHasCompressedHistory] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>>([]);

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

  // Get connected images with marker data
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);

    // Extract image URLs for display
    const imageUrls = connectedNodes
      .map(node => node.data.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    setConnectedImages(imageUrls);

    // Extract images with marker data for generation
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

          // Build reference images array (include marked images if available)
          const referenceImagesForGen: string[] = [];
          if (useForImageGen) {
            connectedImagesWithMarkers.forEach(img => {
              referenceImagesForGen.push(img.imageUrl);
              // Include marked image if it has markers
              if (img.markedImageUrl && img.marksCount > 0) {
                referenceImagesForGen.push(img.markedImageUrl);
                console.log(`[SuperAgentNode] Including marked image with ${img.marksCount} markers`);
              }
            });
          }
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

          // 检查是否有带标记的图片
          const hasMarkers = connectedImagesWithMarkers.some(img => img.marksCount > 0);

          // 如果有标记，在 prompt 前面添加标记排除指令
          let finalPrompt = prompt.prompt;
          if (hasMarkers && useForImageGen) {
            const markerExclusionInstruction = `[CRITICAL INSTRUCTION - MUST FOLLOW]
The reference image contains RED CIRCLES with WHITE NUMBERS (①②③...) as position markers for reference only.
These markers are NOT part of the actual image content.
YOU MUST NOT include any of the following in the generated image:
- Red circles or dots
- Numbers or digits (1, 2, 3, ①, ②, ③, etc.)
- Any circular markers or annotations
- Any text overlays or labels
Generate a CLEAN image as if the markers do not exist.
[END OF CRITICAL INSTRUCTION]

`;
            finalPrompt = markerExclusionInstruction + prompt.prompt;
            console.log(`[SuperAgentNode] Added marker exclusion instruction to prompt`);
          }

          console.log(`[SuperAgentNode] Generating image ${index + 1}: scene="${prompt.scene}", prompt="${finalPrompt.substring(0, 80)}..."`);

          const response = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: finalPrompt,
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
  }, [id, getReactFlowNode, getReactFlowNodes, addImageNode, connectedImagesWithMarkers, useForImageGen, selectedModel, aspectRatio, imageSize]);

  // Handle stream event
  const handleStreamEvent = useCallback((event: SuperAgentStreamEvent) => {
    switch (event.type) {
      case "start":
        setProgress(10);
        setStreamingThought(""); // 清空流式内容
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

      // 实时流式思考 chunk
      case "thinking_chunk":
        setCurrentIteration(event.iteration);
        setStreamingThought((prev) => prev + event.chunk);
        break;

      case "thought":
        setCurrentIteration(event.iteration);
        setProgress(Math.min(80, 20 + event.iteration * 10));
        setStreamingThought(""); // 完整思考到达时清空流式内容
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
        setStreamingThought(""); // 工具调用时清空
        setThoughtSteps((prev) =>
          prev.map((s) =>
            s.iteration === event.iteration
              ? { ...s, action: event.tool, actionInput: event.input }
              : s
          )
        );
        break;

      // 工具输入生成流式事件（防止长内容生成超时）
      case "tool_input_chunk":
        const chunkEvent = event as any;
        const toolDisplayName = TOOL_NAMES[chunkEvent.tool] || chunkEvent.tool;
        const sizeKB = (chunkEvent.totalSize / 1024).toFixed(1);
        // 显示生成进度，让用户知道系统在工作
        setStreamingThought(`📝 ${toolDisplayName}... 已生成 ${sizeKB}KB`);
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

      // 深度研究事件
      case "research_start":
        setStreamingThought(`🔬 启动深度研究: ${(event as any).topic}`);
        break;

      case "research_progress":
        // 显示更详细的进度信息
        const status = (event as any).status || `第 ${event.round}/${event.maxRounds} 轮搜索中...`;
        setStreamingThought(`🔬 ${status}`);
        setProgress(Math.min(85, 30 + (event.round / event.maxRounds) * 50));
        break;

      case "research_evaluation":
        const evalEvent = event as any;
        setStreamingThought(
          `📊 评估中... 覆盖率: ${evalEvent.coverage?.toFixed(0) || 0}%` +
          (evalEvent.sufficient ? ' ✅ 信息充足' : ' ⏳ 继续搜索')
        );
        break;

      case "research_complete":
        setStreamingThought(`✅ 研究完成！收集了 ${event.coverage.toFixed(0)}% 信息，共 ${event.rounds} 轮`);
        setProgress(85);
        break;

      case "search_result":
        // 显示搜索结果
        setStreamingThought(`🔍 ${(event as any).summary}`);
        break;

      // 深度研究详细事件
      case "research_round_start":
        const roundStartEvent = event as any;
        setStreamingThought(`🔬 第 ${roundStartEvent.round}/${roundStartEvent.maxRounds} 轮开始，${roundStartEvent.queries?.length || 0} 个查询`);
        break;

      case "research_search_start":
        setStreamingThought(`🔍 搜索: ${(event as any).query}`);
        break;

      case "research_search_result":
        const searchResultEvent = event as any;
        setStreamingThought(`📄 "${searchResultEvent.query?.substring(0, 20)}..." 找到 ${searchResultEvent.resultsCount} 条结果`);
        break;

      case "research_dedup":
        const dedupEvent = event as any;
        setStreamingThought(`🧹 去重: ${dedupEvent.before} → ${dedupEvent.after} 条`);
        break;

      case "research_categorize_start":
        setStreamingThought(`🏷️ 分类 ${(event as any).totalResults} 条结果...`);
        break;

      case "research_categorize_batch":
        const batchEvent = event as any;
        setStreamingThought(`🏷️ 分类中 ${batchEvent.batch}/${batchEvent.total}...`);
        break;

      case "research_categorize_complete":
        setStreamingThought(`✅ 分类完成: ${(event as any).totalCategorized} 条`);
        break;

      case "research_evaluation_start":
        setStreamingThought(`📊 评估第 ${(event as any).round} 轮结果...`);
        break;

      case "research_evaluation_rule":
        setStreamingThought(`📏 规则评估: ${(event as any).ruleScore?.toFixed(0)}%`);
        break;

      case "research_evaluation_llm_start":
        setStreamingThought(`🤖 AI 评估中...`);
        break;

      case "research_evaluation_llm_complete":
        const llmCompleteEvent = event as any;
        setStreamingThought(`🤖 AI 评估: ${llmCompleteEvent.llmScore?.toFixed(0)}% | 缺失: ${llmCompleteEvent.missingInfo?.length || 0}`);
        break;

      case "research_plan_start":
        setStreamingThought(`📋 制定搜索计划: ${(event as any).strategy} 策略`);
        break;

      case "research_plan_complete":
        setStreamingThought(`📋 计划完成: ${(event as any).queriesCount} 个查询`);
        break;

      case "research_report_start":
        setStreamingThought(`📝 生成研究报告...`);
        break;

      case "research_report_summary_start":
        setStreamingThought(`✍️ 生成摘要中...`);
        break;

      case "research_report_summary_complete":
        setStreamingThought(`✅ 摘要生成完成`);
        break;

      case "research_report_complete":
        setStreamingThought(`📄 报告生成完成`);
        break;

      // LLM 流式输出
      case "research_summary_chunk":
        setStreamingThought((prev) => {
          const chunk = (event as any).chunk || '';
          // 只显示最后 100 个字符
          const newText = prev + chunk;
          return `✍️ ${newText.slice(-100)}`;
        });
        break;

      case "complete":
        setProgress(90);
        setStreamingThought("");
        // Convert result prompts to PromptItemWithStatus
        const promptsWithStatus: PromptItemWithStatus[] = (event.result.prompts || []).map((p: PromptItem) => ({
          ...p,
          status: "pending" as const,
        }));
        setPrompts(promptsWithStatus);
        break;

      case "error":
        setError(event.error);
        setStreamingThought("");
        break;

      // Handle conversation state updates
      case "conversation_state":
        const convEvent = event as any;
        if (convEvent.conversationId) {
          setConversationId(convEvent.conversationId);
        }
        if (typeof convEvent.totalTokens === 'number') {
          setConversationTokens(convEvent.totalTokens);
        }
        if (typeof convEvent.hasCompressedHistory === 'boolean') {
          setHasCompressedHistory(convEvent.hasCompressedHistory);
        }
        break;
    }
  }, []);

  // Start generation
  const handleGenerate = useCallback(async () => {
    if (!userRequest.trim() || isProcessing) return;

    // 保存用户请求到对话历史
    const userMessage = {
      role: 'user' as const,
      content: userRequest,
      timestamp: Date.now(),
    };
    setConversationHistory(prev => [...prev, userMessage]);

    setIsProcessing(true);
    setThoughtSteps([]);
    setPrompts([]);
    setError(null);
    setMatchedSkill(null);
    setCurrentIteration(0);
    setProgress(0);

    abortControllerRef.current = new AbortController();

    try {
      // Build reference images for analysis (include marked images if available)
      const referenceImages: string[] = [];
      if (useForAnalysis && connectedImagesWithMarkers.length > 0) {
        connectedImagesWithMarkers.forEach(img => {
          referenceImages.push(img.imageUrl);
          // Include marked image if it has markers
          if (img.markedImageUrl && img.marksCount > 0) {
            referenceImages.push(img.markedImageUrl);
            console.log(`[SuperAgentNode] Including marked image for analysis with ${img.marksCount} markers`);
          }
        });
      }

      const response = await fetch("/api/super-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRequest,
          referenceImages,
          enableDeepResearch,
          reasoningEffort: enableDeepResearch ? reasoningEffort : undefined,  // 深度研究强度
          conversationId: conversationId || undefined,  // 传递对话 ID
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

      // 保存助手回复到对话历史
      if (finalPrompts.length > 0) {
        const assistantMessage = {
          role: 'assistant' as const,
          content: `生成了 ${finalPrompts.length} 个场景提示词`,
          timestamp: Date.now(),
        };
        setConversationHistory(prev => [...prev, assistantMessage]);
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
  }, [userRequest, connectedImagesWithMarkers, useForAnalysis, isProcessing, handleStreamEvent, autoGenerate, generateImagesInBatches, enableDeepResearch, reasoningEffort, conversationId]);

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

  // Clear conversation and start new
  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setConversationTokens(0);
    setHasCompressedHistory(false);
    setConversationHistory([]);
    setThoughtSteps([]);
    setPrompts([]);
    setError(null);
    setMatchedSkill(null);
    setProgress(0);
    setUserRequest("");
  }, []);

  return (
    <BaseNode
      title="Prompt Expert"
      icon={Sparkles}
      color="purple"
      selected={selected}
      className="w-[380px]"
      headerActions={
        <div className="flex items-center gap-1.5">
          {/* 多轮对话状态指示 */}
          {conversationId && (
            <span
              className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              title={`对话中 · 第 ${Math.ceil(conversationHistory.length / 2)} 轮 · ${(conversationTokens / 1000).toFixed(1)}K tokens${hasCompressedHistory ? ' · 已压缩' : ''}`}
            >
              <MessageSquare className="w-3 h-3" />
              第{Math.ceil(conversationHistory.length / 2)}轮
            </span>
          )}
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
          {isLoadingModels ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              加载模型列表...
            </div>
          ) : modelOptions.length > 0 ? (
            <NodeTabSelect
              value={selectedModel}
              onChange={setSelectedModel}
              options={modelOptions}
              disabled={isProcessing}
              color="purple"
            />
          ) : (
            <div className="text-xs text-red-500">无可用模型</div>
          )}
        </div>

        {/* 参考图警告 - 当选中的模型不支持参考图但连接了参考图时显示 */}
        {connectedImages.length > 0 && useForImageGen && !currentModelSupportsRef && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
              当前模型不支持参考图功能，参考图将仅用于 AI 分析
            </p>
          </div>
        )}

        {/* Resolution - 根据模型能力显示 */}
        {resolutionOptions.length > 0 && (
          <div className="space-y-1.5">
            <NodeLabel>分辨率</NodeLabel>
            <NodeTabSelect
              value={imageSize}
              onChange={setImageSize}
              options={resolutionOptions}
              disabled={isProcessing}
              color="purple"
              size="sm"
            />
          </div>
        )}

        {/* Aspect ratio - only when no reference images */}
        {!(connectedImages.length > 0 && useForImageGen) && aspectRatioOptions.length > 0 && (
          <div className="space-y-1.5">
            <NodeLabel>画面比例</NodeLabel>
            <NodeTabSelect
              value={aspectRatio}
              onChange={setAspectRatio}
              options={aspectRatioOptions}
              disabled={isProcessing}
              color="purple"
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Options toggles */}
      <div className="space-y-2">
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
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={enableDeepResearch}
              onChange={(e) => setEnableDeepResearch(e.target.checked)}
              disabled={isProcessing}
              className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
              <Search className="w-3 h-3 text-purple-500" />
              启用深度研究
            </span>
          </label>
          {enableDeepResearch && (
            <div className="ml-6 flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">强度:</span>
              {[
                { value: 'low', label: '快速', time: '1-3分钟', color: 'green' },
                { value: 'medium', label: '标准', time: '3-7分钟', color: 'amber' },
                { value: 'high', label: '深度', time: '7-15分钟', color: 'red' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setReasoningEffort(option.value as 'low' | 'medium' | 'high')}
                  disabled={isProcessing}
                  className={`px-2 py-0.5 rounded text-[10px] transition-all ${
                    reasoningEffort === option.value
                      ? option.color === 'green'
                        ? 'bg-green-500 text-white'
                        : option.color === 'amber'
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
                  }`}
                  title={option.time}
                >
                  {option.label}
                </button>
              ))}
              <span className="text-[9px] text-neutral-400 dark:text-neutral-500 ml-1">
                ~{reasoningEffort === 'low' ? '1-3' : reasoningEffort === 'medium' ? '3-7' : '7-15'}分钟
              </span>
            </div>
          )}
        </div>
      </div>

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
          ) : conversationId ? (
            <>
              <MessageSquare className="w-4 h-4" />
              继续对话
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              智能生成
            </>
          )}
        </NodeButton>
        {conversationId && !isProcessing && (
          <NodeButton
            onClick={handleNewConversation}
            className="bg-neutral-500 hover:bg-neutral-400 text-white px-3"
            title="开始新对话"
          >
            <RotateCcw className="w-4 h-4" />
          </NodeButton>
        )}
        {isProcessing && (
          <NodeButton onClick={handleStop} className="bg-red-500 hover:bg-red-400 text-white px-3">
            <StopCircle className="w-4 h-4" />
          </NodeButton>
        )}
      </div>

      {/* Conversation history - 对话历史显示 */}
      {conversationId && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>多轮对话</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold">
                第 {Math.ceil(conversationHistory.length / 2)} 轮
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {(conversationTokens / 1000).toFixed(1)}K tokens
              </span>
              {hasCompressedHistory && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300">
                  已压缩
                </span>
              )}
            </div>
            {/* 清空会话按钮 */}
            <button
              onClick={handleNewConversation}
              disabled={isProcessing}
              className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="清空会话，开始新对话"
            >
              <Trash2 className="w-3 h-3" />
              清空
            </button>
          </div>
          {conversationHistory.length > 0 && (
            <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
              {conversationHistory.slice(-4).map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-[11px] px-2 py-1.5 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <span className="font-medium">{msg.role === 'user' ? '你：' : 'AI：'}</span>
                  {msg.content.length > 60 ? msg.content.substring(0, 60) + '...' : msg.content}
                </div>
              ))}
              {conversationHistory.length > 4 && (
                <div className="text-[10px] text-center text-blue-500 dark:text-blue-400">
                  ... 还有 {conversationHistory.length - 4} 条更早的消息
                </div>
              )}
            </div>
          )}
          {conversationHistory.length === 0 && (
            <div className="text-[11px] text-center text-blue-400 dark:text-blue-500 py-1">
              对话已建立，输入问题继续交流
            </div>
          )}
        </div>
      )}

      {/* Progress bar - 使用新的动画进度条 */}
      {(isProcessing || progress > 0) && progress < 100 && (
        <AnimatedProgress
          progress={progress}
          status={isProcessing ? "探索中..." : generatingCount > 0 ? `生成中 (${generatingCount})` : "准备中..."}
          variant="gradient"
          color="purple"
        />
      )}

      {/* 实时思考流 - 使用新的流式展示组件 */}
      {isProcessing && streamingThought && (
        <StreamingThought
          content={streamingThought}
          iteration={currentIteration}
          isStreaming={true}
          toolName={thoughtSteps.length > 0 ? thoughtSteps[thoughtSteps.length - 1]?.action : undefined}
          className="animate-fade-in"
        />
      )}

      {/* Skill match badge - 使用新的技能徽章 */}
      {matchedSkill && (
        <SkillBadge
          name={matchedSkill.name}
          confidence={matchedSkill.confidence}
          className="animate-scale-in"
        />
      )}

      {/* ReAct process - 使用新的步骤时间线 */}
      {thoughtSteps.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800/50 dark:to-neutral-800 rounded-xl text-xs text-neutral-600 dark:text-neutral-300 hover:from-neutral-100 hover:to-neutral-150 dark:hover:from-neutral-800 dark:hover:to-neutral-700 transition-all border border-neutral-200/50 dark:border-neutral-700/50"
          >
            <span className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-purple-500" />
              <span className="font-medium">思考过程</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">
                {thoughtSteps.length} 步
              </span>
            </span>
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDetails && (
            <div ref={stepsContainerRef} className="max-h-40 overflow-y-auto pr-1 animate-fade-in">
              <StepTimeline
                steps={thoughtSteps.map((step) => ({
                  id: step.iteration,
                  title: step.action ? TOOL_NAMES[step.action] || step.action : `迭代 ${step.iteration}`,
                  description: step.thought?.substring(0, 50),
                  status: step.observation ? "completed" : isProcessing && step.iteration === currentIteration ? "active" : "pending",
                }))}
                variant="vertical"
                color="purple"
                compact
              />
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

      {/* Generated Prompts - 使用新的 PromptCard 组件 */}
      {prompts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NodeLabel className="mb-0">场景</NodeLabel>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 font-bold">
                {prompts.length}
              </span>
            </div>
            <button
              onClick={handleCopyAll}
              className="text-[10px] text-purple-600 hover:text-purple-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
            >
              <Copy className="w-3 h-3" />
              复制全部
            </button>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800">
            {prompts.map((prompt, index) => (
              <PromptCard
                key={prompt.id}
                scene={prompt.scene}
                prompt={prompt.prompt}
                chineseTexts={prompt.chineseTexts}
                status={prompt.status}
                error={prompt.error}
                onGenerate={!autoGenerate && prompt.status === "pending" ? () => handleGenerateSingle(prompt) : undefined}
                className={index === 0 ? "animate-fade-in" : ""}
              />
            ))}
          </div>
        </div>
      )}
    </BaseNode>
  );
};

export default memo(SuperAgentNode);
