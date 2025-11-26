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
  // 存储生图配置，用于重新生成
  generationConfig?: {
    model: GeminiImageModel;
    config: ImageGenerationConfig;
    referenceImages?: string[];
  };
};

const ImageNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { openImageModal, addImageNode } = useCanvas();
  const { updateNodeData, getNode } = useReactFlow();
  const isLoading = data.isLoading || !data.imageUrl;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
        addImageNode(
          undefined,
          data.prompt,
          { x: currentNode.position.x + 450, y: currentNode.position.y },
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
    <div className="w-full h-full">
        <BaseNode
          title="Generated Image"
          icon={ImageIcon}
          color="blue"
          selected={selected}
          className="w-full h-full min-w-[200px] min-h-[200px] flex flex-col p-0 !border-0 !bg-transparent !shadow-none"
          contentClassName="p-0 flex flex-col h-full"
          hideHeader={true}
        >
        {/* NodeResizer for drag-to-resize functionality */}
        <NodeResizer
          isVisible={selected}
          minWidth={200}
          minHeight={200}
          lineClassName="!border-blue-400"
          handleClassName="!w-3 !h-3 !bg-blue-500 !rounded-full"
        />
        <div className="flex-1 flex flex-col p-0 relative group overflow-hidden rounded-[2rem] shadow-md border-2 border-blue-100 dark:border-blue-900/30 bg-white dark:bg-neutral-950 h-full">
          <div
            className="relative cursor-pointer flex-1 min-h-[150px] h-full"
            onClick={handleImageClick}
          >
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-900 relative overflow-hidden">
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin relative z-10" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse">
                      {pollingStatus === "processing" ? "Processing..." : pollingStatus === "pending" ? "Queued..." : "Generating..."}
                    </span>
                    {data.taskId && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        ID: {data.taskId.substring(0, 8)}
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
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg">
                    <ExternalLink className="w-5 h-5 text-neutral-900" />
                  </div>
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

