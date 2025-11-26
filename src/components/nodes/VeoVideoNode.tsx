"use client";

import { memo, useEffect, useState, useRef } from "react";
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from "@xyflow/react";
import { Sparkles, Download, Loader2 } from "lucide-react";
import { BaseNode } from "./BaseNode";

type VeoVideoNodeData = {
  taskId?: string;
  prompt?: string;
  videoUrl?: string;
  isLoading?: boolean;
  error?: string;
  timestamp?: string;
};

const VeoVideoNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();
  const isLoading = data.isLoading || !data.videoUrl;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
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
      console.log(`[VeoVideoNode ${id}] Starting polling for task ${data.taskId}`);

      const pollTaskStatus = async () => {
        try {
          const response = await fetch(`/api/veo-task?taskId=${data.taskId}`);
          if (!response.ok) {
            console.error(`[VeoVideoNode ${id}] Failed to fetch task status`);
            return;
          }

          const { task } = await response.json();
          console.log(`[VeoVideoNode ${id}] Task status: ${task.status}`);
          setPollingStatus(task.status);

          if (task.status === "completed" && task.videoUrl) {
            console.log(`[VeoVideoNode ${id}] Task completed, updating node with video URL`);
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
            console.error(`[VeoVideoNode ${id}] Task failed: ${task.error}`);
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
          console.error(`[VeoVideoNode ${id}] Error polling task status:`, error);
        }
      };

      pollTaskStatus();
      // Veo 生成需要更长时间，每 10 秒轮询一次
      pollingIntervalRef.current = setInterval(pollTaskStatus, 10000);
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
        title="Veo Video"
        icon={Sparkles}
        color="cyan"
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
          lineClassName="!border-cyan-400"
          handleClassName="!w-3 !h-3 !bg-cyan-500 !rounded-full"
        />

        <div className="flex-1 flex flex-col p-0 relative group overflow-hidden rounded-[2rem] shadow-md border-2 border-cyan-100 dark:border-cyan-900/30 bg-white dark:bg-neutral-950 h-full">
          <div
            className="relative flex-1 min-h-[150px] h-full cursor-pointer"
          >
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-900 relative overflow-hidden rounded-[2rem]">
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500 blur-xl opacity-20 animate-pulse" />
                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin relative z-10" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse">
                      {pollingStatus === "processing" ? "Veo Processing..." : pollingStatus === "pending" ? "Queued..." : "Generating with Veo..."}
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-1">
                      This may take 1-3 minutes
                    </span>
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

                {/* Veo badge */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[9px] font-bold shadow-lg z-10">
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  Veo 3.1
                </div>

                {/* Download button overlay */}
                <a
                  href={data.videoUrl}
                  download
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg z-10"
                  title="Download Video"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4 text-cyan-600" />
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
              <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-lg whitespace-nowrap animate-pulse">
                Drag →
              </div>
            </div>
          )}
        </div>

        {/* 右侧输出连接点 */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="w-4 h-4 !bg-gradient-to-r !from-cyan-500 !to-blue-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-cyan-500/50"
          title="Drag to connect"
        />
      </BaseNode>
    </div>
  );
};

export default memo(VeoVideoNode);
