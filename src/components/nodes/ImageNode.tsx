"use client";

import { memo, useEffect, useState, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, ExternalLink, Loader2 } from "lucide-react";
import { useCanvas } from "@/contexts/CanvasContext";

// Define the data structure for the image node
type ImageNodeData = {
  imageUrl?: string;
  prompt?: string;
  timestamp?: string;
  isLoading?: boolean;
  taskId?: string;
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
    <div className="nowheel bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded min-w-[200px] min-h-[200px] w-full h-full overflow-hidden">
        {/* NodeResizer for drag-to-resize functionality */}
        <NodeResizer
          isVisible={selected}
          minWidth={200}
          minHeight={200}
          lineClassName="!border-purple-500"
          handleClassName="!w-2 !h-2 !bg-purple-500"
        />
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="w-2 h-2 !bg-purple-500 !border-0"
        />

        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" />
            Image
          </span>
        </div>

        <div className="p-2 h-full flex flex-col">
          <div
            className="relative group cursor-pointer flex-1 min-h-[150px]"
            onClick={handleImageClick}
          >
            {isLoading ? (
              <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center">
                <Loader2 className="w-6 h-6 text-purple-500 animate-spin mb-1.5" />
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {pollingStatus === "processing" ? "处理中..." : pollingStatus === "pending" ? "排队中..." : "生成中..."}
                </span>
                {data.taskId && (
                  <span className="text-[9px] text-neutral-400 dark:text-neutral-600 mt-1">
                    任务 ID: {data.taskId.substring(0, 8)}
                  </span>
                )}
              </div>
            ) : data.error ? (
              <div className="w-full h-full bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 flex flex-col items-center justify-center p-3">
                <span className="text-xs text-red-600 dark:text-red-400 text-center">{data.error}</span>
              </div>
            ) : (
              <>
                <img
                  src={data.imageUrl}
                  alt="Reference"
                  className="w-full h-full object-cover rounded border border-neutral-200 dark:border-neutral-700"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                  <ExternalLink className="w-5 h-5 text-white" />
                </div>
              </>
            )}
          </div>

          {data.timestamp && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-600 text-center mt-1.5">
              {data.timestamp}
            </div>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="w-2 h-2 !bg-purple-500 !border-0"
        />
      </div>
  );
};

export default memo(ImageNode);
