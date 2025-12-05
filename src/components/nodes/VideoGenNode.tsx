"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Video as VideoIcon, Link2, UserPlus, Sparkles, Eye, Wand2 } from "lucide-react";
import { NodeTextarea, NodeLabel, NodeButton, NodeTabSelect } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import cameoData from "@/data/composer_profiles.json";
import ReactMarkdown from "react-markdown";
import { useTaskGeneration } from "@/hooks/useTaskGeneration";

type VideoModel = "sora" | "veo-3.1-fast-generate-preview";

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
  // Sora 默认 8 秒，Veo 默认 5 秒
  const [durationSeconds, setDurationSeconds] = useState<number>(data.durationSeconds || 8);
  
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);
  const [showCameos, setShowCameos] = useState(false);
  const [selectedCameos, setSelectedCameos] = useState<string[]>([]);

  // AI Analysis State (for both Sora and Veo)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const analysisRef = useRef<HTMLDivElement>(null);

  // Sora AI Enhancement toggle
  const [useAiEnhance, setUseAiEnhance] = useState(true);

  const isVeoModel = model === "veo-3.1-fast-generate-preview";

  // Prepare Cameos
  const cameos: CameoProfile[] = (cameoData as any).composer_profiles.map((p: any) => ({
    username: p.username,
    display_name: p.display_name || p.username,
    profile_picture_url: p.profile_picture_url,
    verified: p.verified || false,
  }));

  // Listen for edge changes
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

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
      setSelectedCameos(prev => prev.filter(u => u !== username));
    } else if (selectedCameos.length < 3) {
      setSelectedCameos(prev => [...prev, username]);
      const textarea = promptRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const tag = `@${username} `;
        const newPrompt = prompt.substring(0, start) + tag + prompt.substring(end);
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

  // Main Generation Hook
  const { isGenerating, generate, setIsGenerating } = useTaskGeneration({
    onSuccess: (result) => {
      console.log(`Created video task: ${result.taskId}`);
      const currentNode = getNode(id);
      if (currentNode) {
        // Sora API 不返回 apiSource，需要根据当前模型判断
        const apiSource = result.apiSource || (model === "sora" ? "sora" : "veo");
        addVideoNode(
          result.taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y },
          { apiSource, model }
        );
      }
      setCurrentStep("");
      setAnalysisText("");
    }
  });

  const onGenerate = async () => {
    if (!prompt) return;
    
    // Manually clear states
    setAnalysisText("");
    setCurrentStep("");

    const connectedNodes = getConnectedImageNodes(id);
    const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

    if (isVeoModel) {
      // Custom flow for Veo with streaming analysis
      setIsGenerating(true);
      setIsAnalyzing(true);
      try {
        // 1. Analyze
        const analyzeResponse = await fetch("/api/veo/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userRequest: prompt, imageUrl: inputImage }),
        });

        if (!analyzeResponse.ok) throw new Error("Failed to analyze image");

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
                  if (event.type === "status") setCurrentStep(event.step || "");
                  else if (event.type === "analysis_chunk") {
                    setAnalysisText((prev) => prev + event.chunk);
                    if (analysisRef.current) analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
                  }
                  else if (event.type === "prompt_ready") generatedPrompt = event.prompt || prompt;
                  else if (event.type === "error") throw new Error(event.error);
                } catch (e) { /* ignore */ }
              }
            }
          }
        }

        setIsAnalyzing(false);
        setCurrentStep("🚀 正在创建视频任务...");

        // 2. Generate with new prompt
        const response = await fetch("/api/generate-veo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userRequest: generatedPrompt,
            aspectRatio: orientation === "landscape" ? "16:9" : "9:16",
            resolution: "720p",
            durationSeconds,
            inputImage,
          }),
        });

        if (!response.ok) throw new Error("Failed to create Veo task");
        
        const result = await response.json();
        
        // Success logic
        console.log(`Created Veo video task: ${result.taskId}`);
        const currentNode = getNode(id);
        if (currentNode) {
          addVideoNode(
            result.taskId,
            prompt,
            { x: currentNode.position.x + 350, y: currentNode.position.y },
            { apiSource: "veo", model }
          );
        }
      } catch (error) {
        console.error(error);
        alert("Failed: " + (error instanceof Error ? error.message : "Unknown error"));
      } finally {
        setIsGenerating(false);
        setIsAnalyzing(false);
      }
    } else {
      // Standard Sora Flow using the hook
      generate({
        apiPath: "/api/generate-video",
        body: {
          prompt,
          orientation,
          inputImage,
        }
      }).then(res => {
        // Hook handles success callback, but we need to inject apiSource manually into the result passed to onSuccess?
        // Actually the API response contains taskId. We need to map it.
        // The hook's onSuccess receives the raw JSON result.
        // Our hook onSuccess is already defined above, but it expects result.apiSource.
        // Sora API might not return apiSource, so we might need to fix the onSuccess callback or the API.
        // Let's check VideoGenNode.tsx original code. It sets apiSource = "sora" manually.
        // So we should override onSuccess for Sora or handle it in the main hook config.
        // Let's just modify the hook config to handle both or return the result to handle locally?
        // generate() returns the result.
      });
    }
  };

  // Sora 视频生成 - 支持 AI 增强分析
  const onGenerateSora = async () => {
    const connectedNodes = getConnectedImageNodes(id);
    const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

    // 调试日志
    console.log("[Sora] onGenerateSora called");
    console.log("[Sora] connectedNodes:", connectedNodes.length);
    console.log("[Sora] inputImage:", inputImage ? String(inputImage).substring(0, 50) + "..." : "undefined");
    console.log("[Sora] useAiEnhance:", useAiEnhance);

    // 将数字时长转换为字符串（Sora 2 API 要求字符串格式）
    const durationStr = String(durationSeconds) as "4" | "8" | "12";

    // 清理状态
    setAnalysisText("");
    setCurrentStep("");

    let finalPrompt = prompt;

    // 如果启用 AI 增强，先进行 AI 分析（有图片分析图片，无图片优化提示词）
    if (useAiEnhance) {
      console.log("[Sora] Starting AI analysis...", inputImage ? "with image" : "text only");
      setIsGenerating(true);
      setIsAnalyzing(true);

      try {
        const analyzeResponse = await fetch("/api/sora/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userRequest: prompt,
            imageUrl: inputImage,
            durationSeconds: parseInt(durationStr),
          }),
        });

        if (!analyzeResponse.ok) {
          throw new Error("分析请求失败");
        }

        const reader = analyzeResponse.body?.getReader();
        const decoder = new TextDecoder();

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
                  if (event.type === "status") {
                    setCurrentStep(event.step || "");
                  } else if (event.type === "analysis_chunk") {
                    setAnalysisText((prev) => prev + event.chunk);
                    if (analysisRef.current) {
                      analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
                    }
                  } else if (event.type === "prompt_ready") {
                    finalPrompt = event.prompt || prompt;
                    console.log("[Sora AI] Generated prompt:", finalPrompt.substring(0, 100) + "...");
                  } else if (event.type === "error") {
                    throw new Error(event.error);
                  }
                } catch (e) {
                  // ignore parse errors
                }
              }
            }
          }
        }

        setIsAnalyzing(false);
        setCurrentStep("🚀 正在创建视频任务...");
      } catch (error) {
        console.error("[Sora AI] Analysis error:", error);
        setIsAnalyzing(false);
        setIsGenerating(false);
        alert("AI 分析失败: " + (error instanceof Error ? error.message : "未知错误"));
        return;
      }
    }

    // generate() 成功后会自动触发 onSuccess 回调
    await generate({
      apiPath: "/api/generate-video",
      body: {
        prompt: finalPrompt,
        orientation,
        inputImage,
        durationSeconds: durationStr,
      }
    });
  };

  const handleGenerateClick = isVeoModel ? onGenerate : onGenerateSora;

  return (
    <GeneratorNodeLayout
      title="Video Generator"
      icon={VideoIcon}
      color="orange"
      selected={selected}
      isGenerating={isGenerating}
      onGenerate={handleGenerateClick}
      generateButtonText="生成视频"
      generateButtonDisabled={!prompt}
      loadingText={
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          {isAnalyzing ? "分析中..." : "生成中..."}
        </>
      }
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
      {/* 左侧输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-orange-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-orange-500/50"
        title="连接图片作为参考 (图生视频)"
      />

      <div className="space-y-3">
        {/* 模型选择 - Veo 3.1 暂时禁用 */}
        {/* <div className="space-y-1.5">
          <NodeLabel>模型</NodeLabel>
          <NodeTabSelect
            value={model}
            onChange={(val) => {
              const newModel = val as VideoModel;
              setModel(newModel);
              data.model = newModel;
            }}
            options={[
              { value: "sora", label: "Sora" },
              { value: "veo-3.1-fast-generate-preview", label: "Veo 3.1" },
            ]}
            color="orange"
          />
        </div> */}

        {/* 画面方向 */}
        <div className="space-y-1.5">
          <NodeLabel>画面方向</NodeLabel>
          <NodeTabSelect
            value={orientation}
            onChange={(val) => {
              const newVal = val as "portrait" | "landscape";
              setOrientation(newVal);
              data.orientation = newVal;
            }}
            options={[
              { value: "portrait", label: "竖屏 9:16" },
              { value: "landscape", label: "横屏 16:9" },
            ]}
            color="orange"
            size="sm"
          />
        </div>

        {/* 时长选择 - Sora 和 Veo 都支持 */}
        <div className="space-y-1.5">
          <NodeLabel>视频时长</NodeLabel>
          <NodeTabSelect
            value={String(durationSeconds)}
            onChange={(val) => {
              const num = parseInt(val);
              setDurationSeconds(num);
              data.durationSeconds = num;
            }}
            options={
              isVeoModel
                ? [
                    { value: "3", label: "3秒" },
                    { value: "4", label: "4秒" },
                    { value: "5", label: "5秒" },
                    { value: "6", label: "6秒" },
                    { value: "8", label: "8秒" },
                  ]
                : [
                    // Sora 2 API 只支持 4, 8, 12 秒
                    { value: "4", label: "4秒" },
                    { value: "8", label: "8秒" },
                    { value: "12", label: "12秒" },
                  ]
            }
            color="orange"
            size="sm"
          />
        </div>

        {/* 角色选择 - Sora 专用 */}
        {!isVeoModel && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <NodeLabel className="mb-0">添加角色</NodeLabel>
              <NodeButton
                variant="ghost"
                onClick={() => setShowCameos(!showCameos)}
                className="h-5 px-1.5 text-[10px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                <UserPlus className="w-3 h-3 mr-1" />
                {showCameos ? "收起" : "展开"}
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

        {/* 描述输入 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <NodeLabel className="mb-0">描述</NodeLabel>
            {isVeoModel ? (
              <span className="text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                <Sparkles className="w-2.5 h-2.5" />
                AI 优化
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setUseAiEnhance(!useAiEnhance)}
                className={`text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium transition-all ${
                  useAiEnhance
                    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                }`}
              >
                <Wand2 className="w-2.5 h-2.5" />
                AI {connectedImagesCount > 0 ? "分镜" : "优化"} {useAiEnhance ? "开" : "关"}
              </button>
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
              : "描述视频场景..."
            }
          />
        </div>

        {/* 快捷提示词 - 图生视频模式 */}
        {connectedImagesCount > 0 && !isVeoModel && (
          <div className="space-y-1.5">
            <NodeLabel className="text-[10px] text-neutral-500">快捷提示</NodeLabel>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "🎬 分镜转写实", text: "这是一个分镜故事板，请转化为写实风格的电影视频，人物要真实自然，有流畅的动作" },
                { label: "🗣️ 带对白", text: "分镜图中有对白文字，请让人物自然地说话，嘴唇动作配合表情" },
                { label: "✨ 动态场景", text: "让画面中的元素都动起来：头发飘动、衣服摆动、光影变化、环境粒子" },
                { label: "🎭 情绪表演", text: "注重人物的表情变化和情绪演绎，从细微的眼神到明显的情绪转变" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setPrompt(item.text);
                    data.prompt = item.text;
                  }}
                  className="text-[9px] px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {connectedImagesCount > 0 && (
          <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-md border border-orange-100 dark:border-orange-900/30 flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            图生视频模式已启用
          </div>
        )}

        {/* AI Analysis Display - 支持 Veo 和 Sora */}
        {(isAnalyzing || analysisText) && (
          <div className={`relative overflow-hidden rounded-xl border ${
            isVeoModel
              ? "border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-purple-950/30 dark:via-pink-950/20 dark:to-blue-950/30"
              : "border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-yellow-950/30"
          }`}>
            {/* Animated Background */}
            <div className={`absolute inset-0 ${
              isVeoModel
                ? "bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-blue-500/5"
                : "bg-gradient-to-r from-orange-500/5 via-amber-500/5 to-yellow-500/5"
            } animate-pulse`} />

            {/* Header */}
            <div className={`relative px-3 py-2 border-b ${
              isVeoModel
                ? "border-purple-100 dark:border-purple-900/50"
                : "border-orange-100 dark:border-orange-900/50"
            } flex items-center gap-2`}>
              <div className="relative">
                <Eye className={`w-4 h-4 ${
                  isVeoModel
                    ? "text-purple-600 dark:text-purple-400"
                    : "text-orange-600 dark:text-orange-400"
                }`} />
                {isAnalyzing && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className={`text-[11px] font-bold bg-clip-text text-transparent ${
                isVeoModel
                  ? "bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600"
                  : "bg-gradient-to-r from-orange-600 via-amber-600 to-yellow-600"
              }`}>
                {currentStep || (isVeoModel ? "Claude Vision 分析中" : "AI 分镜分析中")}
              </span>
            </div>

            {/* Content */}
            <div
              ref={analysisRef}
              className={`relative p-3 max-h-[150px] overflow-y-auto scrollbar-thin ${
                isVeoModel
                  ? "scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800"
                  : "scrollbar-thumb-orange-200 dark:scrollbar-thumb-orange-800"
              }`}
            >
              <div className={`text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300 prose prose-xs ${
                isVeoModel ? "prose-purple" : "prose-orange"
              } dark:prose-invert max-w-none`}>
                <ReactMarkdown>{analysisText}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </GeneratorNodeLayout>
  );
};

export default memo(VideoGenNode);
