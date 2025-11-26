"use client";

import { memo, useEffect, useState, useRef } from "react";
import { NodeProps, useReactFlow, Handle, Position, useEdges } from "@xyflow/react";
import {
  Sparkles, Loader2, Play, Pause, Download,
  Copy, Zap, ArrowRight, ArrowDown,
  Settings2, Scan, X, Maximize2, LayoutTemplate, User, RefreshCw
} from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeButton, NodeLabel } from "@/components/ui/NodeUI";
import { useCanvas } from "@/contexts/CanvasContext";
import type {
  SpriteConfig, ImageDimensions, GenerationMode, ImageResolution,
  GenerationConfig, SpriteStreamEvent
} from "@/types/sprite";
import { DEFAULT_SPRITE_CONFIG, DEFAULT_GENERATION_CONFIG } from "@/types/sprite";
import { generateGif } from "@/utils/gifBuilder";

/**
 * SpriteNode - Sprite 动画节点
 *
 * 使用连线方式接收图片输入：
 * - Replica 模式：需要两个连接（模板 + 角色）
 * - Creative 模式：需要一个连接（角色）
 *
 * 连接点 ID:
 * - template: 模板 Sprite Sheet 输入（Replica 模式）
 * - character: 角色图片输入（两种模式都需要）
 */
