"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Video as VideoIcon, Link2, UserPlus, Sparkles, Eye } from "lucide-react";
import { NodeTextarea, NodeSelect, NodeLabel, NodeButton, NodeInput } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";
import cameoData from "@/data/composer_profiles.json";
import ReactMarkdown from "react-markdown";

type VideoModel = "sora" | "veo-3.1-fast-generate-preview";

type VideoGenNodeData = {
  prompt: string;
  orientation: "portrait" | "landscape";
  model: VideoModel;
  negativePrompt?: string;
  isGenerating: boolean;
};

interface CameoProfile {
  username: string;
  display_name?: string;
  profile_picture_url: string;
  verified: boolean;
}

const VideoGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addVideoNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(data.orientation || "portrait");
  const [model, setModel] = useState<VideoModel>(data.model || "sora");
  const [negativePrompt, setNegativePrompt] = useState(data.negativePrompt || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);
  const [showCameos, setShowCameos] = useState(false);
  const [selectedCameos, setSelectedCameos] = useState<string[]>([]);

  // Veo 分析状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const analysisRef = useRef<HTMLDivElement>(null);

  const isVeoModel = model === "veo-3.1-fast-generate-preview";

  const cameos: CameoProfile[] = (cameoData as any).composer_profiles.map((p: any) => ({
    username: p.username,
    display_name: p.display_name || p.username,
    profile_picture_url: p.profile_picture_url,
    verified: p.verified || false,
  }));

  // 使用 ReactFlow store 监听 edges 变化
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  // 更新连接的图片数量
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    setConnectedImagesCount(connectedNodes.length);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value;
  };

  const handleCameoSelect = (username: string) => {
    if (selectedCameos.includes(username)) {
      // 取消选择
      setSelectedCameos(prev => prev.filter(u => u !== username));
    } else if (selectedCameos.length < 3) {
      // 选择新的 cameo
      setSelectedCameos(prev => [...prev, username]);

      const textarea = promptRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = prompt;
        const before = text.substring(0, start);
        const after = text.substring(end);
        const tag = `@${username} `;

        const newPrompt = before + tag + after;
        setPrompt(newPrompt);
        data.prompt = newPrompt;

        setTimeout(() => {
          const newPos = start + tag.length;
          textarea.setSelectionRange(newPos, newPos);
          textarea.focus();
        }, 0);
      }
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setAnalysisText("");
    setCurrentStep("");

    try {
      // 获取连接的图片节点（用于图生视频）
      const connectedNodes = getConnectedImageNodes(id);
      const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

      if (inputImage) {
        console.log(`Using input image for image-to-video: ${inputImage}`);
      }

      let taskId: string;
      let apiSource: "sora" | "veo";

      if (isVeoModel) {
        // Veo 模型：先流式分析图片，再生成视频
        setIsAnalyzing(true);

        // 第一步：调用流式分析 API
        const analyzeResponse = await fetch("/api/veo/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userRequest: prompt,
            imageUrl: inputImage,
          }),
        });

        if (!analyzeResponse.ok) {
          throw new Error("Failed to analyze image");
        }

        const reader = analyzeResponse.body?.getReader();
        const decoder = new TextDecoder();
        let generatedPrompt = prompt;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6));

                  switch (event.type) {
                    case "status":
                      setCurrentStep(event.step || "");
                      break;
                    case "analysis_start":
                      setAnalysisText("");
                      break;
                    case "analysis_chunk":
                      setAnalysisText((prev) => prev + event.chunk);
                      // 自动滚动到底部
                      if (analysisRef.current) {
                        analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
                      }
                      break;
                    case "analysis_end":
                      break;
                    case "prompt_ready":
                      generatedPrompt = event.prompt || prompt;
                      console.log("Generated video prompt:", generatedPrompt);
                      break;
                    case "error":
                      throw new Error(event.error);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        }

        setIsAnalyzing(false);
        setCurrentStep("🚀 正在创建视频任务...");

        // 第二步：使用生成的 prompt 创建 Veo 任务
        const response = await fetch("/api/generate-veo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userRequest: generatedPrompt, // 使用 AI 生成的专业提示词
            aspectRatio: orientation === "landscape" ? "16:9" : "9:16",
            resolution: "720p",
            durationSeconds: 8,
            inputImage,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create Veo video task");
        }

        const result = await response.json();
        taskId = result.taskId;
        apiSource = "veo";
        console.log(`Created Veo video task: ${taskId}`);
      } else {
        // Sora API - 直接调用
        const response = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            orientation,
            inputImage,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create video task");
        }

        const result = await response.json();
        taskId = result.taskId;
        apiSource = "sora";
        console.log(`Created Sora video task: ${taskId}`);
      }

      // 立即创建一个 Video 节点，传入 taskId 和 apiSource
      const currentNode = getNode(id);
      if (currentNode) {
        addVideoNode(
          taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y },
          { apiSource, model }
        );
      }

      setCurrentStep("");
    } catch (error) {
      console.error("Failed to create video task", error);
      alert("Failed to create video task");
    } finally {
      setIsGenerating(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <BaseNode
      title="Video Generator"
      icon={VideoIcon}
      color="orange"
      selected={selected}
      className="w-[320px]"
      headerActions={
        connectedImagesCount > 0 ? (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
            <Link2 className="w-3 h-3" />
            图生视频
          </span>
        ) : (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
            ← 可连接图片
          </span>
        )
      }
    >
      {/* 左侧输入连接点 - 接收参考图片用于图生视频 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-orange-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-orange-500/50"
        title="连接图片作为参考 (图生视频)"
      />

      <div className="space-y-3">
        {/* Model Selector */}
        <div>
          <NodeLabel>Model</NodeLabel>
          <NodeSelect
            value={model}
            onChange={(e) => {
              const val = e.target.value as VideoModel;
              setModel(val);
              data.model = val;
            }}
            className="w-full"
          >
            <option value="sora">Sora (OpenAI)</option>
            <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast (Google)</option>
          </NodeSelect>
        </div>

        <div>
          <NodeLabel>Orientation</NodeLabel>
          <NodeSelect
            value={orientation}
            onChange={(e) => {
              const val = e.target.value as "portrait" | "landscape";
              setOrientation(val);
              data.orientation = val;
            }}
            className="w-full"
          >
            <option value="portrait">Portrait (9:16)</option>
            <option value="landscape">Landscape (16:9)</option>
          </NodeSelect>
        </div>

        {/* Cameo Selector - Only for Sora model */}
        {!isVeoModel && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <NodeLabel className="mb-0">Add Cameo</NodeLabel>
              <NodeButton
                variant="ghost"
                onClick={() => setShowCameos(!showCameos)}
                className="h-5 px-1.5 text-[10px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                <UserPlus className="w-3 h-3 mr-1" />
                {showCameos ? "Hide" : "Show"}
              </NodeButton>
            </div>
            {showCameos && (
              <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800" style={{ maxWidth: "100%" }}>
                {cameos.slice(0, 10).map((cameo) => (
                  <button
                    key={cameo.username}
                    type="button"
                    onClick={() => handleCameoSelect(cameo.username)}
                    disabled={!selectedCameos.includes(cameo.username) && selectedCameos.length >= 3}
                    className={`flex-shrink-0 flex flex-col items-center gap-0.5 p-1 rounded-md border transition-all duration-200 ${
                      selectedCameos.includes(cameo.username)
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-sm"
                        : "border-neutral-200 dark:border-neutral-800 hover:border-orange-400 dark:hover:border-orange-600"
                    } disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-neutral-900`}
                    title={cameo.display_name}
                  >
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800">
                      <img
                        src={cameo.profile_picture_url}
                        alt={cameo.username}
                        className="w-full h-full object-cover"
                      />
                      {cameo.verified && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-500 ring-1 ring-white dark:ring-neutral-900 rounded-full flex items-center justify-center text-[8px] text-white">
                          ✓
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] font-medium text-neutral-600 dark:text-neutral-400 max-w-[40px] truncate">
                      {cameo.display_name?.split(" ")[0] || cameo.username}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <NodeLabel className="mb-0">{isVeoModel ? "描述" : "Prompt"}</NodeLabel>
            {isVeoModel && (
              <span className="text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                <Sparkles className="w-2.5 h-2.5" />
                AI 优化
              </span>
            )}
          </div>
          <NodeTextarea
            ref={promptRef}
            className="w-full resize-none focus:border-orange-500 focus:ring-orange-500/20"
            rows={isVeoModel ? 3 : 4}
            value={prompt}
            onChange={handlePromptChange}
            placeholder={isVeoModel
              ? "简单描述即可，AI 会自动生成专业提示词\n例如：让她微笑、慢慢转头看向镜头"
              : "Describe the video scene..."
            }
          />
        </div>

        {connectedImagesCount > 0 && (
          <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-md border border-orange-100 dark:border-orange-900/30 flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            Image-to-video mode active
          </div>
        )}

        {/* Veo 分析过程展示 - 和 Agent 节点一样的样式 */}
        {isVeoModel && (isAnalyzing || analysisText) && (
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
                {currentStep || "Claude Vision 分析中"}
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
                <ReactMarkdown>{analysisText}</ReactMarkdown>
                {isAnalyzing && (
                  <span className="inline-block w-2 h-4 bg-purple-500 ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-1">
          <NodeButton
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                {isAnalyzing ? "分析中..." : "生成中..."}
              </>
            ) : (
              "Generate Video"
            )}
          </NodeButton>
        </div>
      </div>

    </BaseNode>
  );
};

export default memo(VideoGenNode);
