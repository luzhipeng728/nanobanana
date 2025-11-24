"use client";

import { memo, useEffect, useState, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, ExternalLink, Loader2 } from "lucide-react";
import { useCanvas } from "@/contexts/CanvasContext";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";

// Define the data structure for the image node
type ImageNodeData = {
  imageUrl?: string;
  prompt?: string;
  timestamp?: string;
  isLoading?: boolean;
  taskId?: string;
  error?: string;
};

const ImageNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { openImageModal } = useCanvas();
  const { updateNodeData } = useReactFlow();
  const isLoading = data.isLoading || !data.imageUrl;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          if (!response.ok) {
            console.error(`[ImageNode ${id}] Failed to fetch task status`);
            return;
          }

          const task = await response.json();
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
        >
        {/* NodeResizer for drag-to-resize functionality */}
        <NodeResizer
          isVisible={selected}
          minWidth={200}
          minHeight={200}
          lineClassName="!border-blue-400"
          handleClassName="!w-3 !h-3 !bg-blue-500 !rounded-full"
        />
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-neutral-900"
        />

        <div className="flex-1 flex flex-col p-0 relative group overflow-hidden rounded-[2rem] shadow-md border-2 border-blue-100 dark:border-blue-900/30 bg-white dark:bg-neutral-950">
          <div
            className="relative cursor-pointer flex-1 min-h-[150px]"
            onClick={handleImageClick}
          >
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50/30 dark:bg-blue-900/10">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-2" />
                <span className="text-xs font-bold text-blue-400 dark:text-blue-300">
                  {pollingStatus === "processing" ? "Processing..." : pollingStatus === "pending" ? "Queued..." : "Generating..."}
                </span>
                {data.taskId && (
                  <span className="text-[10px] text-blue-300 dark:text-blue-500 mt-1 font-mono">
                    ID: {data.taskId.substring(0, 8)}
                  </span>
                )}
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
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-neutral-900"
        />
        </BaseNode>
      </div>
  );
};

export default memo(ImageNode);

