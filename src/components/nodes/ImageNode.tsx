"use client";

import { memo, useEffect, useState, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow, addEdge } from "@xyflow/react";
import { Image as ImageIcon, ExternalLink, Loader2, RefreshCw, Check } from "lucide-react";
import { useCanvas } from "@/contexts/CanvasContext";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";
import { createImageTask } from "@/app/actions/image-task";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";

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
const MIN_WIDTH = 150;
const MIN_HEIGHT = 100;
// 不限制最大尺寸，让用户自由调整

// Cloudflare Image Resizing - 生成缩略图 URL（先加载小图，再加载大图）
function getThumbnailUrl(url: string, width: number = 400): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=${width},quality=75${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

// 获取完整图片 URL（高质量）
function getFullImageUrl(url: string): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      // 使用较高质量，但限制最大宽度避免过大
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=1200,quality=85${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

const ImageNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { openImageModal, addImageNode, slideshowMode, slideshowSelections, toggleSlideshowSelection } = useCanvas();
  const { updateNodeData, getNode, setNodes, setEdges } = useReactFlow();
  // 只有在没有错误、没有图片且 isLoading 为 true 时才显示加载状态
  const isLoading = !data.error && (data.isLoading || (!data.imageUrl && data.taskId));
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoResized = useRef(false); // 避免重复调整尺寸

  // 渐进式图片加载状态
  const [imageLoaded, setImageLoaded] = useState(false); // 完整图片是否加载完成
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false); // 缩略图是否加载完成

  // 触摸设备长按菜单支持
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode, setOnConnectionComplete } = useTouchContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

  // 设置连线完成回调
  useEffect(() => {
    setOnConnectionComplete((sourceId: string, targetId: string) => {
      // 创建从 source 到 target 的边
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

  // 长按开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;

    // 如果在连线模式，点击即完成连接
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

      // 震动反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // 显示上下文菜单
      const options = createNodeMenuOptions(id, {
        onDelete: handleDeleteNode,
        onConnect: () => startConnectMode(id),
      });

      showMenu({ x: touch.clientX, y: touch.clientY }, id, options);
    }, 500);
  }, [isTouchDevice, connectMode, id, completeConnection, handleDeleteNode, startConnectMode, showMenu]);

  // 长按移动 - 取消长按
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;

    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.current.x, 2) +
      Math.pow(touch.clientY - touchStartPos.current.y, 2)
    );

    // 移动超过 10px 取消长按
    if (distance > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  // 长按结束
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // 如果是长按触发的，阻止后续事件
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    touchStartPos.current = null;
  }, []);

  // 图片加载完成后根据比例自动调整节点尺寸
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // 如果已经调整过或者节点有自定义尺寸（用户手动调整过），则跳过
    if (hasAutoResized.current || data.userResized) return;

    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (naturalWidth && naturalHeight) {
      const aspectRatio = naturalWidth / naturalHeight;

      // 根据图片比例计算节点尺寸（初始尺寸基于 BASE_WIDTH）
      let newWidth = BASE_WIDTH;
      let newHeight = BASE_WIDTH / aspectRatio;

      // 只限制最小尺寸，不限制最大尺寸
      if (newHeight < MIN_HEIGHT) {
        newHeight = MIN_HEIGHT;
        newWidth = newHeight * aspectRatio;
      }
      if (newWidth < MIN_WIDTH) {
        newWidth = MIN_WIDTH;
        newHeight = newWidth / aspectRatio;
      }

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

  // 当图片 URL 变化时重置状态
  useEffect(() => {
    hasAutoResized.current = false;
    setImageLoaded(false);
    setThumbnailLoaded(false);
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
    <div
      className={cn(
        "w-full h-full relative",
        // 连线模式下的视觉反馈
        connectMode.isActive && connectMode.sourceNodeId !== id && "ring-2 ring-blue-400 ring-offset-2 rounded-2xl cursor-pointer"
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
        {/* NodeResizer 必须放在节点最外层才能正常工作 */}
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
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
          {/* 生成中的金属光线旋转边框动效 */}
          {isLoading && (
            <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none z-0">
              {/* 金属光线发光层 */}
              <div className="metallic-border-glow rounded-[2rem]" />
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
                {/* 渐进式图片加载：先显示缩略图，再加载完整图 */}
                <div className="relative w-full h-full">
                  {/* 缩略图层（小尺寸，快速加载） */}
                  <img
                    src={getThumbnailUrl(data.imageUrl, 200)}
                    alt="Thumbnail"
                    className={cn(
                      "absolute inset-0 w-full h-full object-contain bg-neutral-50 dark:bg-neutral-900 transition-opacity duration-300",
                      imageLoaded ? "opacity-0" : "opacity-100"
                    )}
                    loading="eager"
                    onLoad={() => setThumbnailLoaded(true)}
                  />
                  {/* 完整图层（高质量，延迟加载） */}
                  <img
                    src={getFullImageUrl(data.imageUrl)}
                    alt="Generated"
                    className={cn(
                      "absolute inset-0 w-full h-full object-contain bg-neutral-50 dark:bg-neutral-900 transition-opacity duration-500",
                      imageLoaded ? "opacity-100" : "opacity-0"
                    )}
                    loading="lazy"
                    onLoad={(e) => {
                      setImageLoaded(true);
                      handleImageLoad(e);
                    }}
                  />
                  {/* 加载指示器（缩略图还没加载完时显示） */}
                  {!thumbnailLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
                      <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                    </div>
                  )}
                </div>

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
                {data.generationConfig && !slideshowMode && (
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

                {/* 幻灯片选择按钮 - 左上角 */}
                {slideshowMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlideshowSelection(id);
                    }}
                    className={cn(
                      "absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 z-20",
                      "shadow-lg border-2",
                      slideshowSelections.has(id)
                        ? "bg-green-500 border-green-400 text-white"
                        : "bg-white/90 hover:bg-white border-neutral-300 text-neutral-600"
                    )}
                    title={slideshowSelections.has(id) ? `已选择 #${slideshowSelections.get(id)}` : "点击选择"}
                  >
                    {slideshowSelections.has(id) ? (
                      <span className="text-sm font-bold">{slideshowSelections.get(id)}</span>
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
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

