"use client";

import { memo, useEffect, useState, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useCanvas } from "@/contexts/CanvasContext";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";
import { createImageTask } from "@/app/actions/image-task";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

// Define the data structure for the image node
type ImageNodeData = {
  imageUrl?: string;
  prompt?: string;
  timestamp?: string;
  isLoading?: boolean;
  taskId?: string;
  error?: string;
  label?: string;  // 左上角标签（场景名称）
  userResized?: boolean;  // 用户是否手动调整过尺寸
  // 存储生图配置，用于重新生成
  generationConfig?: {
    model: GeminiImageModel;
    config: ImageGenerationConfig;
    referenceImages?: string[];
  };
};

// 基础宽度和尺寸限制
const BASE_WIDTH = 400;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const MIN_HEIGHT = 150;
const MAX_HEIGHT = 800;

const ImageNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { openImageModal, addImageNode } = useCanvas();
  const { updateNodeData, getNode, setNodes } = useReactFlow();
  // 只有在没有错误、没有图片且 isLoading 为 true 时才显示加载状态
  const isLoading = !data.error && (data.isLoading || (!data.imageUrl && data.taskId));
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoResized = useRef(false); // 避免重复调整尺寸

  // 图片加载完成后根据比例自动调整节点尺寸
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // 如果已经调整过或者节点有自定义尺寸（用户手动调整过），则跳过
    if (hasAutoResized.current || data.userResized) return;

    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (naturalWidth && naturalHeight) {
      const aspectRatio = naturalWidth / naturalHeight;

      // 根据图片比例计算节点尺寸
      let newWidth = BASE_WIDTH;
      let newHeight = BASE_WIDTH / aspectRatio;

      // 限制高度范围
      if (newHeight > MAX_HEIGHT) {
        newHeight = MAX_HEIGHT;
        newWidth = newHeight * aspectRatio;
      }
      if (newHeight < MIN_HEIGHT) {
        newHeight = MIN_HEIGHT;
        newWidth = newHeight * aspectRatio;
      }

      // 限制宽度范围
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      newHeight = newWidth / aspectRatio;

      // 更新节点尺寸
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                style: {
                  ...node.style,
                  width: Math.round(newWidth),
                  height: Math.round(newHeight),
                },
              }
            : node
        )
      );

      hasAutoResized.current = true;
      console.log(`[ImageNode ${id}] Auto-resized to ${Math.round(newWidth)}x${Math.round(newHeight)} (ratio: ${aspectRatio.toFixed(2)})`);
    }
  }, [id, setNodes, data.userResized]);

  // 当图片 URL 变化时重置自动调整标记
  useEffect(() => {
    hasAutoResized.current = false;
  }, [data.imageUrl]);

  // 重新生成图片 - 创建新节点
  const handleRegenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发图片点击

    if (!data.prompt || !data.generationConfig) {
      console.warn("[ImageNode] Cannot regenerate: missing prompt or config");
      return;
    }

    setIsRegenerating(true);

    try {
      const { model, config, referenceImages } = data.generationConfig;

      // 创建新任务
      const { taskId } = await createImageTask(
        data.prompt,
        model as GeminiImageModel,
        config,
        referenceImages || []
      );

      // 获取当前节点位置，在右边创建新节点
      const currentNode = getNode(id);
      if (currentNode) {
        // 偏移量考虑当前节点宽度 + 间隙，避免重叠
        const currentWidth = (currentNode.style?.width as number) || BASE_WIDTH;
        addImageNode(
          undefined,
          data.prompt,
          { x: currentNode.position.x + currentWidth + 50, y: currentNode.position.y },
          taskId,
          data.generationConfig
        );
      }

      console.log(`[ImageNode ${id}] Created new node with task ${taskId}`);
    } catch (error) {
      console.error("[ImageNode] Regeneration failed:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [data.prompt, data.generationConfig, id, getNode, addImageNode]);

  // 轮询任务状态
  useEffect(() => {
    // 如果已经有图片URL，不需要轮询
    if (data.imageUrl) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // 如果有 taskId，开始轮询
    if (data.taskId) {
      console.log(`[ImageNode ${id}] Starting polling for task ${data.taskId}`);

      const pollTaskStatus = async () => {
        try {
          const response = await fetch(`/api/image-task?taskId=${data.taskId}`);
          const result = await response.json();

          // 处理 HTTP 错误（404 任务不存在，500 服务器错误）
          if (!response.ok) {
            const errorMsg = response.status === 404
              ? "任务不存在（服务可能已重启）"
              : result.error || `请求失败 (${response.status})`;
            console.error(`[ImageNode ${id}] Task error: ${errorMsg}`);
            updateNodeData(id, {
              isLoading: false,
              error: errorMsg,
            });
            // 停止轮询
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            return;
          }

          const task = result;
          console.log(`[ImageNode ${id}] Task status: ${task.status}`);
          setPollingStatus(task.status);

          if (task.status === "completed" && task.imageUrl) {
            // 任务完成，更新节点数据
            console.log(`[ImageNode ${id}] Task completed, updating node with image URL`);
            updateNodeData(id, {
              imageUrl: task.imageUrl,
              isLoading: false,
              timestamp: new Date().toLocaleString(),
            });

            // 停止轮询
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else if (task.status === "failed") {
            // 任务失败
            console.error(`[ImageNode ${id}] Task failed: ${task.error}`);
            updateNodeData(id, {
              isLoading: false,
              error: task.error,
            });

            // 停止轮询
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error(`[ImageNode ${id}] Error polling task status:`, error);
        }
      };

      // 立即执行一次
      pollTaskStatus();

      // 每 5 秒轮询一次
      pollingIntervalRef.current = setInterval(pollTaskStatus, 5000);
    }

    // 清理函数
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [data.taskId, data.imageUrl, id, updateNodeData]);

  const handleImageClick = () => {
    if (!isLoading && data.imageUrl) {
      openImageModal(data.imageUrl, data.prompt);
    }
  };

  return (
    <div className="w-full h-full relative">
        {/* NodeResizer 必须放在节点最外层才能正常工作 */}
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          maxWidth={MAX_WIDTH}
          maxHeight={MAX_HEIGHT}
          keepAspectRatio={true}
          lineClassName="!border-blue-400/50 !border-[1.5px]"
          handleClassName="!w-2 !h-2 !bg-blue-500 !border !border-white !rounded-full !shadow-sm"
          onResizeEnd={() => {
            // 用户手动调整尺寸后，标记为已自定义
            updateNodeData(id, { userResized: true });
          }}
        />

        {/* 节点外部上方的手绘标签 */}
        {data.label && (
          <div className="absolute -top-7 left-0 z-10">
            <span className="handwriting-label text-xl text-neutral-700 dark:text-neutral-300">
              {data.label}
            </span>
          </div>
        )}

        <BaseNode
          title="Generated Image"
          icon={ImageIcon}
          color="blue"
          selected={selected}
          className="w-full h-full min-w-[200px] min-h-[200px] flex flex-col p-0 !border-0 !bg-transparent !shadow-none"
          contentClassName="p-0 flex flex-col h-full"
          hideHeader={true}
        >
        <div className={cn(
          "flex-1 flex flex-col p-0 relative group overflow-hidden rounded-[2rem] shadow-md bg-white dark:bg-neutral-950 h-full will-change-transform transform-gpu [contain:layout_style_paint]",
          !isLoading && "border-2 border-blue-100 dark:border-blue-900/30"
        )}>
          {/* 生成中的旋转渐变边框动效 */}
          {isLoading && (
            <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none z-20">
              <div
                className="absolute inset-[-3px] animate-spin-slow"
                style={{
                  background: "conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6)",
                  animationDuration: "2.5s"
                }}
              />
              <div className="absolute inset-[3px] rounded-[calc(2rem-3px)] bg-neutral-100 dark:bg-neutral-900" />
            </div>
          )}

          <div className="relative flex-1 min-h-[150px] h-full">
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-900 relative overflow-hidden rounded-[calc(2rem-3px)]">
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                {/* 动态光斑 */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-400/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "500ms" }} />

                <div className="relative z-10 flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 blur-2xl opacity-30 animate-pulse scale-150" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-pulse">
                      {pollingStatus === "processing" ? "生成中..." : pollingStatus === "pending" ? "排队中..." : "准备中..."}
                    </span>
                    {data.taskId && (
                      <span className="text-[10px] text-neutral-400 font-mono px-2 py-0.5 rounded-full bg-neutral-200/50 dark:bg-neutral-800/50">
                        {data.taskId.substring(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : data.error ? (
              <div className="w-full h-full bg-red-50 dark:bg-red-900/10 flex flex-col items-center justify-center p-4">
                <span className="text-xs font-medium text-red-500 dark:text-red-400 text-center">{data.error}</span>
              </div>
            ) : (
              <>
                <img
                  src={data.imageUrl}
                  alt="Generated"
                  className="w-full h-full object-contain bg-neutral-50 dark:bg-neutral-900"
                  loading="lazy"
                  onLoad={handleImageLoad}
                />

                {/* 悬停遮罩和放大按钮 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick();
                    }}
                    className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg pointer-events-auto cursor-pointer"
                    title="查看大图"
                  >
                    <ExternalLink className="w-5 h-5 text-neutral-900" />
                  </button>
                </div>

                {/* 重新生成按钮 - 右上角 */}
                {data.generationConfig && (
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className={cn(
                      "absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 z-10",
                      "bg-white/90 hover:bg-white shadow-lg",
                      "opacity-0 group-hover:opacity-100",
                      isRegenerating && "cursor-not-allowed"
                    )}
                    title="重新生成"
                  >
                    <RefreshCw className={cn(
                      "w-4 h-4 text-blue-600",
                      isRegenerating && "animate-spin"
                    )} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer info overlay */}
          {!isLoading && !data.error && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
               {data.timestamp && (
                <div className="text-[10px] text-white/90 text-center font-medium">
                  {data.timestamp}
                </div>
              )}
            </div>
          )}

          {/* 右侧连接提示 - 当图片加载完成后显示 */}
          {!isLoading && !data.error && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10">
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-lg whitespace-nowrap animate-pulse">
                拖拽 →
              </div>
            </div>
          )}
        </div>

        {/* 右侧输出连接点 - 用于连接到生成器作为参考图 */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="w-4 h-4 !bg-gradient-to-r !from-blue-500 !to-purple-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-purple-500/50"
          title="拖拽连接到生成器作为参考图"
        />
        </BaseNode>
      </div>
  );
};

export default memo(ImageNode);

