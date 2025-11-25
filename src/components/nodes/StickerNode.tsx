"use client";

import { memo, useEffect, useState, useRef, useCallback } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { Sparkles, Loader2, Play, Pause, RotateCcw, Download, CheckCircle2, Maximize2 } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeButton, NodeLabel } from "@/components/ui/NodeUI";
import { useCanvas } from "@/contexts/CanvasContext";

type StickerNodeData = {
  taskId?: string;
  animationType?: string;
  frames?: string[];  // 10帧图片 URL
  isLoading?: boolean;
  error?: string;
  frameStatuses?: ("pending" | "generating" | "completed" | "error")[];
};

const StickerNode = ({ data, id, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();
  const { openImageModal } = useCanvas();
  const isLoading = data.isLoading || !data.frames || data.frames.length < 10;
  
  const [frameStatuses, setFrameStatuses] = useState<string[]>(
    data.frameStatuses || Array(10).fill("pending")
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8); // 默认 8 帧/秒
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // 轮询任务状态
  useEffect(() => {
    if (data.frames && data.frames.length === 10) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    if (data.taskId) {
      console.log(`[StickerNode ${id}] Starting polling for task ${data.taskId}`);

      const pollTaskStatus = async () => {
        try {
          const response = await fetch(`/api/sticker/task?taskId=${data.taskId}`);
          if (!response.ok) {
            console.error(`[StickerNode ${id}] Failed to fetch task status`);
            return;
          }

          const task = await response.json();
          console.log(`[StickerNode ${id}] Task status:`, task.status, `frames: ${task.completedFrames}/${task.totalFrames}`);

          // 更新帧状态
          if (task.frameStatuses) {
            setFrameStatuses(task.frameStatuses);
          }

          // 更新已完成的帧
          if (task.frames && task.frames.length > 0) {
            updateNodeData(id, {
              frames: task.frames,
              frameStatuses: task.frameStatuses,
            });
          }

          // 检查实际完成的帧数（非 null）
          const validFrames = task.frames?.filter((f: string | null) => f !== null) || [];
          
          if (task.status === "completed" && validFrames.length >= 5) {
            console.log(`[StickerNode ${id}] Task completed! (${validFrames.length}/10 frames)`);
            updateNodeData(id, {
              frames: task.frames,
              isLoading: false,
              frameStatuses: task.frameStatuses,
            });

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else if (task.status === "failed") {
            console.error(`[StickerNode ${id}] Task failed: ${task.error}`);
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
          console.error(`[StickerNode ${id}] Error polling task status:`, error);
        }
      };

      pollTaskStatus();
      pollingIntervalRef.current = setInterval(pollTaskStatus, 3000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [data.taskId, data.frames, id, updateNodeData]);

  // 动画播放逻辑 - 只播放有效帧
  useEffect(() => {
    if (isPlaying && data.frames && data.frames.length > 0) {
      // 获取有效帧的索引
      const validIndices = data.frames
        .map((f: string | null, i: number) => f !== null ? i : -1)
        .filter((i: number) => i !== -1);
      
      if (validIndices.length > 0) {
        let currentIdx = 0;
        animationRef.current = setInterval(() => {
          currentIdx = (currentIdx + 1) % validIndices.length;
          setCurrentFrame(validIndices[currentIdx]);
        }, 1000 / fps);
      }
    } else {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, fps, data.frames]);

  // 计算有效帧数
  const validFrameCount = data.frames?.filter((f: string | null) => f !== null).length || 0;

  // 当帧加载完成后自动播放（至少5帧）
  useEffect(() => {
    if (validFrameCount >= 5 && !isPlaying && !data.isLoading) {
      setIsPlaying(true);
    }
  }, [validFrameCount, data.isLoading]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const resetAnimation = () => {
    setCurrentFrame(0);
    setIsPlaying(false);
  };

  // 下载所有有效帧
  const downloadFrames = async () => {
    if (!data.frames || validFrameCount === 0) return;
    
    // 创建一个临时链接下载每一帧
    for (let i = 0; i < data.frames.length; i++) {
      if (!data.frames[i]) continue; // 跳过 null
      const link = document.createElement('a');
      link.href = data.frames[i];
      link.download = `sticker_frame_${i + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const completedCount = frameStatuses.filter(s => s === "completed").length;

  return (
    <BaseNode
      title="表情包"
      icon={Sparkles}
      color="pink"
      selected={selected}
      className="w-[280px]"
      headerActions={
        <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 font-medium">
          {completedCount}/10 帧
        </span>
      }
    >
      {/* 主动画预览区 */}
      <div className="group relative aspect-square bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 rounded-xl overflow-hidden border-2 border-pink-200 dark:border-pink-800">
        {isLoading && (!data.frames || data.frames.length === 0) ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-pink-500 blur-xl opacity-20 animate-pulse" />
              <Loader2 className="w-10 h-10 text-pink-500 animate-spin relative z-10" />
            </div>
            <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-purple-500 mt-3 animate-pulse">
              生成中...
            </span>
            <span className="text-[10px] text-neutral-500 mt-1">
              {completedCount}/10 帧已完成
            </span>
          </div>
        ) : data.error ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <span className="text-xs text-red-500 text-center">{data.error}</span>
          </div>
        ) : data.frames && data.frames.length > 0 ? (
          <>
            <img
              src={data.frames[currentFrame] || data.frames[0]}
              alt={`Frame ${currentFrame + 1}`}
              className="w-full h-full object-contain cursor-pointer"
              onClick={() => openImageModal(data.frames[currentFrame] || data.frames[0], data.animationType || "表情包")}
            />
            {/* 放大按钮提示 */}
            <button
              onClick={() => openImageModal(data.frames[currentFrame] || data.frames[0], data.animationType || "表情包")}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              title="放大查看"
            >
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
          </>
        ) : null}

        {/* 帧指示器 */}
        {data.frames && data.frames.length > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {Array(10).fill(0).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-150 ${
                  i === currentFrame
                    ? "bg-pink-500 scale-125"
                    : frameStatuses[i] === "completed"
                    ? "bg-pink-300"
                    : "bg-neutral-300 dark:bg-neutral-600"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 10帧缩略图网格 */}
      <div className="space-y-1.5">
        <NodeLabel>帧预览</NodeLabel>
        <div className="grid grid-cols-5 gap-1">
          {Array(10).fill(0).map((_, i) => (
            <div
              key={i}
              onClick={() => data.frames?.[i] && setCurrentFrame(i)}
              onDoubleClick={() => data.frames?.[i] && openImageModal(data.frames[i], `帧 ${i + 1}`)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                i === currentFrame
                  ? "border-pink-500 ring-2 ring-pink-500/30"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-pink-300"
              }`}
              title="单击选择，双击放大"
            >
              {data.frames?.[i] ? (
                <img
                  src={data.frames[i]}
                  alt={`Frame ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                  {frameStatuses[i] === "generating" ? (
                    <Loader2 className="w-3 h-3 text-pink-500 animate-spin" />
                  ) : frameStatuses[i] === "completed" ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <span className="text-[8px] text-neutral-400">{i + 1}</span>
                  )}
                </div>
              )}
              
              {/* 帧序号 */}
              <div className="absolute top-0.5 left-0.5 bg-black/50 text-white text-[7px] px-1 rounded">
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 播放控制 - 至少5帧可播放 */}
      {validFrameCount >= 5 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <NodeButton
              onClick={togglePlay}
              className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? "暂停" : "播放"}
            </NodeButton>
            <NodeButton
              onClick={resetAnimation}
              variant="secondary"
              className="px-3"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </NodeButton>
            <NodeButton
              onClick={downloadFrames}
              variant="secondary"
              className="px-3"
            >
              <Download className="w-3.5 h-3.5" />
            </NodeButton>
          </div>

          {/* FPS 控制 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500">速度:</span>
            <input
              type="range"
              min="2"
              max="24"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="flex-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
            <span className="text-[10px] text-pink-600 font-bold w-12">{fps} FPS</span>
          </div>
        </div>
      )}
    </BaseNode>
  );
};

export default memo(StickerNode);

