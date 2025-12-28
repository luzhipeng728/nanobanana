"use client";

import { memo, useEffect, useState, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow, addEdge } from "@xyflow/react";
import { Image as ImageIcon, ExternalLink, Loader2, RefreshCw, Check, MapPin } from "lucide-react";
import { useCanvas } from "@/contexts/CanvasContext";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";
import { createImageTask } from "@/app/actions/image-task";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";
import { ImageMarkerModal, ImageMark, ArrowMark, ImageMarkerData } from "@/components/ImageMarker";
import { useTheme } from "@/contexts/ThemeContext";

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
  // SoM 标记数据
  markerData?: ImageMarkerData;
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
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';
  const isGlassDark = theme === 'glass-dark';

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

  // SoM 标记弹窗状态
  const [isMarkerModalOpen, setIsMarkerModalOpen] = useState(false);

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

  // 保存 SoM 标记数据
  const handleSaveMarkers = useCallback((marks: ImageMark[], arrows: ArrowMark[], markedImageDataUrl: string) => {
    if (!data.imageUrl) return;

    // 如果标记为空，清除 markerData，恢复原图
    if (marks.length === 0 && arrows.length === 0) {
      updateNodeData(id, { markerData: undefined });
      console.log(`[ImageNode ${id}] Cleared markers, restored original image`);
      return;
    }

    const markerData: ImageMarkerData = {
      marks,
      arrows,
      markedImageUrl: markedImageDataUrl,
      originalImageUrl: data.imageUrl,
      updatedAt: Date.now(),
    };

    updateNodeData(id, { markerData });
    console.log(`[ImageNode ${id}] Saved ${marks.length} marks, ${arrows.length} arrows`);
  }, [id, data.imageUrl, updateNodeData]);

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
        // 连线模式下的视觉反馈 - 主题适配
        connectMode.isActive && connectMode.sourceNodeId !== id && [
          "ring-2 ring-offset-2 ring-offset-transparent rounded-2xl cursor-pointer",
          isLight && "ring-blue-400/50",
          isNeoCyber && "ring-cyan-500/50 shadow-[0_0_20px_rgba(0,245,255,0.3)]",
          isGlassDark && "ring-white/30"
        ]
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
        {/* NodeResizer - 主题适配 */}
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          keepAspectRatio={true}
          lineClassName={cn(
            "!border-[1.5px]",
            isLight && "!border-blue-400/50",
            isNeoCyber && "!border-cyan-500/50",
            isGlassDark && "!border-white/30"
          )}
          handleClassName={cn(
            "!w-2.5 !h-2.5 !border-2 !rounded-sm",
            isLight && "!bg-blue-500 !border-white",
            isNeoCyber && "!bg-cyan-500 !border-[#0a0a12] !shadow-[0_0_10px_rgba(0,245,255,0.5)]",
            isGlassDark && "!bg-white !border-[#1a1a1a]"
          )}
          onResizeEnd={() => {
            updateNodeData(id, { userResized: true });
          }}
        />

        {/* 节点外部上方的标签 - 主题适配 */}
        {data.label && (
          <div className="absolute -top-8 left-0 z-10">
            <span className={cn(
              "text-sm font-bold tracking-wider uppercase",
              isLight && "text-blue-600",
              isNeoCyber && "font-cyber text-cyan-400 drop-shadow-[0_0_10px_rgba(0,245,255,0.5)]",
              isGlassDark && "text-white/80"
            )}>
              {data.label}
            </span>
          </div>
        )}

        <BaseNode
          title="Generated Image"
          icon={ImageIcon}
          color="cyan"
          selected={selected}
          className="w-full h-full min-w-[200px] min-h-[200px] flex flex-col p-0 !border-0 !bg-transparent !shadow-none"
          contentClassName="p-0 flex flex-col h-full"
          hideHeader={true}
        >
        {/* 图片容器 - 主题适配 */}
        <div className={cn(
          "flex-1 flex flex-col p-0 relative group overflow-hidden rounded-2xl h-full",
          "will-change-transform transform-gpu [contain:layout_style_paint]",
          isLight && [
            "bg-white border border-neutral-200",
            !isLoading && "shadow-lg",
            selected && "ring-2 ring-blue-400/50"
          ],
          isNeoCyber && [
            "bg-[#0a0a12] border border-white/10",
            !isLoading && "shadow-[0_0_30px_rgba(0,245,255,0.2)]",
            selected && "ring-2 ring-cyan-500/50 shadow-[0_0_40px_rgba(0,245,255,0.3)]"
          ],
          isGlassDark && [
            "bg-[#1a1a1a]/90 border border-white/10",
            !isLoading && "shadow-xl",
            selected && "ring-2 ring-white/30"
          ]
        )}>
          {/* 加载边框动效 - 主题适配 */}
          {isLoading && isNeoCyber && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
              <div className="absolute inset-0 rounded-2xl">
                <div className="absolute inset-[-2px] bg-gradient-conic from-cyan-500 via-purple-500 to-cyan-500 rounded-2xl cyber-loading-ring opacity-60" />
                <div className="absolute inset-[1px] bg-[#0a0a12] rounded-2xl" />
              </div>
            </div>
          )}

          {/* Neo-Cyber 角落装饰 */}
          {isNeoCyber && (
            <>
              <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-cyan-500/50 pointer-events-none z-10" />
              <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-cyan-500/50 pointer-events-none z-10" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-cyan-500/50 pointer-events-none z-10" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-cyan-500/50 pointer-events-none z-10" />
            </>
          )}

          <div className="relative flex-1 min-h-[150px] h-full">
            {isLoading ? (
              <div className={cn(
                "w-full h-full flex flex-col items-center justify-center relative overflow-hidden rounded-2xl",
                isLight && "bg-neutral-50",
                isNeoCyber && "bg-[#0a0a12] cyber-grid",
                isGlassDark && "bg-[#1a1a1a]"
              )}>
                {/* Neo-Cyber 扫描线效果 */}
                {isNeoCyber && <div className="absolute inset-0 cyber-scanline opacity-50" />}

                {/* Neo-Cyber 动态光斑 */}
                {isNeoCyber && (
                  <>
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl animate-neon-pulse" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl animate-neon-pulse" style={{ animationDelay: "1s" }} />
                  </>
                )}

                <div className="relative z-10 flex flex-col items-center gap-5">
                  {/* 旋转加载指示器 */}
                  <div className="relative w-20 h-20">
                    <div className={cn(
                      "absolute inset-0 rounded-full border-2",
                      isLight ? "border-neutral-200" : "border-white/10"
                    )} />
                    {isNeoCyber && (
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-purple-500 cyber-loading-ring" />
                    )}
                    <div className={cn(
                      "absolute inset-2 rounded-full border",
                      isLight ? "border-neutral-100" : "border-white/5"
                    )} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className={cn(
                        "w-8 h-8 animate-spin",
                        isLight ? "text-blue-500" : isNeoCyber ? "text-cyan-500" : "text-white/60"
                      )} />
                    </div>
                  </div>

                  {/* 状态文本 */}
                  <div className="flex flex-col items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold tracking-wider uppercase animate-pulse",
                      isLight && "text-blue-600",
                      isNeoCyber && "font-cyber text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400",
                      isGlassDark && "text-white/70"
                    )}>
                      {pollingStatus === "processing" ? "GENERATING" : pollingStatus === "pending" ? "QUEUED" : "INITIALIZING"}
                    </span>
                    {data.taskId && (
                      <span className={cn(
                        "font-mono text-[10px] px-3 py-1 rounded-lg",
                        isLight && "text-neutral-500 bg-neutral-100",
                        isNeoCyber && "text-cyan-400/60 bg-cyan-500/10 border border-cyan-500/20",
                        isGlassDark && "text-white/50 bg-white/5"
                      )}>
                        ID: {data.taskId.substring(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : data.error ? (
              <div className={cn(
                "w-full h-full flex flex-col items-center justify-center p-4 relative",
                isLight ? "bg-red-50" : "bg-[#0a0a12]"
              )}>
                {/* 错误状态背景 */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent" />
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-60" />

                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isLight ? "bg-red-100 border border-red-200" : "bg-red-500/20 border border-red-500/30 shadow-[0_0_20px_rgba(255,59,48,0.3)]"
                  )}>
                    <span className="text-red-400 text-xl">!</span>
                  </div>
                  <span className={cn(
                    "text-xs font-bold tracking-wider uppercase text-center",
                    isLight ? "text-red-600" : "text-red-400",
                    isNeoCyber && "font-cyber"
                  )}>
                    {data.error}
                  </span>
                </div>
              </div>
            ) : (
              <>
                {/* 渐进式图片加载：先显示缩略图，再加载完整图 */}
                {/* 如果有标记图，显示标记图；否则显示原图 */}
                <div className="relative w-full h-full">
                  {/* 缩略图层（小尺寸，快速加载） */}
                  <img
                    src={getThumbnailUrl(data.markerData?.markedImageUrl || data.imageUrl, 200)}
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
                    src={getFullImageUrl(data.markerData?.markedImageUrl || data.imageUrl)}
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
                  {/* 标记指示器角标 */}
                  {((data.markerData?.marks?.length || 0) + (data.markerData?.arrows?.length || 0)) > 0 && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-red-500 to-blue-500 text-white text-[10px] font-bold shadow-lg z-10">
                      <MapPin className="w-3 h-3" />
                      {(data.markerData?.marks?.length || 0) + (data.markerData?.arrows?.length || 0)} 个标记
                    </div>
                  )}
                  {/* 加载指示器（缩略图还没加载完时显示） */}
                  {!thumbnailLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
                      <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* 悬停遮罩和放大按钮 - 主题适配 */}
                <div className={cn(
                  "absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none",
                  isLight ? "bg-gradient-to-t from-black/40 via-transparent to-transparent" : "bg-gradient-to-t from-[#0a0a12]/80 via-transparent to-transparent"
                )}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick();
                    }}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      "opacity-0 group-hover:opacity-100 transition-all duration-300",
                      "transform translate-y-4 group-hover:translate-y-0",
                      "pointer-events-auto cursor-pointer",
                      isLight && "bg-white/90 border border-neutral-200 hover:bg-white shadow-lg",
                      isNeoCyber && "bg-[#0a0a12]/90 border border-cyan-500/50 shadow-[0_0_20px_rgba(0,245,255,0.4)] hover:bg-cyan-500/20 hover:border-cyan-400",
                      isGlassDark && "bg-black/80 border border-white/20 hover:bg-black/90"
                    )}
                    title="查看大图"
                  >
                    <ExternalLink className={cn(
                      "w-5 h-5",
                      isLight ? "text-neutral-700" : isNeoCyber ? "text-cyan-400" : "text-white"
                    )} />
                  </button>
                </div>

                {/* 右上角按钮组 - 主题适配 */}
                {!slideshowMode && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    {/* 添加标记按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMarkerModalOpen(true);
                      }}
                      className={cn(
                        "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                        isLight && [
                          "bg-white/90 border border-neutral-200 hover:border-pink-400",
                          data.markerData?.marks?.length && "border-pink-400"
                        ],
                        isNeoCyber && [
                          "bg-[#0a0a12]/90 border border-white/20",
                          "hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(255,0,170,0.4)]",
                          data.markerData?.marks?.length && "border-pink-500/50 shadow-[0_0_15px_rgba(255,0,170,0.3)]"
                        ],
                        isGlassDark && [
                          "bg-black/80 border border-white/20 hover:border-white/40",
                          data.markerData?.marks?.length && "border-pink-400/50"
                        ]
                      )}
                      title={data.markerData?.marks?.length ? `已有 ${data.markerData.marks.length} 个标记` : "添加标记"}
                    >
                      <MapPin className={cn("w-4 h-4", isLight ? "text-pink-500" : "text-pink-400")} />
                      {data.markerData?.marks?.length ? (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-pink-500 text-white text-[9px] font-bold rounded-md flex items-center justify-center shadow-[0_0_10px_rgba(255,0,170,0.5)]">
                          {data.markerData.marks.length}
                        </span>
                      ) : null}
                    </button>

                    {/* 重新生成按钮 */}
                    {data.generationConfig && (
                      <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                          isLight && "bg-white/90 border border-neutral-200 hover:border-blue-400",
                          isNeoCyber && "bg-[#0a0a12]/90 border border-white/20 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(0,245,255,0.4)]",
                          isGlassDark && "bg-black/80 border border-white/20 hover:border-white/40",
                          isRegenerating && "cursor-not-allowed opacity-50"
                        )}
                        title="重新生成"
                      >
                        <RefreshCw className={cn(
                          "w-4 h-4",
                          isLight ? "text-blue-500" : isNeoCyber ? "text-cyan-400" : "text-white",
                          isRegenerating && "animate-spin"
                        )} />
                      </button>
                    )}
                  </div>
                )}

                {/* 幻灯片选择按钮 - 主题适配 */}
                {slideshowMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlideshowSelection(id);
                    }}
                    className={cn(
                      "absolute top-3 left-3 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 z-20",
                      "border-2",
                      slideshowSelections.has(id)
                        ? cn(
                            "bg-gradient-to-r from-emerald-500 to-green-500 border-emerald-400 text-white",
                            isNeoCyber && "shadow-[0_0_20px_rgba(0,255,136,0.5)]"
                          )
                        : cn(
                            isLight && "bg-white/90 hover:bg-blue-50 border-neutral-200 hover:border-blue-400 text-blue-500",
                            isNeoCyber && "bg-[#0a0a12]/90 hover:bg-cyan-500/10 border-white/20 hover:border-cyan-500/50 text-cyan-400 hover:shadow-[0_0_15px_rgba(0,245,255,0.4)]",
                            isGlassDark && "bg-black/80 hover:bg-white/10 border-white/20 hover:border-white/40 text-white"
                          )
                    )}
                    title={slideshowSelections.has(id) ? `已选择 #${slideshowSelections.get(id)}` : "点击选择"}
                  >
                    {slideshowSelections.has(id) ? (
                      <span className={cn("text-sm font-bold", isNeoCyber && "font-cyber")}>{slideshowSelections.get(id)}</span>
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer info overlay - 主题适配 */}
          {!isLoading && !data.error && (
            <div className={cn(
              "absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all duration-300",
              isLight ? "bg-gradient-to-t from-black/50 via-black/30 to-transparent" : "bg-gradient-to-t from-[#0a0a12] via-[#0a0a12]/80 to-transparent"
            )}>
              <div className="flex items-center justify-between">
                {data.timestamp && (
                  <div className={cn(
                    "font-mono text-[10px] flex items-center gap-1.5",
                    isLight ? "text-white/90" : isNeoCyber ? "text-cyan-400/70" : "text-white/60"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full animate-pulse",
                      isLight ? "bg-white" : isNeoCyber ? "bg-cyan-500" : "bg-white/60"
                    )} />
                    {data.timestamp}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 右侧连接提示 - 主题适配 */}
          {!isLoading && !data.error && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10">
              <div className={cn(
                "text-[9px] font-bold tracking-wider uppercase px-3 py-1.5 rounded-lg whitespace-nowrap animate-pulse",
                isLight && "bg-white border border-neutral-200 text-neutral-600 shadow-md",
                isNeoCyber && "font-cyber bg-[#0a0a12] border border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(0,245,255,0.4)]",
                isGlassDark && "bg-black/80 border border-white/20 text-white/80"
              )}>
                CONNECT →
              </div>
            </div>
          )}
        </div>

        {/* 右侧输出连接点 - 主题适配 */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className={cn(
            "!w-4 !h-4 !rounded-sm !border-2 transition-all duration-200",
            isLight && "!bg-blue-500 !border-white hover:!scale-125",
            isNeoCyber && "!bg-gradient-to-r !from-cyan-500 !to-purple-500 !border-[#0a0a12] hover:!scale-125 hover:!shadow-[0_0_15px_rgba(0,245,255,0.6)]",
            isGlassDark && "!bg-white !border-[#1a1a1a] hover:!scale-125"
          )}
          title="拖拽连接到生成器作为参考图"
        />
        </BaseNode>

        {/* SoM 标记弹窗 */}
        {data.imageUrl && (
          <ImageMarkerModal
            isOpen={isMarkerModalOpen}
            onClose={() => setIsMarkerModalOpen(false)}
            imageUrl={data.imageUrl}
            initialMarks={data.markerData?.marks || []}
            initialArrows={data.markerData?.arrows || []}
            onSave={handleSaveMarkers}
          />
        )}
      </div>
  );
};

export default memo(ImageNode);

