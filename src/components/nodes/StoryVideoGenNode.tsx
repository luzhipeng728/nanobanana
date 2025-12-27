"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import {
  Loader2,
  Film,
  BookOpen,
  Scroll,
  Sparkles,
  Brain,
  ImageIcon,
  Video,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  RefreshCw,
  Wand2,
  Palette,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { NodeTextarea, NodeLabel, NodeButton, NodeSelect, NodeInput } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { cn } from "@/lib/utils";

// 内容类型配置
const CONTENT_TYPES = [
  { value: "children_book", label: "🐰 儿童绘本", icon: BookOpen },
  { value: "poetry", label: "📜 古诗解说", icon: Scroll },
  { value: "science", label: "🔬 科普动画", icon: Sparkles },
  { value: "fairy_tale", label: "🧚 童话故事", icon: BookOpen },
];

// 画风预设
const ART_STYLE_PRESETS = [
  { value: "watercolor", label: "水彩风格", desc: "柔和色彩，温馨氛围" },
  { value: "cartoon", label: "卡通风格", desc: "明亮色彩，活泼可爱" },
  { value: "ink", label: "水墨风格", desc: "中国传统，意境悠远" },
  { value: "flat", label: "扁平风格", desc: "现代简约，信息清晰" },
  { value: "fantasy", label: "奇幻风格", desc: "魔幻氛围，细节丰富" },
  { value: "custom", label: "自定义", desc: "自由描述画风" },
];

// 生成阶段
type GenerationPhase =
  | "idle"
  | "planning"
  | "frames"
  | "videos"
  | "evaluating"
  | "composing"
  | "complete";

interface PhaseInfo {
  label: string;
  icon: React.ElementType;
  color: string;
}

const PHASE_CONFIG: Record<GenerationPhase, PhaseInfo> = {
  idle: { label: "等待开始", icon: Play, color: "zinc" },
  planning: { label: "分镜规划", icon: Brain, color: "violet" },
  frames: { label: "生成首帧", icon: ImageIcon, color: "blue" },
  videos: { label: "生成视频", icon: Video, color: "emerald" },
  evaluating: { label: "质量评估", icon: RefreshCw, color: "orange" },
  composing: { label: "视频合成", icon: Film, color: "pink" },
  complete: { label: "生成完成", icon: CheckCircle, color: "green" },
};

// 场景状态
interface SceneState {
  order: number;
  description: string;
  status: "pending" | "frame" | "video" | "evaluating" | "approved" | "failed";
  frameUrl?: string;
  videoSegments?: number;
  qualityScore?: number;
  retryCount?: number;
}

