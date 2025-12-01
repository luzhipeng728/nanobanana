"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore, addEdge } from "@xyflow/react";
import { rewritePrompt } from "@/app/actions/generate";
import { createImageTask } from "@/app/actions/image-task";
import { type GeminiImageModel, type ImageGenerationConfig, RESOLUTION_OPTIONS } from "@/types/image-gen";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Wand2, Image as ImageIcon, Sparkles, Maximize, Link2 } from "lucide-react";
import { NodeTextarea, NodeSelect, NodeLabel, NodeButton, NodeTabSelect } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";
import { cn } from "@/lib/utils";

// Define the data structure for the node
type ImageGenNodeData = {
  prompt: string;
  imageUrl?: string;
  isGenerating: boolean;
};

const ImageGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addImageNode, getConnectedImageNodes } = useCanvas();
  const { getNode, setNodes, setEdges } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [imageUrl, setImageUrl] = useState(data.imageUrl || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana");
  // Pro 模型默认 auto（不传 aspectRatio），Fast 模型默认 1:1
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || (data.model === "nano-banana-pro" ? "auto" : "1:1"));
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);

  // 触摸设备长按菜单支持
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode, setOnConnectionComplete } = useTouchContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

  // 设置连线完成回调
  useEffect(() => {
    setOnConnectionComplete((sourceId: string, targetId: string) => {
      setEdges((eds) => addEdge({
        id: `edge-${sourceId}-${targetId}-${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      }, eds));
    });
  }, [setOnConnectionComplete, setEdges]);

  // 删除当前节点
  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  // 长按处理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;
    if (connectMode.isActive && connectMode.sourceNodeId !== id) {
      e.preventDefault();
      e.stopPropagation();
      completeConnection(id);
      return;
    }
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      const options = createNodeMenuOptions(id, {
        onDelete: handleDeleteNode,
        onConnect: () => startConnectMode(id),
      });
      showMenu({ x: touch.clientX, y: touch.clientY }, id, options);
    }, 500);
  }, [isTouchDevice, connectMode, id, completeConnection, handleDeleteNode, startConnectMode, showMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.current.x, 2) +
      Math.pow(touch.clientY - touchStartPos.current.y, 2)
    );
    if (distance > 10 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    touchStartPos.current = null;
  }, []);

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
      // If a node has SoM markers, include both original and marked images
      const connectedNodes = getConnectedImageNodes(id);
      const referenceImages: string[] = [];
      let hasMarkers = false; // 是否有带标记的图片

      connectedNodes.forEach(node => {
        const nodeData = node.data as { imageUrl?: string; markerData?: { markedImageUrl?: string; marks?: unknown[]; arrows?: unknown[] } };
        const imageUrl = nodeData.imageUrl;
        const markerData = nodeData.markerData;

        if (typeof imageUrl === 'string' && imageUrl.length > 0) {
          // Always include the original image
          referenceImages.push(imageUrl);

          // If there are SoM markers, also include the marked image
          const marksCount = markerData?.marks?.length || 0;
          const arrowsCount = markerData?.arrows?.length || 0;
          if (markerData?.markedImageUrl && (marksCount > 0 || arrowsCount > 0)) {
            referenceImages.push(markerData.markedImageUrl);
            hasMarkers = true;
            console.log(`[ImageGenNode] Including marked image with ${marksCount} marks, ${arrowsCount} arrows`);
          }
        }
      });

      console.log(`Using ${referenceImages.length} reference images from connected nodes (including marked images)`);

      // 如果有带标记的图片，在 prompt 后面加上提示，让模型不要在生成的图片中出现标记
      let finalPrompt = prompt;
      if (hasMarkers) {
        finalPrompt = `${prompt}\n\n[Important: The reference image contains numbered markers (circles with numbers) and/or directional arrows for reference only. Do NOT include any markers, numbers, circles, or arrows in the generated image. Generate a clean image without any annotations.]`;
        console.log(`[ImageGenNode] Added marker exclusion instruction to prompt`);
      }

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
      const { taskId } = await createImageTask(finalPrompt, selectedModel, config, referenceImages);
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
    <div
      className={cn(
        "touch-node-wrapper",
        connectMode.isActive && connectMode.sourceNodeId !== id && "ring-2 ring-blue-400 ring-offset-2 rounded-2xl"
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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
        {/* 模型选择 - Tab 样式 */}
        <div className="space-y-1.5">
          <NodeLabel>模型</NodeLabel>
          <NodeTabSelect
            value={selectedModel}
            onChange={(val) => {
              const newModel = val as GeminiImageModel;
              setSelectedModel(newModel);
              // Pro 模型默认 auto，Fast 模型默认 1:1
              if (newModel === "nano-banana-pro" && aspectRatio === "1:1") {
                setAspectRatio("auto");
              } else if (newModel === "nano-banana" && aspectRatio === "auto") {
                setAspectRatio("1:1");
              }
            }}
            options={[
              { value: "nano-banana", label: "快速" },
              { value: "nano-banana-pro", label: "高级" },
            ]}
            color="blue"
          />
        </div>

        {/* 分辨率 - Pro 模型时显示 - Tab 样式 */}
        {selectedModel === "nano-banana-pro" && (
          <div className="space-y-1.5">
            <NodeLabel>分辨率</NodeLabel>
            <NodeTabSelect
              value={imageSize}
              onChange={setImageSize}
              options={Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => ({
                value: option.value,
                label: option.label,
              }))}
              color="blue"
              size="sm"
            />
          </div>
        )}

        {/* 画面比例 - Tab 样式 */}
        <div className="space-y-1.5">
          <NodeLabel>画面比例 {connectedImagesCount > 0 && <span className="text-neutral-400">(参考图覆盖)</span>}</NodeLabel>
          <NodeTabSelect
            value={aspectRatio}
            onChange={setAspectRatio}
            options={[
              { value: "auto", label: "自动" },
              { value: "1:1", label: "方形" },
              { value: "16:9", label: "横屏" },
              { value: "9:16", label: "竖屏" },
              { value: "4:3", label: "4:3" },
              { value: "3:4", label: "3:4" },
            ]}
            disabled={connectedImagesCount > 0}
            color="blue"
            size="sm"
          />
        </div>

        <div>
          <NodeLabel>提示词</NodeLabel>
          <NodeTextarea
            className="w-full resize-none"
            rows={3}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="描述你想要生成的图片..."
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
            优化
          </NodeButton>
          <NodeButton
            variant="primary"
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : "生成"}
          </NodeButton>
        </div>
      </div>

    </BaseNode>
    </div>
  );
};

export default memo(ImageGenNode);

