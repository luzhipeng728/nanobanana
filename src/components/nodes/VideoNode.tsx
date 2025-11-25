"use client";

import { memo, useEffect, useState, useRef } from "react";
import { NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Video as VideoIcon, Download, Loader2 } from "lucide-react";

type VideoNodeData = {
  taskId?: string;
  prompt?: string;
  videoUrl?: string;
  isLoading?: boolean;
  error?: string;
  timestamp?: string;
};

const VideoNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();
  const isLoading = data.isLoading || !data.videoUrl;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 轮询任务状态
  useEffect(() => {
    // 如果已经有视频URL，不需要轮询
    if (data.videoUrl) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // 如果有 taskId，开始轮询
    if (data.taskId) {
      console.log(`[VideoNode ${id}] Starting polling for task ${data.taskId}`);

      const pollTaskStatus = async () => {
        try {
          const response = await fetch(`/api/video-task?taskId=${data.taskId}`);
          if (!response.ok) {
            console.error(`[VideoNode ${id}] Failed to fetch task status`);
            return;
          }

          const task = await response.json();
          console.log(`[VideoNode ${id}] Task status: ${task.status}, progress: ${task.progress}%`);
          setPollingStatus(task.status);
          setProgress(task.progress || 0);

          if (task.status === "completed" && task.videoUrl) {
            // 任务完成，更新节点数据
            console.log(`[VideoNode ${id}] Task completed, updating node with video URL`);
            updateNodeData(id, {
              videoUrl: task.videoUrl,
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
            console.error(`[VideoNode ${id}] Task failed: ${task.error}`);
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
          console.error(`[VideoNode ${id}] Error polling task status:`, error);
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
  }, [data.taskId, data.videoUrl, id, updateNodeData]);

  return (
    <div className="nowheel bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded min-w-[300px] min-h-[200px] w-full h-full overflow-hidden">
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
        lineClassName="!border-orange-500"
        handleClassName="!w-2 !h-2 !bg-orange-500"
      />

      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
          <VideoIcon className="w-3.5 h-3.5" />
          Video
        </span>
      </div>

      <div className="p-2 h-full flex flex-col">
        <div className="relative flex-1 min-h-[150px]">
          {isLoading ? (
            <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center p-4">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin mb-2" />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                {pollingStatus === "processing" ? "处理中..." : pollingStatus === "pending" ? "排队中..." : "生成中..."}
              </span>
              {progress > 0 && (
                <div className="w-full">
                  <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                    <span>进度</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {data.taskId && (
                <span className="text-[9px] text-neutral-400 dark:bg-neutral-600 mt-2">
                  任务 ID: {data.taskId.substring(0, 8)}
                </span>
              )}
            </div>
          ) : data.error ? (
            <div className="w-full h-full bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 flex flex-col items-center justify-center p-3">
              <span className="text-xs text-red-600 dark:text-red-400 text-center">{data.error}</span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <video
                controls
                className="w-full flex-1 rounded border border-neutral-200 dark:border-neutral-700 bg-black"
                style={{ objectFit: "contain" }}
              >
                <source src={data.videoUrl} type="video/mp4" />
                Your browser does not support video playback.
              </video>
              <a
                href={data.videoUrl}
                download
                className="mt-2 flex items-center justify-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-750 py-1.5 rounded"
              >
                <Download className="w-3 h-3" />
                Download Video
              </a>
            </div>
          )}
        </div>

        {data.timestamp && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-600 text-center mt-1.5">
            {data.timestamp}
          </div>
        )}
      </div>

    </div>
  );
};

export default memo(VideoNode);