const StoryVideoGenNode = ({ data, id, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  // 基础状态
  const [story, setStory] = useState(data.story || "");
  const [contentType, setContentType] = useState(data.contentType || "children_book");
  const [artStylePreset, setArtStylePreset] = useState(data.artStylePreset || "watercolor");
  const [customArtStyle, setCustomArtStyle] = useState(data.customArtStyle || "");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "16:9");
  const [qualityMode, setQualityMode] = useState(data.qualityMode || "standard");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 生成状态
  const [projectId, setProjectId] = useState<string | null>(data.projectId || null);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 分镜信息
  const [storyboard, setStoryboard] = useState<any>(null);
  const [scenes, setScenes] = useState<SceneState[]>([]);

  // 消息日志
  const [messages, setMessages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 最终结果
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 添加消息
  const addMessage = useCallback((msg: string) => {
    setMessages((prev) => [...prev.slice(-20), msg]);
  }, []);

  // 获取完整画风描述
  const getArtStyle = useCallback(() => {
    if (artStylePreset === "custom") {
      return customArtStyle || "illustration style";
    }

    const styles: Record<string, string> = {
      watercolor: "watercolor children's book illustration, soft colors, cute characters, warm atmosphere",
      cartoon: "vibrant cartoon style, bold colors, expressive characters, playful animation",
      ink: "traditional Chinese ink painting (水墨画), elegant and poetic, subtle gradients",
      flat: "modern flat illustration, clean lines, geometric shapes, educational infographic style",
      fantasy: "detailed fantasy illustration, magical lighting, enchanted atmosphere, rich details",
    };
    return styles[artStylePreset] || styles.watercolor;
  }, [artStylePreset, customArtStyle]);

  // 处理 SSE 流
  const handleSSEStream = useCallback(
    async (url: string, body: object) => {
      abortControllerRef.current = new AbortController();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "请求失败");
      }

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
              const event = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch (e) {
              console.error("Parse SSE error:", e);
            }
          }
        }
      }
    },
    []
  );

  // 处理事件
  const handleEvent = useCallback((event: any) => {
    const { type, data, message } = event;

    switch (type) {
      case "planning_start":
        setPhase("planning");
        addMessage("🧠 正在分析故事，规划分镜...");
        break;

      case "planning_complete":
        setStoryboard(data);
        addMessage(`✓ 分镜规划完成: "${data.title}"`);
        addMessage(`  共 ${data.sceneCount} 个场景，预计 ${data.totalDuration}s`);
        // 初始化场景状态
        if (data.scenes) {
          setScenes(
            data.scenes.map((s: any, i: number) => ({
              order: i,
              description: s.description,
              status: "pending",
            }))
          );
        }
        break;

      case "scene_frame_start":
        setPhase("frames");
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder ? { ...s, status: "frame" } : s
          )
        );
        addMessage(`🖼️ 生成场景 ${data.sceneOrder + 1} 首帧...`);
        break;

      case "scene_frame_complete":
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder
              ? { ...s, status: "pending", frameUrl: data.frameUrl }
              : s
          )
        );
        addMessage(`✓ 场景 ${data.sceneOrder + 1} 首帧完成`);
        break;

      case "scene_video_start":
        setPhase("videos");
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder ? { ...s, status: "video" } : s
          )
        );
        addMessage(`🎬 生成场景 ${data.sceneOrder + 1} 视频...`);
        break;

      case "scene_video_progress":
        if (data.progress) {
          setProgress(30 + data.progress * 0.5);
        }
        break;

      case "scene_evaluation_start":
        setPhase("evaluating");
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder ? { ...s, status: "evaluating" } : s
          )
        );
        break;

      case "scene_evaluation_complete":
        const { evaluation } = data;
        addMessage(
          `📊 场景 ${data.sceneOrder + 1} 评估: ${evaluation.overallScore}/10 → ${evaluation.recommendation}`
        );
        break;

      case "scene_retry":
        addMessage(`🔄 场景 ${data.sceneOrder + 1} 重试 (${data.retryCount}/3): ${data.reason}`);
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder
              ? { ...s, retryCount: data.retryCount }
              : s
          )
        );
        break;

      case "scene_continue":
        addMessage(`⏩ 场景 ${data.sceneOrder + 1} 续接视频...`);
        break;

      case "scene_approved":
        setScenes((prev) =>
          prev.map((s) =>
            s.order === data.sceneOrder
              ? {
                  ...s,
                  status: "approved",
                  videoSegments: data.totalSegments,
                }
              : s
          )
        );
        addMessage(`✅ 场景 ${data.sceneOrder + 1} 通过 (${data.totalDuration}s)`);
        break;

      case "scene_video_complete":
        addMessage(`✓ 场景 ${data.sceneOrder + 1} 视频完成`);
        break;

      case "composing_start":
        setPhase("composing");
        addMessage("🎞️ 正在合成最终视频...");
        break;

      case "composing_progress":
        if (data.step === "downloading") {
          setProgress(90 + (data.current / data.total) * 5);
        }
        break;

      case "composing_complete":
        setVideoUrl(data.videoUrl);
        addMessage(`✓ 视频合成完成`);
        break;

      case "project_complete":
        setPhase("complete");
        setProgress(100);
        addMessage("🎉 全部完成！");
        break;

      case "error":
        setError(message || "生成失败");
        addMessage(`❌ 错误: ${message}`);
        break;

      case "log":
        if (message) {
          addMessage(message);
        }
        break;
    }
  }, [addMessage]);

  // 开始生成
  const startGeneration = useCallback(async () => {
    if (!story.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setMessages([]);
    setProgress(0);
    setPhase("idle");
    setScenes([]);
    setVideoUrl(null);

    try {
      // 1. 创建项目
      addMessage("创建项目中...");
      const createRes = await fetch("/api/story-video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story,
          contentType,
          artStyle: getArtStyle(),
          aspectRatio,
          qualityMode,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "创建项目失败");
      }

      const { projectId: pid } = await createRes.json();
      setProjectId(pid);
      addMessage(`✓ 项目已创建`);

      // 2. 启动生成流程
      await handleSSEStream("/api/story-video/generate", { projectId: pid });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "生成失败";
      setError(errorMsg);
      addMessage(`❌ 错误: ${errorMsg}`);
      setPhase("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [story, contentType, aspectRatio, qualityMode, isGenerating, addMessage, getArtStyle, handleSSEStream]);

  // 取消生成
  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    setPhase("idle");
    addMessage("已取消");
  }, [addMessage]);

  // 当前阶段配置
  const currentPhaseConfig = PHASE_CONFIG[phase];
  const PhaseIcon = currentPhaseConfig.icon;

  return (
    <GeneratorNodeLayout
      title="故事视频智能体"
      icon={Film}
      color="purple"
      selected={selected}
      className="w-[520px]"
      isGenerating={isGenerating}
      onGenerate={isGenerating ? cancelGeneration : startGeneration}
      generateButtonText={
        isGenerating ? "停止生成" : phase === "complete" ? "重新生成" : "开始生成"
      }
      generateButtonDisabled={!story.trim() && !isGenerating}
      generateButtonClassName={isGenerating ? "bg-rose-600 hover:bg-rose-700" : undefined}
      loadingText={
        <span className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">{currentPhaseConfig.label}</span>
        </span>
      }
    >
      <Handle type="target" position={Position.Left} className="!bg-purple-500" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />

      <div className="space-y-4 nowheel">
        {/* 故事输入 */}
        <div>
          <NodeLabel className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-purple-500" />
            <span>故事内容</span>
          </NodeLabel>
          <NodeTextarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="输入你的故事，例如：从前有一只小兔子，它想要找到彩虹的尽头..."
            rows={3}
            disabled={isGenerating}
            className="text-sm"
          />
        </div>

        {/* 内容类型和画面比例 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <NodeLabel className="text-[10px]">内容类型</NodeLabel>
            <NodeSelect
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              disabled={isGenerating}
              className="text-xs"
            >
              {CONTENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </NodeSelect>
          </div>
          <div>
            <NodeLabel className="text-[10px]">画面比例</NodeLabel>
            <NodeSelect
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={isGenerating}
              className="text-xs"
            >
              <option value="16:9">横屏 16:9</option>
              <option value="9:16">竖屏 9:16</option>
            </NodeSelect>
          </div>
        </div>

        {/* 画风选择 */}
        <div>
          <NodeLabel className="text-[10px] flex items-center gap-1.5">
            <Palette className="w-3 h-3 text-pink-500" />
            画风风格
          </NodeLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {ART_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setArtStylePreset(preset.value)}
                disabled={isGenerating}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-[10px] transition-all border",
                  artStylePreset === preset.value
                    ? "bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-300"
                    : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-purple-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {artStylePreset === "custom" && (
            <NodeInput
              value={customArtStyle}
              onChange={(e) => setCustomArtStyle(e.target.value)}
              placeholder="描述你想要的画风..."
              disabled={isGenerating}
              className="mt-2 text-xs"
            />
          )}
        </div>

        {/* 高级设置折叠 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-purple-500 transition-colors"
        >
          <Settings className="w-3 h-3" />
          高级设置
          {showAdvanced ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
            <div>
              <NodeLabel className="text-[10px]">质量模式</NodeLabel>
              <NodeSelect
                value={qualityMode}
                onChange={(e) => setQualityMode(e.target.value)}
                disabled={isGenerating}
                className="text-xs"
              >
                <option value="economy">经济模式 (更快)</option>
                <option value="standard">标准模式 (推荐)</option>
                <option value="high_quality">高质量模式 (更慢)</option>
              </NodeSelect>
            </div>
          </div>
        )}

        {/* 生成进度 */}
        {(isGenerating || phase !== "idle") && (
          <div className="relative rounded-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800" />
            <div className="absolute inset-0 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500 ease-out",
                  phase === "complete"
                    ? "bg-green-500/20"
                    : "bg-gradient-to-r from-violet-500/10 via-purple-500/15 to-violet-500/10"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="relative p-3">
              {/* 阶段指示器 */}
              <div className="flex items-center justify-between mb-3">
                {(["planning", "frames", "videos", "evaluating", "composing", "complete"] as GenerationPhase[]).map(
                  (p, idx) => {
                    const config = PHASE_CONFIG[p];
                    const Icon = config.icon;
                    const phases = ["planning", "frames", "videos", "evaluating", "composing", "complete"];
                    const currentIdx = phases.indexOf(phase);
                    const isActive = p === phase;
                    const isPast = currentIdx > idx;

                    return (
                      <div key={p} className="flex items-center">
                        <div
                          className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300",
                            isActive && "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg scale-110",
                            isPast && !isActive && "bg-green-500 text-white",
                            !isActive && !isPast && "bg-zinc-200 dark:bg-zinc-700 text-zinc-400"
                          )}
                        >
                          {isPast && !isActive ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Icon className={cn("w-3.5 h-3.5", isActive && "animate-pulse")} />
                          )}
                        </div>
                        {idx < 5 && (
                          <div
                            className={cn(
                              "w-4 h-0.5 mx-0.5 transition-colors duration-300",
                              isPast ? "bg-green-500" : "bg-zinc-200 dark:bg-zinc-700"
                            )}
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </div>

              {/* 当前状态 */}
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  {isGenerating && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                    </span>
                  )}
                  <span className={cn("font-medium", phase === "complete" ? "text-green-600" : "text-violet-600")}>
                    {currentPhaseConfig.label}
                  </span>
                </div>
                <span className="text-zinc-400 font-mono">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 场景卡片 */}
        {scenes.length > 0 && (
          <div className="space-y-2">
            <NodeLabel className="text-[10px]">场景进度</NodeLabel>
            <div className="grid grid-cols-4 gap-1.5 max-h-24 overflow-y-auto">
              {scenes.map((scene) => (
                <div
                  key={scene.order}
                  className={cn(
                    "relative rounded-lg p-2 border transition-all",
                    scene.status === "approved" && "bg-green-50 border-green-200 dark:bg-green-900/20",
                    scene.status === "failed" && "bg-red-50 border-red-200 dark:bg-red-900/20",
                    ["frame", "video", "evaluating"].includes(scene.status) && "bg-blue-50 border-blue-200 dark:bg-blue-900/20",
                    scene.status === "pending" && "bg-zinc-50 border-zinc-200 dark:bg-zinc-800"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-medium">场景 {scene.order + 1}</span>
                    {scene.status === "approved" && <CheckCircle className="w-3 h-3 text-green-500" />}
                    {scene.status === "failed" && <XCircle className="w-3 h-3 text-red-500" />}
                    {["frame", "video", "evaluating"].includes(scene.status) && (
                      <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                    )}
                  </div>
                  {scene.frameUrl && (
                    <div className="w-full h-10 rounded overflow-hidden">
                      <img
                        src={scene.frameUrl}
                        alt={`场景 ${scene.order + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 错误显示 */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-900/20">
            <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="text-xs text-rose-600">{error}</span>
          </div>
        )}

        {/* 消息日志 */}
        {messages.length > 0 && (
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-800 opacity-95" />
            <div className="relative max-h-28 overflow-y-auto rounded-lg p-2.5 space-y-1 font-mono">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-[10px] leading-relaxed",
                    msg.startsWith("✓") && "text-green-400",
                    msg.startsWith("✅") && "text-green-400",
                    msg.startsWith("🧠") && "text-violet-400",
                    msg.startsWith("🖼️") && "text-blue-400",
                    msg.startsWith("🎬") && "text-emerald-400",
                    msg.startsWith("📊") && "text-orange-400",
                    msg.startsWith("🔄") && "text-amber-400",
                    msg.startsWith("⏩") && "text-cyan-400",
                    msg.startsWith("🎞️") && "text-pink-400",
                    msg.startsWith("🎉") && "text-yellow-400",
                    msg.startsWith("❌") && "text-rose-400",
                    !msg.match(/^[✓✅🧠🖼️🎬📊🔄⏩🎞️🎉❌]/) && "text-zinc-400"
                  )}
                >
                  {msg}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* 完成后显示视频 */}
        {videoUrl && phase === "complete" && (
          <div className="rounded-lg overflow-hidden border border-green-200 dark:border-green-800">
            <video
              src={videoUrl}
              controls
              className="w-full"
              poster={scenes[0]?.frameUrl}
            />
            <div className="p-2 bg-green-50 dark:bg-green-900/20">
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 hover:underline"
              >
                📥 下载视频
              </a>
            </div>
          </div>
        )}
      </div>
    </GeneratorNodeLayout>
  );
};

export default memo(StoryVideoGenNode);
