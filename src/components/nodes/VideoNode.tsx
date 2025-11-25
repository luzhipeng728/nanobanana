"use client";

import { memo, useEffect, useState, useRef } from "react";
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from "@xyflow/react";
import { Video as VideoIcon, Download, Loader2 } from "lucide-react";
import { BaseNode } from "./BaseNode";

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
    if (data.videoUrl) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

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
            console.log(`[VideoNode ${id}] Task completed, updating node with video URL`);
            updateNodeData(id, {
              videoUrl: task.videoUrl,
              isLoading: false,
              timestamp: new Date().toLocaleString(),
            });

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else if (task.status === "failed") {
            console.error(`[VideoNode ${id}] Task failed: ${task.error}`);
            updateNodeData(id, {
              isLoading: false,
              error: task.error,
            });

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error(`[VideoNode ${id}] Error polling task status:`, error);
        }
      };

      pollTaskStatus();
      pollingIntervalRef.current = setInterval(pollTaskStatus, 5000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [data.taskId, data.videoUrl, id, updateNodeData]);

  return (
    <div className="w-full h-full">
      <BaseNode
        title="Generated Video"
        icon={VideoIcon}
        color="orange"
        selected={selected}
        className="w-full h-full min-w-[200px] min-h-[200px] flex flex-col p-0 !border-0 !bg-transparent !shadow-none"
        contentClassName="p-0 flex flex-col h-full"
        hideHeader={true}
      >
        {/* NodeResizer */}
        <NodeResizer
          isVisible={selected}
          minWidth={200}
          minHeight={200}
          lineClassName="!border-orange-400"
          handleClassName="!w-3 !h-3 !bg-orange-500 !rounded-full"
        />

        <div className="flex-1 flex flex-col p-0 relative group overflow-hidden rounded-[2rem] shadow-md border-2 border-orange-100 dark:border-orange-900/30 bg-white dark:bg-neutral-950 h-full">
          <div
            className="relative flex-1 min-h-[150px] h-full cursor-pointer"
          >
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-900 relative overflow-hidden rounded-[2rem]">
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500 blur-xl opacity-20 animate-pulse" />
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin relative z-10" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-500 animate-pulse">
                      {pollingStatus === "processing" ? "Processing..." : pollingStatus === "pending" ? "Queued..." : "Generating..."}
                    </span>
                    {progress > 0 && (
                      <div className="w-32 mt-2">
                        <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                          <span>Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {data.taskId && (
                      <span className="text-[10px] text-neutral-400 font-mono mt-1">
                        ID: {data.taskId.substring(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : data.error ? (
              <div className="w-full h-full bg-red-50 dark:bg-red-900/10 flex flex-col items-center justify-center p-4 rounded-[2rem]">
                <span className="text-xs font-medium text-red-500 dark:text-red-400 text-center">{data.error}</span>
              </div>
            ) : (
              <>
                <video
                  controls
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 rounded-[calc(2rem-2px)]"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                >
                  <source src={data.videoUrl} type="video/mp4" />
                  Your browser does not support video playback.
                </video>

                {/* Download button overlay */}
                <a
                  href={data.videoUrl}
                  download
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg z-10"
                  title="Download Video"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4 text-orange-600" />
                </a>
              </>
            )}
          </div>

          {/* Footer info overlay */}
          {!isLoading && !data.error && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-b-[2rem]">
              {data.timestamp && (
                <div className="text-[10px] text-white/90 text-center font-medium">
                  {data.timestamp}
                </div>
              )}
            </div>
          )}

          {/* 右侧连接提示 */}
          {!isLoading && !data.error && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-lg whitespace-nowrap animate-pulse">
                拖拽 →
              </div>
            </div>
          )}
        </div>

        {/* 右侧输出连接点 */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="w-4 h-4 !bg-gradient-to-r !from-orange-500 !to-red-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-orange-500/50"
          title="拖拽连接"
        />
      </BaseNode>
    </div>
  );
};

export default memo(VideoNode);
