"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore } from "@xyflow/react";
import { rewritePrompt } from "@/app/actions/generate";
import { createImageTask } from "@/app/actions/image-task";
import { type GeminiImageModel, type ImageGenerationConfig, RESOLUTION_OPTIONS } from "@/types/image-gen";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Wand2, Image as ImageIcon, Sparkles, Maximize, Link2 } from "lucide-react";
import { NodeTextarea, NodeSelect, NodeLabel, NodeButton } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";

// Define the data structure for the node
type ImageGenNodeData = {
  prompt: string;
  imageUrl?: string;
  isGenerating: boolean;
};

const ImageGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addImageNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [imageUrl, setImageUrl] = useState(data.imageUrl || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana");
  // Pro 模型默认 auto（不传 aspectRatio），Fast 模型默认 1:1
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || (data.model === "nano-banana-pro" ? "auto" : "1:1"));
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);

  // 使用 ReactFlow store 监听 edges 变化
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  // Update connected images count
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    setConnectedImagesCount(connectedNodes.length);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

  // Handle local prompt change
  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value; // Update node data directly (or use updateNodeData hook if available in context)
  };

  const onRewrite = async () => {
    if (!prompt) return;
    setIsRewriting(true);
    try {
      const newPrompt = await rewritePrompt(prompt);
      setPrompt(newPrompt);
      data.prompt = newPrompt;
    } catch (error) {
      console.error("Failed to rewrite prompt", error);
    } finally {
      setIsRewriting(false);
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      // Get reference images from connected nodes
      const connectedNodes = getConnectedImageNodes(id);
      const referenceImages = connectedNodes.map(node => node.data.imageUrl).filter((url): url is string => typeof url === 'string' && url.length > 0);

      console.log(`Using ${referenceImages.length} reference images from connected nodes`);

      const config: ImageGenerationConfig = {};

      // 如果有参考图，不传 aspectRatio（保持参考图的比例）
      // 如果没有参考图且不是 auto，才传 aspectRatio
      if (referenceImages.length === 0 && aspectRatio !== "auto") {
        config.aspectRatio = aspectRatio as any;
      }

      // imageSize only supported by Pro model
      if (selectedModel === "nano-banana-pro") {
        config.imageSize = imageSize as any;
      }

      // Create image generation task
      const { taskId } = await createImageTask(prompt, selectedModel, config, referenceImages);
      console.log(`Created image task: ${taskId}`);

      // Immediately create an Image node with the task ID
      // 偏移量考虑 ImageGenNode 宽度(300) + 间隙，避免重叠
      const currentNode = getNode(id);
      if (currentNode) {
        addImageNode(
          undefined, // No imageUrl yet
          prompt,
          { x: currentNode.position.x + 380, y: currentNode.position.y },
          taskId, // Pass taskId to the image node
          // 保存生图配置，用于重新生成
          {
            model: selectedModel,
            config,
            referenceImages,
          }
        );
      }
    } catch (error) {
      console.error("Failed to create image task", error);
      alert("Failed to create image task");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseNode
      title="Image Generator"
      icon={ImageIcon}
      color="blue"
      selected={selected}
      className="w-[300px]"
      headerActions={
        connectedImagesCount > 0 ? (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
            <Link2 className="w-3 h-3" />
            {connectedImagesCount} 张参考图
          </span>
        ) : (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
            ← 连接参考图
          </span>
        )
      }
    >
      {/* 左侧输入连接点 - 接收参考图片 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-blue-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-blue-500/50"
        title="连接图片作为参考"
      />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <NodeLabel>Model</NodeLabel>
            <NodeSelect
              value={selectedModel}
              onChange={(e) => {
                const newModel = e.target.value as GeminiImageModel;
                setSelectedModel(newModel);
                // Pro 模型默认 auto，Fast 模型默认 1:1
                if (newModel === "nano-banana-pro" && aspectRatio === "1:1") {
                  setAspectRatio("auto");
                } else if (newModel === "nano-banana" && aspectRatio === "auto") {
                  setAspectRatio("1:1");
                }
              }}
              className="w-full"
            >
              <option value="nano-banana">Fast</option>
              <option value="nano-banana-pro">Pro</option>
            </NodeSelect>
          </div>

          {selectedModel === "nano-banana-pro" && (
            <div>
              <NodeLabel>Resolution</NodeLabel>
              <NodeSelect
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="w-full"
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

        <div>
          <NodeLabel>Aspect Ratio {connectedImagesCount > 0 && <span className="text-neutral-400">(参考图覆盖)</span>}</NodeLabel>
          <NodeSelect
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full"
            disabled={connectedImagesCount > 0}
          >
            <option value="auto">Auto</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </NodeSelect>
        </div>

        <div>
          <NodeLabel>Prompt</NodeLabel>
          <NodeTextarea
            className="w-full resize-none"
            rows={3}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe your image..."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <NodeButton
            variant="secondary"
            onClick={onRewrite}
            disabled={isRewriting || !prompt}
            className="flex-1"
          >
            {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
          </NodeButton>
          <NodeButton
            variant="primary"
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
          </NodeButton>
        </div>
      </div>

    </BaseNode>
  );
};

export default memo(ImageGenNode);