const SpriteNode = ({ data, id, selected }: NodeProps<any>) => {
  const { updateNodeData, getNodes } = useReactFlow();
  const { openImageModal } = useCanvas();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement | null>(null); // 用于 GIF 导出

  // Sprite 配置
  const [config, setConfig] = useState<SpriteConfig>(
    data.spriteConfig || DEFAULT_SPRITE_CONFIG
  );

  // 生成配置
  const [genConfig, setGenConfig] = useState<GenerationConfig>(
    data.generationConfig || DEFAULT_GENERATION_CONFIG
  );

  // 图片状态
  const [spriteSheetUrl, setSpriteSheetUrl] = useState<string | null>(
    data.spriteSheetUrl || null
  );
  const [dimensions, setDimensions] = useState<ImageDimensions>(
    data.dimensions || { width: 0, height: 0 }
  );

  // 连接的图片
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [characterImage, setCharacterImage] = useState<string | null>(null);

  // UI 状态
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 帧图片 URL 数组（从 R2 获取）
  const [frames, setFrames] = useState<string[]>(data.frameUrls || []);

  // 空白帧信息（由 Claude 分析得到）
  const [hasBlankFrames, setHasBlankFrames] = useState(false);
  const [blankFrameCount, setBlankFrameCount] = useState(0);

  // 流式处理状态
  const [processingStep, setProcessingStep] = useState<string>("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [claudeAnalysis, setClaudeAnalysis] = useState<string>("");
  const [isClaudeAnalyzing, setIsClaudeAnalyzing] = useState(false);
  const [frameSplitProgress, setFrameSplitProgress] = useState<{ current: number; total: number } | null>(null);

  // 监听连接变化，获取连接的图片
  useEffect(() => {
    const nodes = getNodes();

    // 找到连接到本节点的边
    const connectedEdges = edges.filter(e => e.target === id);

    let newTemplateImage: string | null = null;
    let newCharacterImage: string | null = null;

    connectedEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode || sourceNode.type !== 'image') return;

      const imageUrl = (sourceNode.data as any)?.imageUrl;
      if (!imageUrl) return;

      // 根据 targetHandle 确定是模板还是角色
      if (edge.targetHandle === 'template') {
        newTemplateImage = imageUrl;
      } else if (edge.targetHandle === 'character') {
        newCharacterImage = imageUrl;
      }
    });

    setTemplateImage(newTemplateImage);
    setCharacterImage(newCharacterImage);

    // 同步到 genConfig
    setGenConfig(prev => ({
      ...prev,
      templateImage: newTemplateImage,
      characterImage: newCharacterImage,
    }));
  }, [edges, id, getNodes]);

  // 更新配置
  const updateConfig = (key: keyof SpriteConfig, value: any) => {
    setConfig(prev => {
      const next = { ...prev, [key]: value };
      // 如果改变行列数，自动更新总帧数
      if (key === 'rows' || key === 'cols') {
        if (prev.totalFrames === prev.rows * prev.cols) {
          next.totalFrames = next.rows * next.cols;
        }
      }
      return next;
    });
  };

  // 同步到节点数据
  useEffect(() => {
    updateNodeData(id, {
      spriteConfig: config,
      generationConfig: genConfig,
      spriteSheetUrl,
      frameUrls: frames,
      dimensions,
    });
  }, [config, genConfig, spriteSheetUrl, frames, dimensions]);

  // 加载模板到画布
  const loadTemplateToCanvas = () => {
    if (templateImage) {
      setSpriteSheetUrl(templateImage);
      setConfig(DEFAULT_SPRITE_CONFIG);
    }
  };

  // AI 分析 Sprite Sheet
  const handleAutoDetect = async () => {
    if (!spriteSheetUrl) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/sprite/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: spriteSheetUrl }),
      });

      const result = await response.json();

      if (result.success) {
        setConfig(prev => ({
          ...prev,
          rows: result.rows ?? prev.rows,
          cols: result.cols ?? prev.cols,
          totalFrames: result.totalFrames ?? (result.rows * result.cols),
        }));
      } else {
        setError(result.error || "分析失败");
      }
    } catch (err) {
      setError("AI 分析失败，请手动设置");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 生成 Sprite Sheet（使用流式 API）
  const handleGenerate = async () => {
    if (genConfig.mode === 'replica') {
      if (!templateImage || !characterImage) {
        setError("Replica 模式需要连接模板和角色图片");
        return;
      }
    } else {
      if (!characterImage || !genConfig.actionPrompt) {
        setError("Creative 模式需要连接角色图片并填写动作描述");
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setProcessingStep("");
    setProcessingProgress(0);
    setClaudeAnalysis("");
    setIsClaudeAnalyzing(false);
    setFrameSplitProgress(null);
    setHasBlankFrames(false);
    setBlankFrameCount(0);

    try {
      const response = await fetch("/api/sprite/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: genConfig.mode,
          templateImage: templateImage || undefined,
          characterImage: characterImage!,
          prompt: genConfig.prompt || undefined,
          actionPrompt: genConfig.actionPrompt || undefined,
          size: genConfig.size,
        }),
      });

      if (!response.ok) {
        throw new Error("请求失败");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 保留未完整的行

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: SpriteStreamEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case "status":
                  setProcessingStep(event.step);
                  setProcessingProgress(event.progress);
                  break;

                case "sprite_generated":
                  setSpriteSheetUrl(event.spriteSheetUrl);
                  break;

                case "claude_analysis_start":
                  setIsClaudeAnalyzing(true);
                  setClaudeAnalysis("");
                  break;

                case "claude_analysis_chunk":
                  setClaudeAnalysis(prev => prev + event.chunk);
                  break;

                case "claude_analysis_end":
                  setIsClaudeAnalyzing(false);
                  break;

                case "frame_split_progress":
                  setFrameSplitProgress({
                    current: event.current,
                    total: event.total,
                  });
                  break;

                case "complete":
                  setFrames(event.frameUrls);
                  setCurrentFrame(0);
                  setConfig(prev => ({
                    ...prev,
                    rows: event.spriteConfig.rows,
                    cols: event.spriteConfig.cols,
                    totalFrames: event.spriteConfig.totalFrames,
                    direction: event.spriteConfig.direction,
                  }));
                  // 检查空白帧
                  const blankFrames = event.spriteConfig.blankFrames || [];
                  if (blankFrames.length > 0) {
                    setHasBlankFrames(true);
                    setBlankFrameCount(blankFrames.length);
                  }
                  setIsGenerating(false);
                  setProcessingStep("");
                  break;

                case "error":
                  setError(event.error);
                  setIsGenerating(false);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("[SpriteNode] Generate error:", err);
      setError(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
    }
  };

  // 导出进度
  const [exportProgress, setExportProgress] = useState(0);

  // 导出 GIF（前端生成）
  const handleExportGif = async () => {
    if (!spriteSheetUrl || !imgRef.current) return;

    setIsExporting(true);
    setExportProgress(0);
    setError(null);

    try {
      const blob = await generateGif(
        imgRef.current,
        config,
        dimensions,
        (pct) => setExportProgress(pct)
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sprite_${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("GIF export error:", err);
      setError("GIF 导出失败");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // 加载图片尺寸（仅用于 GIF 导出）
  useEffect(() => {
    if (!spriteSheetUrl) {
      setDimensions({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      setDimensions({ width: img.width, height: img.height });
      imgRef.current = img; // 用于 GIF 导出
    };
    img.src = spriteSheetUrl;
  }, [spriteSheetUrl]);

  // 动画播放 - 简单切换帧（使用 R2 URL 列表）
  useEffect(() => {
    if (frames.length === 0 || !isPlaying) return;

    const frameInterval = 1000 / config.fps;

    const timer = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, frameInterval);

    return () => clearInterval(timer);
  }, [frames.length, config.fps, isPlaying]);

  // 渲染网格叠加
  const renderGridOverlay = () => {
    if (!spriteSheetUrl || config.cols <= 0 || config.rows <= 0) return null;

    return (
      <div
        className="absolute inset-0 pointer-events-none border border-blue-500/30 z-10"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
          gridTemplateRows: `repeat(${config.rows}, 1fr)`,
        }}
      >
        {Array.from({ length: config.rows * config.cols }).map((_, i) => {
          const visualRow = Math.floor(i / config.cols);
          const visualCol = i % config.cols;

          let sequenceIndex;
          if (config.direction === 'column') {
            sequenceIndex = visualCol * config.rows + visualRow;
          } else {
            sequenceIndex = visualRow * config.cols + visualCol;
          }

          const isActive = sequenceIndex < config.totalFrames;
          return (
            <div
              key={i}
              className={`border-r border-b border-blue-400/20 ${
                !isActive ? 'bg-black/60' : 'hover:bg-blue-500/10'
              }`}
            />
          );
        })}
      </div>
    );
  };

  // 渲染连接状态指示
  const renderConnectionStatus = (
    type: 'template' | 'character',
    imageUrl: string | null,
    label: string
  ) => {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg border ${
        imageUrl
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 border-dashed'
      }`}>
        <div className={`w-6 h-6 rounded flex items-center justify-center ${
          imageUrl ? 'bg-green-500/20' : 'bg-neutral-200 dark:bg-neutral-700'
        }`}>
          {type === 'template' ? (
            <LayoutTemplate className={`w-3.5 h-3.5 ${imageUrl ? 'text-green-500' : 'text-neutral-400'}`} />
          ) : (
            <User className={`w-3.5 h-3.5 ${imageUrl ? 'text-green-500' : 'text-neutral-400'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium ${
            imageUrl ? 'text-green-600 dark:text-green-400' : 'text-neutral-500'
          }`}>
            {label}
          </span>
          <span className="text-[10px] text-neutral-400 block">
            {imageUrl ? '已连接' : '← 连接图片节点'}
          </span>
        </div>
        {imageUrl && (
          <img
            src={imageUrl}
            alt={label}
            className="w-8 h-8 rounded object-cover border border-green-500/30"
          />
        )}
      </div>
    );
  };

  return (
    <BaseNode
      title="Sprite 动画"
      icon={Sparkles}
      color="purple"
      selected={selected}
      className="w-[360px]"
      headerActions={
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 rounded hover:bg-white/10"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      }
    >
      {/* 输入连接点 */}
      {genConfig.mode === 'replica' && (
        <Handle
          type="target"
          position={Position.Left}
          id="template"
          style={{
            top: '120px',
            background: templateImage ? '#22c55e' : '#a855f7',
            border: '2px solid white',
            width: '12px',
            height: '12px',
          }}
          title="连接模板 Sprite Sheet"
        />
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="character"
        style={{
          top: genConfig.mode === 'replica' ? '180px' : '120px',
          background: characterImage ? '#22c55e' : '#ec4899',
          border: '2px solid white',
          width: '12px',
          height: '12px',
        }}
        title="连接角色图片"
      />

      {/* 模式切换 */}
      <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
        <button
          onClick={() => setGenConfig(prev => ({ ...prev, mode: 'replica' }))}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1 transition-all ${
            genConfig.mode === 'replica'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          <Copy className="w-3 h-3" /> 复制动作
        </button>
        <button
          onClick={() => setGenConfig(prev => ({ ...prev, mode: 'creative' }))}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1 transition-all ${
            genConfig.mode === 'creative'
              ? 'bg-violet-500 text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          <Zap className="w-3 h-3" /> 创意生成
        </button>
      </div>

      {/* 连接状态显示 */}
      <div className="space-y-2">
        {genConfig.mode === 'replica' && (
          renderConnectionStatus('template', templateImage, '模板精灵图')
        )}
        {renderConnectionStatus('character', characterImage, '角色图片')}

        {/* 模式说明 */}
        <div className="text-[10px] text-neutral-400 px-1">
          {genConfig.mode === 'replica'
            ? '复制模板动作到新角色'
            : '为角色生成新动作'}
        </div>
      </div>

      {/* Creative 模式：动作描述 */}
      {genConfig.mode === 'creative' && (
        <div className="space-y-1">
          <NodeLabel>动作描述</NodeLabel>
          <textarea
            value={genConfig.actionPrompt}
            onChange={(e) => setGenConfig(prev => ({ ...prev, actionPrompt: e.target.value }))}
            placeholder="描述要生成的动作，如：跑步、跳跃、挥手..."
            className="w-full h-16 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      )}

      {/* 风格提示词 */}
      <div className="space-y-2">
        <input
          type="text"
          value={genConfig.prompt}
          onChange={(e) => setGenConfig(prev => ({ ...prev, prompt: e.target.value }))}
          placeholder="风格提示词（可选）..."
          className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
        />

        <NodeButton
          onClick={handleGenerate}
          disabled={isGenerating || (genConfig.mode === 'replica' ? (!templateImage || !characterImage) : (!characterImage || !genConfig.actionPrompt))}
          className="w-full bg-gradient-to-r from-violet-500 to-pink-500 text-white"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGenerating
            ? (processingStep || '处理中...')
            : (genConfig.mode === 'replica' ? '复制动作' : '创意生成')}
        </NodeButton>

        {/* Replica 模式下，如果有模板图片，可以直接加载到画布 */}
        {genConfig.mode === 'replica' && templateImage && (
          <button
            onClick={loadTemplateToCanvas}
            className="w-full text-[10px] text-violet-500 hover:text-violet-600 flex items-center justify-center gap-1 py-1"
          >
            <Play className="w-3 h-3" /> 加载模板到预览
          </button>
        )}
      </div>

      {/* 分隔线 */}
      <div className="h-px bg-neutral-200 dark:bg-neutral-700" />

      {/* Sprite Sheet 预览 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <NodeLabel>精灵图预览</NodeLabel>
          {spriteSheetUrl && (
            <button
              onClick={() => setSpriteSheetUrl(null)}
              className="text-[10px] text-red-500 hover:text-red-600"
            >
              清除
            </button>
          )}
        </div>

        <div
          className="relative bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden"
          style={{ minHeight: spriteSheetUrl ? 'auto' : '80px' }}
        >
          {spriteSheetUrl ? (
            <>
              <img
                src={spriteSheetUrl}
                alt="Sprite Sheet"
                className="w-full h-auto"
                style={{ imageRendering: 'pixelated', maxHeight: '200px', objectFit: 'contain' }}
                onClick={() => openImageModal(spriteSheetUrl, "精灵图")}
              />
              {renderGridOverlay()}
              <button
                onClick={() => openImageModal(spriteSheetUrl, "精灵图")}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded hover:bg-black/70"
              >
                <Maximize2 className="w-3 h-3 text-white" />
              </button>
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full py-4 text-neutral-400">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-pink-500 animate-pulse" />
              </div>
              <span className="text-xs mt-2 text-violet-500 font-medium">
                {processingStep || '处理中...'}
              </span>
              {/* 进度条 */}
              <div className="w-full max-w-[200px] mt-2 px-4">
                <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-neutral-500 mt-1 block text-center">
                  {processingProgress}%
                </span>
              </div>
              {/* 帧切割进度 */}
              {frameSplitProgress && (
                <span className="text-[10px] text-cyan-500 mt-1">
                  帧切割: {frameSplitProgress.current}/{frameSplitProgress.total}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-4 text-neutral-400">
              <LayoutTemplate className="w-6 h-6 mb-1 opacity-50" />
              <span className="text-[10px]">等待生成或加载精灵图</span>
            </div>
          )}
        </div>
      </div>

      {/* Claude 分析内容显示 */}
      {(isClaudeAnalyzing || claudeAnalysis) && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <NodeLabel>
              {isClaudeAnalyzing ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                  Claude 分析中...
                </span>
              ) : (
                'Claude 分析结果'
              )}
            </NodeLabel>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 max-h-[150px] overflow-y-auto">
            <pre className="text-[10px] text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed">
              {claudeAnalysis || '等待分析...'}
              {isClaudeAnalyzing && (
                <span className="inline-block w-1.5 h-3 bg-cyan-500 animate-pulse ml-0.5" />
              )}
            </pre>
          </div>
        </div>
      )}

      {/* 配置面板 */}
      {showSettings && spriteSheetUrl && (
        <div className="space-y-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-neutral-500 block mb-1">行数</span>
              <input
                type="number"
                value={config.rows}
                onChange={(e) => updateConfig('rows', parseInt(e.target.value) || 1)}
                className="w-full bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1"
              />
            </div>
            <div>
              <span className="text-neutral-500 block mb-1">列数</span>
              <input
                type="number"
                value={config.cols}
                onChange={(e) => updateConfig('cols', parseInt(e.target.value) || 1)}
                className="w-full bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateConfig('direction', 'row')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded border text-xs ${
                config.direction === 'row'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-600'
                  : 'bg-white dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 text-neutral-500'
              }`}
            >
              <ArrowRight className="w-3 h-3" /> 行优先
            </button>
            <button
              onClick={() => updateConfig('direction', 'column')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded border text-xs ${
                config.direction === 'column'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-600'
                  : 'bg-white dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 text-neutral-500'
              }`}
            >
              <ArrowDown className="w-3 h-3" /> 列优先
            </button>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
              <span>帧数</span>
              <span className="text-cyan-500">{config.totalFrames}</span>
            </div>
            <input
              type="range"
              min="1"
              max={config.rows * config.cols}
              value={config.totalFrames}
              onChange={(e) => updateConfig('totalFrames', parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
              <span>FPS</span>
              <span className="text-cyan-500">{config.fps}</span>
            </div>
            <input
              type="range"
              min="1"
              max="60"
              value={config.fps}
              onChange={(e) => updateConfig('fps', parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1"
            />
          </div>

          <button
            onClick={handleAutoDetect}
            disabled={isAnalyzing}
            className="w-full py-1.5 text-xs bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded flex items-center justify-center gap-1"
          >
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scan className="w-3 h-3" />}
            AI 自动检测
          </button>
        </div>
      )}

      {/* 动画预览 */}
      {spriteSheetUrl && frames.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <NodeLabel>动画预览</NodeLabel>
            <span className="text-[10px] text-neutral-500">
              {currentFrame + 1}/{frames.length}
            </span>
          </div>

          <div className="relative bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAE/xkYGP4TMDAwYJNkaGBgYCQYrGggkYYBo0+AYQ4oKJCpAgA99AFTn+FxvgAAAABJRU5ErkJggg==')] bg-neutral-800 rounded-lg overflow-hidden flex items-center justify-center p-2"
               style={{ minHeight: '120px' }}>
            {/* 直接显示拆分后的当前帧图片 */}
            <img
              src={frames[currentFrame]}
              alt={`Frame ${currentFrame + 1}`}
              className="max-w-full max-h-[150px] object-contain"
              style={{ imageRendering: 'pixelated' }}
            />

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="absolute bottom-2 right-2 p-1.5 bg-black/50 rounded hover:bg-violet-500/80 transition-colors"
            >
              {isPlaying ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white" />}
            </button>
          </div>
        </div>
      )}

      {/* 导出设置 */}
      {spriteSheetUrl && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoTransparent}
                onChange={(e) => updateConfig('autoTransparent', e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-neutral-600 dark:text-neutral-400">透明背景</span>
            </label>

            <div className="flex gap-1">
              {[1, 2, 4].map((scaleVal) => (
                <button
                  key={scaleVal}
                  onClick={() => updateConfig('scale', scaleVal)}
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    config.scale === scaleVal
                      ? 'bg-cyan-500 border-cyan-500 text-white'
                      : 'bg-transparent border-neutral-300 dark:border-neutral-600 text-neutral-500'
                  }`}
                >
                  {scaleVal}x
                </button>
              ))}
            </div>
          </div>

          <NodeButton
            onClick={handleExportGif}
            disabled={isExporting}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            导出 GIF
          </NodeButton>
        </div>
      )}

      {/* 空白帧警告（由 Claude 分析检测到） */}
      {hasBlankFrames && blankFrameCount > 0 && (
        <div className="flex items-start gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-700 dark:text-amber-400 text-xs">
          <RefreshCw className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">检测到 {blankFrameCount} 个空白帧</p>
            <p className="text-[10px] opacity-80 mt-0.5">
              部分帧可能是空白的，已自动跳过，建议重新生成获得更好效果
            </p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-1.5 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-medium transition-colors"
            >
              重新生成
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-xs">
          <X className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </BaseNode>
  );
};

export default memo(SpriteNode);
