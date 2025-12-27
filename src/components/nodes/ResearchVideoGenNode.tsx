"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import {
  Loader2,
  Video,
  Search,
  FileText,
  Volume2,
  ImageIcon,
  Film,
  CheckCircle,
  XCircle,
  X,
  Sparkles,
  Brain,
  Wand2,
  Pause,
  Play,
  Upload,
  FileUp,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { NodeTextarea, NodeLabel, NodeButton, NodeSelect, NodeTabSelect } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { TTS_SPEAKERS } from "@/lib/tts/bytedance-tts";
import { useImageModels, getDefaultModelId } from "@/hooks/useImageModels";
import { cn } from "@/lib/utils";

// 研究维度类型
interface ResearchDimension {
  id: string;
  dimension: string;
  query: string;
  priority: number;
  status: "pending" | "researching" | "completed" | "failed";
  result?: string;
}

// 分段类型
interface Segment {
  id: string;
  order: number;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  ttsStatus: string;
  imageStatus: string;
}

// 生成阶段
type GenerationPhase =
  | "idle"
  | "dimensions"
  | "researching"
  | "scripting"
  | "tts"
  | "images"
  | "ready";

interface PhaseInfo {
  label: string;
  icon: React.ElementType;
  color: string;
}

const PHASE_CONFIG: Record<GenerationPhase, PhaseInfo> = {
  idle: { label: "等待开始", icon: Play, color: "zinc" },
  dimensions: { label: "分析维度", icon: Brain, color: "violet" },
  researching: { label: "深度研究", icon: Search, color: "blue" },
  scripting: { label: "生成脚本", icon: FileText, color: "emerald" },
  tts: { label: "合成语音", icon: Volume2, color: "orange" },
  images: { label: "生成配图", icon: ImageIcon, color: "pink" },
  ready: { label: "准备完成", icon: CheckCircle, color: "green" },
};

// 发音人按类别分组
const SPEAKER_CATEGORIES = {
  "视频配音": ["zh_male_dayi", "zh_female_mizai", "zh_female_jitangnv", "zh_female_meilinvyou", "zh_female_liuchang"],
  "通用场景": ["zh_female_vivi", "zh_male_ruyayichen", "zh_female_xiaohe", "zh_male_yunzhou", "zh_male_xiaotian"],
  "角色扮演": ["zh_female_keai", "zh_female_tiaopi", "zh_male_shuanglang", "zh_male_tiancai", "zh_female_cancan"],
};

// 语音情感选项
const EMOTION_OPTIONS = [
  { value: "", label: "默认" },
  { value: "happy", label: "开心" },
  { value: "sad", label: "伤感" },
  { value: "angry", label: "生气" },
  { value: "fearful", label: "恐惧" },
  { value: "surprised", label: "惊讶" },
  { value: "neutral", label: "平静" },
];

// 研究强度选项
const RESEARCH_EFFORT_OPTIONS = [
  { value: "low", label: "快速 (1-3分钟)", desc: "适合简单主题" },
  { value: "medium", label: "标准 (3-7分钟)", desc: "适合一般研究" },
  { value: "high", label: "深度 (7-15分钟)", desc: "适合复杂主题" },
];

