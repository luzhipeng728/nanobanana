"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore, addEdge } from "@xyflow/react";
import { rewritePrompt } from "@/app/actions/generate";
import { createImageTask } from "@/app/actions/image-task";
import { type GeminiImageModel, type ImageGenerationConfig, RESOLUTION_OPTIONS } from "@/types/image-gen";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Wand2, Image as ImageIcon, Link2 } from "lucide-react";
import { NodeTextarea, NodeLabel, NodeButton, NodeTabSelect } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";
import { cn } from "@/lib/utils";
import { useTaskGeneration } from "@/hooks/useTaskGeneration";

// Define the data structure for the node
type ImageGenNodeData = {
  prompt: string;
  imageUrl?: string;
  isGenerating: boolean;
  model?: GeminiImageModel;
  aspectRatio?: string;
  imageSize?: string;
};

const ImageGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addImageNode, getConnectedImageNodes } = useCanvas();
  const { getNode, setNodes, setEdges } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana");
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || (data.model === "nano-banana-pro" ? "auto" : "1:1"));
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);

  // Rewrite Prompt Hook
  const { isGenerating: isRewriting, generate: rewrite } = useTaskGeneration<string>({
    onSuccess: (newPrompt) => {
      setPrompt(newPrompt);
      data.prompt = newPrompt;
    }
  });

  // Generate Image Hook (using Server Action wrapper)
  const { isGenerating, generate } = useTaskGeneration({
    onSuccess: (result) => {
      console.log(`Created image task: ${result.taskId}`);
      const currentNode = getNode(id);
      if (currentNode) {
        addImageNode(
          undefined,
          prompt,
          { x: currentNode.position.x + 380, y: currentNode.position.y },
          result.taskId,
          {
            model: selectedModel,
            config: result.config,
            referenceImages: result.referenceImages,
          }
        );
      }
    }
  });

  // 触摸设备支持
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode, setOnConnectionComplete } = useTouchContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

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

  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

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

  const onRewrite = () => {
    if (!prompt) return;
    rewrite({
      action: async () => {
        return await rewritePrompt(prompt);
      }
    });
  };

  const onGenerate = () => {
    if (!prompt) return;
    
    generate({
      action: async () => {
        // Get connected images logic (same as before)
        const connectedNodes = getConnectedImageNodes(id);
        const referenceImages: string[] = [];
        let hasMarkers = false;

        connectedNodes.forEach(node => {
          const nodeData = node.data as { imageUrl?: string; markerData?: { markedImageUrl?: string; marks?: unknown[]; arrows?: unknown[] } };
          const imageUrl = nodeData.imageUrl;
          const markerData = nodeData.markerData;

          if (typeof imageUrl === 'string' && imageUrl.length > 0) {
            referenceImages.push(imageUrl);
            const marksCount = markerData?.marks?.length || 0;
            const arrowsCount = markerData?.arrows?.length || 0;
            if (markerData?.markedImageUrl && (marksCount > 0 || arrowsCount > 0)) {
              referenceImages.push(markerData.markedImageUrl);
              hasMarkers = true;
            }
          }
        });

        let finalPrompt = prompt;
        if (hasMarkers) {
          const markerExclusionInstruction = `[CRITICAL INSTRUCTION - MUST FOLLOW]
The reference image contains RED CIRCLES with WHITE NUMBERS (①②③...) as position markers for reference only.
These markers are NOT part of the actual image content.
YOU MUST NOT include any of the following in the generated image:
- Red circles or dots
- Numbers or digits (1, 2, 3, ①, ②, ③, etc.)
- Any circular markers or annotations
- Any text overlays or labels
Generate a CLEAN image as if the markers do not exist.
[END OF CRITICAL INSTRUCTION]

`;
          finalPrompt = markerExclusionInstruction + prompt;
        }

        const config: ImageGenerationConfig = {};
        if (referenceImages.length === 0 && aspectRatio !== "auto") {
          config.aspectRatio = aspectRatio as any;
        }
        if (selectedModel === "nano-banana-pro") {
          config.imageSize = imageSize as any;
        }

        // Call Server Action
        const { taskId } = await createImageTask(finalPrompt, selectedModel, config, referenceImages);
        return { taskId, config, referenceImages };
      }
    });
  };

  return (
    <div
      className={cn(
        "touch-node-wrapper",
        connectMode.isActive && connectMode.sourceNodeId !== id && "ring-2 ring-blue-400 ring-offset-2 rounded-2xl"
      )}
    >
      <GeneratorNodeLayout
        title="Image Generator"
        icon={ImageIcon}
        color="blue"
        selected={selected}
        className="w-[300px]"
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        generateButtonText="生成"
        generateButtonDisabled={!prompt}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
        footerActions={
          <NodeButton
            variant="secondary"
            onClick={onRewrite}
            disabled={isRewriting || !prompt}
            className="flex-1"
          >
            {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            优化
          </NodeButton>
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
          {/* 模型选择 */}
          <div className="space-y-1.5">
            <NodeLabel>模型</NodeLabel>
            <NodeTabSelect
              value={selectedModel}
              onChange={(val) => {
                const newModel = val as GeminiImageModel;
                setSelectedModel(newModel);
                if (newModel === "nano-banana-pro" && aspectRatio === "1:1") {
                  setAspectRatio("auto");
                } else if (newModel === "nano-banana" && aspectRatio === "auto") {
                  setAspectRatio("1:1");
                }
                data.model = newModel;
              }}
              options={[
                { value: "nano-banana", label: "快速" },
                { value: "nano-banana-pro", label: "高级" },
              ]}
              color="blue"
            />
          </div>

          {/* 分辨率 */}
          {selectedModel === "nano-banana-pro" && (
            <div className="space-y-1.5">
              <NodeLabel>分辨率</NodeLabel>
              <NodeTabSelect
                value={imageSize}
                onChange={(val) => {
                  setImageSize(val);
                  data.imageSize = val;
                }}
                options={Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => ({
                  value: option.value,
                  label: option.label,
                }))}
                color="blue"
                size="sm"
              />
            </div>
          )}

          {/* 画面比例 */}
          <div className="space-y-1.5">
            <NodeLabel>画面比例 {connectedImagesCount > 0 && <span className="text-neutral-400">(参考图覆盖)</span>}</NodeLabel>
            <NodeTabSelect
              value={aspectRatio}
              onChange={(val) => {
                setAspectRatio(val);
                data.aspectRatio = val;
              }}
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
        </div>
      </GeneratorNodeLayout>
    </div>
  );
};

export default memo(ImageGenNode);
