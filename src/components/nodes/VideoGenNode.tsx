"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Video as VideoIcon, Link2, UserPlus, Sparkles, Eye } from "lucide-react";
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

  // Veo Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const analysisRef = useRef<HTMLDivElement>(null);

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
        addVideoNode(
          result.taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y },
          { apiSource: result.apiSource, model }
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

  // Override hook's onSuccess to handle Sora's missing apiSource
  // Or better: just use the promise return from generate() for Sora
  const onGenerateSora = async () => {
    const connectedNodes = getConnectedImageNodes(id);
    const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

    // 将数字时长转换为字符串（Sora 2 API 要求字符串格式）
    const durationStr = String(durationSeconds) as "4" | "8" | "12";

    const result = await generate({
      apiPath: "/api/generate-video",
      body: {
        prompt,
        orientation,
        inputImage,
        durationSeconds: durationStr, // 传递时长参数
      }
    });

    if (result) {
      const currentNode = getNode(id);
      if (currentNode) {
        addVideoNode(
          result.taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y },
          { apiSource: "sora", model }
        );
      }
    }
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
        {/* 模型选择 */}
        <div className="space-y-1.5">
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
        </div>

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
              : "描述视频场景..."
            }
          />
        </div>

        {connectedImagesCount > 0 && (
          <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-md border border-orange-100 dark:border-orange-900/30 flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            图生视频模式已启用
          </div>
        )}

        {/* Veo Analysis Display */}
        {isVeoModel && (isAnalyzing || analysisText) && (
          <div className="relative overflow-hidden rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-purple-950/30 dark:via-pink-950/20 dark:to-blue-950/30">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-blue-500/5 animate-pulse" />
            
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
            </div>

            {/* Content */}
            <div
              ref={analysisRef}
              className="relative p-3 max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800"
            >
              <div className="text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300 prose prose-xs prose-purple dark:prose-invert max-w-none">
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
