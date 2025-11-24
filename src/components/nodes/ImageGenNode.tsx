"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { rewritePrompt } from "@/app/actions/generate";
import { createImageTask } from "@/app/actions/image-task";
import { type GeminiImageModel, type ImageGenerationConfig, RESOLUTION_OPTIONS } from "@/types/image-gen";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Wand2, Image as ImageIcon, Sparkles, Maximize, Link2 } from "lucide-react";
import { NodeTextarea } from "@/components/NodeInputs";

// Define the data structure for the node
type ImageGenNodeData = {
  prompt: string;
  imageUrl?: string;
  isGenerating: boolean;
};

const ImageGenNode = ({ data, id, isConnectable }: NodeProps<any>) => {
  const { addImageNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [imageUrl, setImageUrl] = useState(data.imageUrl || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana");
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || "1:1");
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);

  // Update connected images count
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    setConnectedImagesCount(connectedNodes.length);
  }, [id, getConnectedImageNodes]);

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
      const config: ImageGenerationConfig = {
        aspectRatio: aspectRatio as any,
      };

      // imageSize only supported by Pro model
      if (selectedModel === "nano-banana-pro") {
        config.imageSize = imageSize as any;
      }

      // Get reference images from connected nodes
      const connectedNodes = getConnectedImageNodes(id);
      const referenceImages = connectedNodes.map(node => node.data.imageUrl).filter((url): url is string => typeof url === 'string' && url.length > 0);

      console.log(`Using ${referenceImages.length} reference images from connected nodes`);

      // Create image generation task
      const { taskId } = await createImageTask(prompt, selectedModel, config, referenceImages);
      console.log(`Created image task: ${taskId}`);

      // Immediately create an Image node with the task ID
      const currentNode = getNode(id);
      if (currentNode) {
        addImageNode(
          undefined, // No imageUrl yet
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y },
          taskId // Pass taskId to the image node
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
    <div className="nowheel bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded w-[300px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-blue-500 !border-0"
      />

      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          Generator
        </span>
        {connectedImagesCount > 0 && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            {connectedImagesCount}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Model</label>
            <select
              className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-blue-500"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as GeminiImageModel)}
            >
              <option value="nano-banana">Fast</option>
              <option value="nano-banana-pro">Pro</option>
            </select>
          </div>

          {selectedModel === "nano-banana-pro" && (
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Resolution</label>
              <select
                className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-blue-500"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
              >
                {Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => (
                  <option key={key} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Aspect Ratio</label>
          <select
            className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-blue-500"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Prompt</label>
          <NodeTextarea
            className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 resize-none focus:outline-none focus:border-blue-500"
            rows={3}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe your image..."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onRewrite}
            disabled={isRewriting || !prompt}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-750 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
          </button>
          <button
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="flex-[2] flex items-center justify-center gap-1 text-xs bg-blue-600 dark:bg-blue-600 text-white hover:bg-blue-700 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-blue-500 !border-0"
      />
    </div>
  );
};

export default memo(ImageGenNode);