const ResearchVideoGenNode = ({ data, id, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  // 获取图片模型列表
  const { models: imageModels, isLoading: isLoadingModels } = useImageModels();

  // 基础状态
  const [topic, setTopic] = useState(data.topic || "");
  const [speaker, setSpeaker] = useState(data.speaker || "zh_female_vivi");
  const [speed, setSpeed] = useState(data.speed || 1.0);
  const [emotion, setEmotion] = useState(data.emotion || "");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "16:9");
  const [imageModel, setImageModel] = useState(data.imageModel || "");
  const [dimensionCount, setDimensionCount] = useState(data.dimensionCount || 4);
  const [researchEffort, setResearchEffort] = useState(data.researchEffort || "low");
  const [enableResearch, setEnableResearch] = useState(data.enableResearch !== false);
  const [uploadedDocument, setUploadedDocument] = useState<File | null>(null);
  const [documentContent, setDocumentContent] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 生成状态
  const [projectId, setProjectId] = useState<string | null>(data.projectId || null);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 研究维度
  const [dimensions, setDimensions] = useState<ResearchDimension[]>([]);

  // 分段
  const [segments, setSegments] = useState<Segment[]>([]);
  const [title, setTitle] = useState("");

  // 消息日志
  const [messages, setMessages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 设置默认图片模型
  useEffect(() => {
    if (imageModels.length > 0 && !imageModel) {
      setImageModel(getDefaultModelId(imageModels));
    }
  }, [imageModels, imageModel]);

  // 添加消息
  const addMessage = useCallback((msg: string) => {
    setMessages((prev) => [...prev.slice(-15), msg]);
  }, []);

  // 处理 SSE 流
  const handleSSEStream = useCallback(
    async (url: string, body: object, onEvent: (data: any) => void) => {
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
              const data = JSON.parse(line.slice(6));
              onEvent(data);
            } catch (e) {
              console.error("Parse SSE error:", e);
            }
          }
        }
      }
    },
    []
  );

  // 处理文档上传
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedDocument(file);
    addMessage(`📄 已上传文档: ${file.name}`);

    // 读取文件内容
    try {
      if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        const text = await file.text();
        setDocumentContent(text);
        addMessage(`✓ 文档内容已读取 (${text.length} 字符)`);
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        // PDF 需要后端处理
        setDocumentContent(`[PDF文件: ${file.name}]`);
        addMessage(`✓ PDF 文件将在生成时处理`);
      } else {
        // 其他类型尝试作为文本读取
        const text = await file.text();
        setDocumentContent(text);
        addMessage(`✓ 文档内容已读取 (${text.length} 字符)`);
      }
    } catch (error) {
      addMessage(`✗ 读取文档失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [addMessage]);

  // 开始生成
  const startGeneration = useCallback(async () => {
    if ((!topic.trim() && !documentContent) || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setMessages([]);
    setProgress(0);

    // 判断是否使用文档模式（有文档且禁用研究）
    const useDocumentMode = !!documentContent && !enableResearch;

    try {
      // 1. 创建项目
      addMessage("创建项目中...");
      const createRes = await fetch("/api/research-video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || (uploadedDocument?.name || "文档解说"),
          speaker,
          speed,
          emotion,
          aspectRatio,
          imageModel,
          documentContent: useDocumentMode ? documentContent : undefined,
        }),
      });

      if (!createRes.ok) throw new Error("创建项目失败");
      const { projectId: pid } = await createRes.json();
      setProjectId(pid);
      addMessage(`✓ 项目已创建`);

      // 如果是文档模式，跳过深度研究
      if (useDocumentMode) {
        addMessage("📄 使用文档模式，跳过深度研究");
        setProgress(35);
      } else {
        // 2. 生成研究维度
        setPhase("dimensions");
        addMessage(`正在分析研究维度（${dimensionCount} 个方向）...`);
        await handleSSEStream("/api/research-video/dimensions", { projectId: pid, topic, maxDimensions: dimensionCount }, (data) => {
          if (data.type === "dimensions_generated") {
            setDimensions(data.data.dimensions);
            addMessage(`✓ 发现 ${data.data.dimensions.length} 个研究维度`);
          } else if (data.type === "error") {
            throw new Error(data.message);
          }
        });
        setProgress(15);

        // 3. 并行研究（带研究强度）
        setPhase("researching");
        const researchStartTime = Date.now();
        const effortLabel = RESEARCH_EFFORT_OPTIONS.find(o => o.value === researchEffort)?.label || researchEffort;
        addMessage(`启动并行深度研究 (${effortLabel})...`);
        await handleSSEStream("/api/research-video/research", { projectId: pid, reasoningEffort: researchEffort }, (data) => {
          if (data.type === "research_dimension_start") {
            addMessage(`→ 研究: ${data.data.dimension}`);
            setDimensions((prev) =>
              prev.map((d) => (d.id === data.data.dimensionId ? { ...d, status: "researching" } : d))
            );
          } else if (data.type === "research_dimension_progress") {
            // 更新研究时间
            const elapsed = data.data?.elapsed || Math.round((Date.now() - researchStartTime) / 1000);
            setMessages((prev) => {
              const filtered = prev.filter(m => !m.startsWith("⏳"));
              return [...filtered, `⏳ 研究中... 已用时 ${elapsed}s`];
            });
          } else if (data.type === "research_dimension_complete") {
            setDimensions((prev) =>
              prev.map((d) => (d.id === data.data.dimensionId ? { ...d, status: "completed" } : d))
            );
            addMessage(`✓ 完成: ${data.data.dimension}`);
          } else if (data.type === "research_complete") {
            addMessage(`✓ 研究完成 (${Math.round(data.data.totalTime / 1000)}s)`);
          } else if (data.type === "error") {
            throw new Error(data.message);
          }
        });
        setProgress(35);
      }

      // 4. 生成脚本（包含内容筛选）
      setPhase("scripting");
      const scriptStartTime = Date.now();
      addMessage("正在筛选有用信息并编写解说脚本...");
      let scriptSegmentCount = 0;
      let filterChunkCount = 0;
      await handleSSEStream("/api/research-video/script", { projectId: pid, topic }, (data) => {
        // 内容筛选流式显示
        if (data.type === "content_filter_chunk") {
          filterChunkCount++;
          if (filterChunkCount % 5 === 0) {
            const len = data.data?.totalLength || 0;
            setMessages((prev) => {
              const filtered = prev.filter(m => !m.startsWith("🔍"));
              return [...filtered, `🔍 筛选中... 已生成 ${len} 字符`];
            });
          }
        } else if (data.type === "content_filter_complete") {
          addMessage(`✓ 内容筛选完成: ${data.data?.filteredLength || 0} 字符 (保留 ${data.data?.ratio || 0}%)`);
        } else if (data.type === "script_progress") {
          // 脚本生成流式进度
          const len = data.data?.totalLength || 0;
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.startsWith("📜"));
            return [...filtered, `📜 脚本生成中... ${len} 字符`];
          });
        } else if (data.type === "script_chunk" && data.data?.segment) {
          scriptSegmentCount++;
          const seg = data.data.segment;
          const elapsed = Math.round((Date.now() - scriptStartTime) / 1000);
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.startsWith("⏳") && !m.startsWith("📝"));
            return [...filtered, `📝 章节 ${scriptSegmentCount}: ${seg.chapterTitle || `第${seg.order + 1}章`}`];
          });
        } else if (data.type === "script_complete") {
          setTitle(data.data.title);
          const elapsed = Math.round((Date.now() - scriptStartTime) / 1000);
          addMessage(`✓ 脚本完成: "${data.data.title}" (${elapsed}s)`);
          addMessage(`  共 ${data.data.segmentCount} 个章节`);
        } else if (data.type === "error") {
          throw new Error(data.message);
        }
      });
      setProgress(50);

      // 5. 生成 TTS
      setPhase("tts");
      const ttsStartTime = Date.now();
      addMessage("开始合成语音...");
      let ttsCount = 0;
      let ttsTotal = 0;
      await handleSSEStream("/api/research-video/tts/generate", { projectId: pid }, (data) => {
        if (data.type === "tts_start") {
          ttsTotal = data.data?.total || 0;
          addMessage(`  总计 ${ttsTotal} 段语音待合成`);
        } else if (data.type === "tts_segment_complete") {
          ttsCount++;
          const duration = data.data?.duration ? `${data.data.duration.toFixed(1)}s` : "";
          const elapsed = Math.round((Date.now() - ttsStartTime) / 1000);
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.startsWith("🔊"));
            return [...filtered, `🔊 语音 ${ttsCount}/${ttsTotal} 完成 ${duration} (已用 ${elapsed}s)`];
          });
        } else if (data.type === "tts_complete") {
          const elapsed = Math.round((Date.now() - ttsStartTime) / 1000);
          addMessage(`✓ 语音合成完成 (${data.data.results.length} 段, ${elapsed}s)`);
        } else if (data.progress) {
          setProgress(50 + data.progress * 0.25);
        } else if (data.type === "error") {
          throw new Error(data.message);
        }
      });
      setProgress(75);

      // 6. 生成配图
      setPhase("images");
      const imagesStartTime = Date.now();
      addMessage("开始生成信息图配图...");
      let imageCount = 0;
      let imageTotal = 0;
      await handleSSEStream("/api/research-video/images/generate", { projectId: pid }, (data) => {
        if (data.type === "images_start") {
          imageTotal = data.data?.total || 0;
          addMessage(`  总计 ${imageTotal} 张信息图待生成`);
        } else if (data.type === "images_progress" && data.message) {
          // AI 生成提示词进度
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.startsWith("🎨") && !m.startsWith("💡"));
            return [...filtered, `💡 ${data.message}`];
          });
        } else if (data.type === "images_segment_complete") {
          imageCount++;
          const chapter = data.data?.chapterTitle || `第${data.data?.segmentOrder + 1}章`;
          const elapsed = Math.round((Date.now() - imagesStartTime) / 1000);
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.startsWith("🎨") && !m.startsWith("💡"));
            return [...filtered, `🎨 图片 ${imageCount}/${imageTotal}: ${chapter} (已用 ${elapsed}s)`];
          });
        } else if (data.type === "images_complete") {
          const elapsed = Math.round((Date.now() - imagesStartTime) / 1000);
          addMessage(`✓ 配图生成完成 (${data.data.results.length} 张, ${elapsed}s)`);
        } else if (data.progress) {
          setProgress(75 + data.progress * 0.25);
        } else if (data.type === "error") {
          throw new Error(data.message);
        }
      });
      setProgress(100);

      // 7. 获取最终数据
      const projectRes = await fetch(`/api/research-video/${pid}`);
      const { project } = await projectRes.json();
      setSegments(project.segments);
      setTitle(project.title || title);

      setPhase("ready");
      addMessage("🎉 全部完成！可以进入编辑器");

      // 创建编辑器节点
      createEditorNode(pid, project.title || title, project.segments);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "生成失败";
      setError(errorMsg);
      addMessage(`✗ 错误: ${errorMsg}`);
      setPhase("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [topic, speaker, speed, emotion, aspectRatio, imageModel, dimensionCount, researchEffort, enableResearch, documentContent, uploadedDocument, isGenerating, addMessage, handleSSEStream, title]);

  // 创建编辑器节点
  const createEditorNode = useCallback(
    (projectId: string, title: string, segments: Segment[]) => {
      const newNodeId = `research-video-editor-${Date.now()}`;
      const newNode = {
        id: newNodeId,
        type: "researchVideoEditor",
        position: { x: 700, y: 0 },
        style: { width: 800, height: 600 },
        data: {
          projectId,
          title,
          segments,
        },
      };

      setNodes((nds) => [...nds, newNode]);

      // 创建连接
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${id}-${newNodeId}`,
          source: id,
          target: newNodeId,
        },
      ]);
    },
    [id, setNodes, setEdges]
  );

  // 取消生成
  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    setPhase("idle");
    addMessage("已取消");
  }, [addMessage]);

  // 当前阶段配置
  const currentPhaseConfig = PHASE_CONFIG[phase];

  return (
    <GeneratorNodeLayout
      title="AI Research Video"
      icon={Video}
      color="purple"
      selected={selected}
      className="w-[480px]"
      isGenerating={isGenerating}
      onGenerate={isGenerating ? cancelGeneration : startGeneration}
      generateButtonText={isGenerating ? "停止生成" : phase === "ready" ? "重新生成" : "开始生成"}
      generateButtonDisabled={(!topic.trim() && !documentContent) && !isGenerating}
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
        {/* 主题输入 - 突出显示 */}
        <div>
          <NodeLabel className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-purple-500" />
            <span>研究主题</span>
          </NodeLabel>
          <NodeTextarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入你想深度研究的主题，如：今日AI大新闻速报、量子计算最新进展..."
            rows={2}
            disabled={isGenerating}
            className="text-sm"
          />
        </div>

        {/* 文档上传与研究设置 */}
        <div className="space-y-2">
          {/* 文档上传 */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isGenerating}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed transition-all text-xs",
                uploadedDocument
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "border-zinc-300 hover:border-purple-400 text-zinc-500 hover:text-purple-500 dark:border-zinc-600"
              )}
            >
              {uploadedDocument ? (
                <>
                  <FileText className="w-4 h-4" />
                  <span className="truncate max-w-[150px]">{uploadedDocument.name}</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  <span>上传文档 (TXT/MD/PDF)</span>
                </>
              )}
            </button>
            {uploadedDocument && (
              <button
                onClick={() => {
                  setUploadedDocument(null);
                  setDocumentContent("");
                  addMessage("已清除文档");
                }}
                disabled={isGenerating}
                className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 深度研究开关与强度 */}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <button
              onClick={() => setEnableResearch(!enableResearch)}
              disabled={isGenerating}
              className="flex items-center gap-2 text-xs"
            >
              {enableResearch ? (
                <ToggleRight className="w-6 h-6 text-purple-500" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-zinc-400" />
              )}
              <span className={enableResearch ? "text-purple-600 dark:text-purple-400" : "text-zinc-500"}>
                深度研究
              </span>
            </button>

            {enableResearch && (
              <div className="flex-1 flex items-center gap-2">
                <NodeLabel className="text-[10px] whitespace-nowrap">研究强度:</NodeLabel>
                <NodeSelect
                  value={researchEffort}
                  onChange={(e) => setResearchEffort(e.target.value)}
                  disabled={isGenerating}
                  className="text-xs flex-1"
                >
                  {RESEARCH_EFFORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NodeSelect>
              </div>
            )}
          </div>

          {/* 文档模式提示 */}
          {uploadedDocument && !enableResearch && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 px-2">
              <Sparkles className="w-3 h-3" />
              文档模式：将直接使用文档内容生成视频，跳过深度研究
            </div>
          )}
        </div>

        {/* 配置选项 */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <NodeLabel className="text-[10px]">发音人</NodeLabel>
            <NodeSelect
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              disabled={isGenerating}
              className="text-xs"
            >
              {Object.entries(SPEAKER_CATEGORIES).map(([category, keys]) => (
                <optgroup key={category} label={category}>
                  {keys.map((key) => {
                    const speakerInfo = TTS_SPEAKERS[key as keyof typeof TTS_SPEAKERS];
                    return (
                      <option key={key} value={key}>
                        {speakerInfo?.name || key}
                      </option>
                    );
                  })}
                </optgroup>
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
              <option value="1:1">方形 1:1</option>
            </NodeSelect>
          </div>
          <div>
            <NodeLabel className="text-[10px] flex items-center gap-1">
              <Brain className="w-3 h-3 text-blue-500" />
              研究方向
            </NodeLabel>
            <NodeSelect
              value={dimensionCount}
              onChange={(e) => setDimensionCount(parseInt(e.target.value))}
              disabled={isGenerating}
              className="text-xs"
            >
              <option value={1}>1 个方向</option>
              <option value={2}>2 个方向</option>
              <option value={3}>3 个方向</option>
              <option value={4}>4 个方向</option>
              <option value={5}>5 个方向</option>
            </NodeSelect>
          </div>
        </div>

        {/* 语音设置 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <NodeLabel className="text-[10px] flex items-center gap-1.5">
              <Volume2 className="w-3 h-3 text-orange-500" />
              语速: {speed.toFixed(1)}x
            </NodeLabel>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              disabled={isGenerating}
              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700 accent-orange-500"
            />
            <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
              <span>0.5x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>
          <div>
            <NodeLabel className="text-[10px]">语音情感</NodeLabel>
            <NodeSelect
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              disabled={isGenerating}
              className="text-xs"
            >
              {EMOTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NodeSelect>
          </div>
        </div>

        {/* 图片模型选择 */}
        <div>
          <NodeLabel className="text-[10px] flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3 text-pink-500" />
            图片模型
          </NodeLabel>
          <NodeSelect
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            disabled={isGenerating || isLoadingModels}
            className="text-xs"
          >
            {isLoadingModels ? (
              <option value="">加载中...</option>
            ) : (
              imageModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))
            )}
          </NodeSelect>
        </div>

        {/* 生成阶段指示器 - 现代风格 */}
        {(isGenerating || phase !== "idle") && (
          <div className="relative rounded-xl overflow-hidden">
            {/* 背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800" />

            {/* 进度条背景 */}
            <div className="absolute inset-0 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500 ease-out",
                  isGenerating ? "bg-gradient-to-r from-violet-500/10 via-purple-500/15 to-violet-500/10" : "bg-green-500/10"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="relative p-3">
              {/* 阶段指示器 */}
              <div className="flex items-center justify-between mb-3">
                {(["dimensions", "researching", "scripting", "tts", "images", "ready"] as GenerationPhase[]).map(
                  (p, idx) => {
                    const config = PHASE_CONFIG[p];
                    const Icon = config.icon;
                    const isActive = p === phase;
                    const isPast =
                      ["dimensions", "researching", "scripting", "tts", "images", "ready"].indexOf(phase) > idx;

                    return (
                      <div key={p} className="flex items-center">
                        <div
                          className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300",
                            isActive && "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-200/50 scale-110",
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

              {/* 当前状态显示 */}
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  {isGenerating && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                    </span>
                  )}
                  <span className={cn("font-medium", isGenerating ? "text-violet-600" : "text-green-600")}>
                    {currentPhaseConfig.label}
                  </span>
                </div>
                <span className="text-zinc-400 font-mono">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 研究维度展示 - 卡片式 */}
        {dimensions.length > 0 && (
          <div className="space-y-2">
            <NodeLabel className="text-[10px] flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-blue-500" />
              研究维度
            </NodeLabel>
            <div className="grid grid-cols-2 gap-2">
              {dimensions.map((dim) => (
                <div
                  key={dim.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300",
                    dim.status === "completed" && "bg-green-50 border-green-200 dark:bg-green-900/20",
                    dim.status === "researching" && "bg-blue-50 border-blue-200 dark:bg-blue-900/20",
                    dim.status === "failed" && "bg-red-50 border-red-200 dark:bg-red-900/20",
                    dim.status === "pending" && "bg-zinc-50 border-zinc-200 dark:bg-zinc-800"
                  )}
                >
                  {dim.status === "completed" && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                  {dim.status === "researching" && (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
                  )}
                  {dim.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                  {dim.status === "pending" && (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300 flex-shrink-0" />
                  )}
                  <span className="text-[10px] font-medium truncate">{dim.dimension}</span>
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

        {/* 消息日志 - 简洁风格 */}
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
                    msg.startsWith("→") && "text-blue-400",
                    msg.startsWith("✗") && "text-rose-400",
                    msg.startsWith("🎉") && "text-yellow-400",
                    msg.startsWith("⏳") && "text-amber-400",
                    msg.startsWith("📝") && "text-emerald-400",
                    msg.startsWith("🔊") && "text-orange-400",
                    msg.startsWith("🎨") && "text-pink-400",
                    msg.startsWith("💡") && "text-purple-400",
                    !msg.match(/^[✓→✗🎉⏳📝🔊🎨💡]/) && "text-zinc-400"
                  )}
                >
                  {msg}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* 标题显示 */}
        {title && phase === "ready" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 dark:from-purple-900/20 dark:to-violet-900/20">
            <Film className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">{title}</span>
          </div>
        )}
      </div>
    </GeneratorNodeLayout>
  );
};

export default memo(ResearchVideoGenNode);
