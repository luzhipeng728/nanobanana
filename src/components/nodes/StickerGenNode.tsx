"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import {
  Loader2,
  Sparkles,
  Link2,
  Play,
  Eye,
} from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeSelect, NodeButton, NodeLabel } from "@/components/ui/NodeUI";
import ReactMarkdown from "react-markdown";
import { RESOLUTION_OPTIONS, type GeminiImageModel } from "@/types/image-gen";

// 预设动画示例（仅作为参考提示）
const ANIMATION_PRESETS = [
  { label: "😊 开心", value: "开心地微笑，眼睛弯成月牙" },
  { label: "😢 悲伤", value: "悲伤地低下头，流下眼泪" },
  { label: "😮 惊讶", value: "惊讶地睁大眼睛，张开嘴巴" },
  { label: "😠 生气", value: "生气地皱眉，脸颊鼓起" },
  { label: "👋 挥手", value: "开心地挥手打招呼" },
  { label: "💤 困倦", value: "困倦地眨眼，打哈欠" },
  { label: "🎉 庆祝", value: "兴奋地跳跃庆祝" },
  { label: "❤️ 心动", value: "害羞地脸红，眼睛闪烁爱心" },
];

const StickerGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addStickerNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();

  const [animationPrompt, setAnimationPrompt] = useState(data.animationPrompt || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana");
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [claudeAnalysis, setClaudeAnalysis] = useState("");
  const [connectedImages, setConnectedImages] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState("");
  const [generatedFramePrompts, setGeneratedFramePrompts] = useState<string[]>([]);

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

  const onGenerate = useCallback(async () => {
    if (connectedImages.length === 0) {
      setError("请先连接一张参考图片");
      return;
    }

    if (!animationPrompt.trim()) {
      setError("请输入动画描述");
      return;
    }

    setIsGenerating(true);
    setError("");
    setProgress(0);
    setClaudeAnalysis("");
    setIsAnalyzing(false);
    setGeneratedFramePrompts([]);

    abortControllerRef.current = new AbortController();

    try {
      const config: any = {};
      if (selectedModel === "nano-banana-pro") {
        config.imageSize = imageSize;
      }

      const response = await fetch("/api/sticker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceImage: connectedImages[0],
          animationPrompt,
          model: selectedModel,
          config,
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
              const event = JSON.parse(eventData);

              if (event.type === "status") {
                setCurrentStep(event.step || "");
                setProgress(event.progress || 0);
              } else if (event.type === "claude_analysis_start") {
                setIsAnalyzing(true);
                setClaudeAnalysis("");
              } else if (event.type === "claude_analysis_chunk") {
                if (event.chunk) {
                  setClaudeAnalysis(prev => prev + event.chunk);
                  if (analysisRef.current) {
                    analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
                  }
                }
              } else if (event.type === "claude_analysis_end") {
                setIsAnalyzing(false);
              } else if (event.type === "frame_prompts") {
                // 显示生成的帧提示词
                if (event.prompts) {
                  setGeneratedFramePrompts(event.prompts);
                }
              } else if (event.type === "sticker_created") {
                // 创建表情包展示节点
                const currentNode = getNode(id);
                if (currentNode && event.taskId) {
                  addStickerNode(
                    event.taskId,
                    animationPrompt,
                    { x: currentNode.position.x + 400, y: currentNode.position.y }
                  );
                }
              } else if (event.type === "error") {
                setError(event.error || "生成失败");
              } else if (event.type === "complete") {
                setProgress(100);
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
        setError(err instanceof Error ? err.message : "生成失败");
      }
    } finally {
      setIsGenerating(false);
    }
  }, [connectedImages, animationPrompt, selectedModel, imageSize, id, getNode, addStickerNode]);

  const onStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setCurrentStep("");
    }
  };

  return (
    <BaseNode
      title="表情包生成器"
      icon={Sparkles}
      color="pink"
      selected={selected}
      className="w-[340px]"
      headerActions={
        <div className="flex items-center gap-1.5">
          {connectedImages.length > 0 ? (
            <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 font-medium">
              <Link2 className="w-3 h-3" />
              参考图已连接
            </span>
          ) : (
            <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
              ← 请连接参考图
            </span>
          )}
        </div>
      }
    >
      {/* 左侧输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-pink-500 !to-purple-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-pink-500/50"
        title="连接参考图片"
      />

      {/* 参考图预览 */}
      {connectedImages.length > 0 && (
        <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl p-3">
          <div className="flex items-center gap-3">
            <img
              src={connectedImages[0]}
              alt="参考图"
              className="w-16 h-16 rounded-lg object-cover border-2 border-pink-200 dark:border-pink-700"
            />
            <div className="flex-1">
              <div className="text-[11px] font-medium text-pink-700 dark:text-pink-300 mb-1">
                参考图片
              </div>
              <div className="text-[10px] text-pink-600/70 dark:text-pink-400/70">
                Claude 将分析此图片并生成 10 帧连续动画
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 动画描述输入 */}
      <div className="space-y-2">
        <NodeLabel>动画描述</NodeLabel>
        <NodeTextarea
          rows={2}
          value={animationPrompt}
          onChange={(e) => setAnimationPrompt(e.target.value)}
          placeholder="描述你想要的动画效果，如：开心地微笑、悲伤地流泪、兴奋地跳动..."
          disabled={isGenerating}
          className="focus:ring-pink-500/20 focus:border-pink-500 text-[11px]"
        />
        
        {/* 快捷预设 */}
        <div className="flex flex-wrap gap-1.5">
          {ANIMATION_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setAnimationPrompt(preset.value)}
              disabled={isGenerating}
              className="text-[10px] px-2 py-1 rounded-full border border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-900/30 hover:border-pink-400 transition-all disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 模型与分辨率选择 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <NodeLabel>Model</NodeLabel>
          <NodeSelect
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as GeminiImageModel)}
            disabled={isGenerating}
          >
            <option value="nano-banana">Fast</option>
            <option value="nano-banana-pro">Pro</option>
          </NodeSelect>
        </div>

        {selectedModel === "nano-banana-pro" && (
          <div className="space-y-1">
            <NodeLabel>Resolution</NodeLabel>
            <NodeSelect
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={isGenerating}
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

      {/* 进度显示 */}
      {isGenerating && (
        <div className="space-y-2 bg-pink-50 dark:bg-pink-900/20 p-3 rounded-xl border border-pink-200 dark:border-pink-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-pink-700 dark:text-pink-300 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {currentStep}
            </span>
            <span className="text-pink-600 dark:text-pink-400 font-bold">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-pink-200 dark:bg-pink-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Claude 分析展示 */}
      {(isAnalyzing || claudeAnalysis) && (
        <div className="relative overflow-hidden rounded-xl border border-pink-200 dark:border-pink-800 bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 dark:from-pink-950/30 dark:via-purple-950/20 dark:to-blue-950/30">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 opacity-60" />
          
          <div className="relative px-3 py-2 border-b border-pink-100 dark:border-pink-900/50 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
            <span className="text-[10px] font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
              Claude 图片分析
            </span>
            {isAnalyzing && (
              <div className="ml-auto flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
          
          <div 
            ref={analysisRef}
            className="relative p-3 max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-pink-200 dark:scrollbar-thumb-pink-800"
          >
            <div className="text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300 prose prose-xs prose-pink dark:prose-invert max-w-none">
              <ReactMarkdown>{claudeAnalysis}</ReactMarkdown>
              {isAnalyzing && (
                <span className="inline-block w-2 h-3 bg-pink-500 ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 生成的帧提示词预览 */}
      {generatedFramePrompts.length > 0 && (
        <div className="space-y-1.5">
          <NodeLabel>生成的 10 帧描述</NodeLabel>
          <div className="max-h-[100px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-pink-200 dark:scrollbar-thumb-pink-800">
            {generatedFramePrompts.map((prompt, i) => (
              <div
                key={i}
                className="text-[9px] px-2 py-1 bg-pink-50 dark:bg-pink-900/20 rounded border border-pink-100 dark:border-pink-800 text-neutral-600 dark:text-neutral-400"
              >
                <span className="font-bold text-pink-600 dark:text-pink-400">帧{i + 1}:</span> {prompt.substring(0, 60)}...
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 生成按钮 */}
      <div className="pt-2">
        {!isGenerating ? (
          <NodeButton
            onClick={onGenerate}
            disabled={connectedImages.length === 0}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            <Play className="w-3.5 h-3.5" />
            生成表情包
          </NodeButton>
        ) : (
          <NodeButton
            onClick={onStop}
            variant="danger"
            className="w-full"
          >
            停止生成
          </NodeButton>
        )}
      </div>
    </BaseNode>
  );
};

export default memo(StickerGenNode);

