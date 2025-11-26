"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Sparkles, Link2 } from "lucide-react";
import { NodeTextarea, NodeSelect, NodeLabel, NodeButton, NodeInput } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";

type VeoGenNodeData = {
  prompt: string;
  aspectRatio: "16:9" | "9:16";
  durationSeconds: number;
  negativePrompt: string;
  isGenerating: boolean;
};

const VeoGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addVideoNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">(data.aspectRatio || "16:9");
  const [durationSeconds, setDurationSeconds] = useState<number>(data.durationSeconds || 8);
  const [negativePrompt, setNegativePrompt] = useState(data.negativePrompt || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);

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

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      // 获取连接的图片节点（用于图生视频）
      const connectedNodes = getConnectedImageNodes(id);
      const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

      if (inputImage) {
        console.log(`[Veo] Using input image for image-to-video: ${inputImage}`);
      }

      // 创建 Veo 视频生成任务
      const response = await fetch("/api/generate-veo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          resolution: "720p",
          durationSeconds,
          negativePrompt: negativePrompt || undefined,
          inputImage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create Veo task");
      }

      const { taskId } = await response.json();
      console.log(`[Veo] Created task: ${taskId}`);

      // 立即创建一个 Video 节点，传入 taskId（复用现有的 VideoNode）
      const currentNode = getNode(id);
      if (currentNode) {
        addVideoNode(
          taskId,
          prompt,
          { x: currentNode.position.x + 380, y: currentNode.position.y },
        );
      }
    } catch (error) {
      console.error("Failed to create Veo task", error);
      alert("Failed to create Veo video task");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseNode
      title="Veo 3.1 Fast"
      icon={Sparkles}
      color="orange"
      selected={selected}
      className="w-[340px]"
      headerActions={
        connectedImagesCount > 0 ? (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
            <Link2 className="w-3 h-3" />
            Image-to-Video
          </span>
        ) : (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
            Text-to-Video
          </span>
        )
      }
    >
      {/* 左侧输入连接点 - 接收参考图片用于图生视频 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-cyan-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-cyan-500/50"
        title="连接图片作为参考 (图生视频)"
      />

      <div className="space-y-3">
        {/* Aspect Ratio & Duration */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <NodeLabel>Aspect Ratio</NodeLabel>
            <NodeSelect
              value={aspectRatio}
              onChange={(e) => {
                const val = e.target.value as "16:9" | "9:16";
                setAspectRatio(val);
                data.aspectRatio = val;
              }}
              className="w-full"
            >
              <option value="16:9">Landscape (16:9)</option>
              <option value="9:16">Portrait (9:16)</option>
            </NodeSelect>
          </div>
          <div>
            <NodeLabel>Duration</NodeLabel>
            <NodeSelect
              value={durationSeconds}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setDurationSeconds(val);
                data.durationSeconds = val;
              }}
              className="w-full"
            >
              <option value={5}>5 seconds</option>
              <option value={6}>6 seconds</option>
              <option value={7}>7 seconds</option>
              <option value={8}>8 seconds</option>
            </NodeSelect>
          </div>
        </div>

        {/* Prompt */}
        <div>
          <NodeLabel>Prompt</NodeLabel>
          <NodeTextarea
            ref={promptRef}
            className="w-full resize-none focus:border-cyan-500 focus:ring-cyan-500/20"
            rows={4}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe the video scene in detail..."
          />
        </div>

        {/* Negative Prompt */}
        <div>
          <NodeLabel>Negative Prompt (optional)</NodeLabel>
          <NodeInput
            className="w-full focus:border-cyan-500 focus:ring-cyan-500/20"
            value={negativePrompt}
            onChange={(e) => {
              setNegativePrompt(e.target.value);
              data.negativePrompt = e.target.value;
            }}
            placeholder="What to avoid..."
          />
        </div>

        {connectedImagesCount > 0 && (
          <div className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 rounded-md border border-cyan-100 dark:border-cyan-900/30 flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            Image-to-video mode: {connectedImagesCount} image(s) connected
          </div>
        )}

        {/* Model Info */}
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 rounded-md">
          <span className="font-medium">Model:</span> veo-3.1-fast-generate-preview
          <br />
          <span className="font-medium">Resolution:</span> 720p
        </div>

        <div className="pt-1">
          <NodeButton
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generate with Veo
              </>
            )}
          </NodeButton>
        </div>
      </div>
    </BaseNode>
  );
};

export default memo(VeoGenNode);
