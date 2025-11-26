"use client";

import { memo, useEffect, useState, useRef, useCallback } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { Sparkles, Loader2, Play, Pause, RotateCcw, Download, CheckCircle2, Maximize2, FileArchive, RefreshCw, X } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeButton, NodeLabel } from "@/components/ui/NodeUI";
import { useCanvas } from "@/contexts/CanvasContext";
import JSZip from "jszip";

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
  // 只有在没有错误、帧不足且 isLoading 为 true 时才显示加载状态
  const isLoading = !data.error && (data.isLoading || (!data.frames || data.frames.length < 10) && data.taskId);

  const [frameStatuses, setFrameStatuses] = useState<string[]>(
    data.frameStatuses || Array(10).fill("pending")
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8); // 默认 8 帧/秒
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false); // 追踪是否正在轮询

  // 新增状态
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState<"gif" | "zip" | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [regeneratingFrame, setRegeneratingFrame] = useState<number | null>(null);
  const [contextMenuFrame, setContextMenuFrame] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  // 轮询任务状态 - 只在 taskId 变化时启动
  useEffect(() => {
    // 如果没有 taskId 或已经在轮询，不重复启动
    if (!data.taskId || isPollingRef.current) {
      return;
    }

    console.log(`[StickerNode ${id}] Starting polling for task ${data.taskId}`);
    isPollingRef.current = true;

    const pollTaskStatus = async () => {
      try {
        const response = await fetch(`/api/sticker/task?taskId=${data.taskId}`);
        const result = await response.json();

        // 处理 HTTP 错误（404 任务不存在，500 服务器错误）
        if (!response.ok) {
          const errorMsg = response.status === 404
            ? "任务不存在（服务可能已重启）"
            : result.error || `请求失败 (${response.status})`;
          console.error(`[StickerNode ${id}] Task error: ${errorMsg}`);
          updateNodeData(id, {
            isLoading: false,
            error: errorMsg,
          });
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          isPollingRef.current = false;
          return;
        }

        const task = result;
        
        // 检查有效帧数
        const validFrames = task.frames?.filter((f: string | null) => f !== null) || [];
        console.log(`[StickerNode ${id}] Task status: ${task.status}, frames: ${validFrames.length}/${task.totalFrames}`);

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

        // 检查是否应该停止轮询
        const shouldStopPolling = 
          task.status === "completed" || 
          task.status === "failed" ||
          validFrames.length >= 10;
        
        if (shouldStopPolling) {
          console.log(`[StickerNode ${id}] Stopping poll: ${task.status} (${validFrames.length}/10 frames)`);
          
          updateNodeData(id, {
            frames: task.frames,
            isLoading: task.status !== "completed" && task.status !== "failed",
            frameStatuses: task.frameStatuses,
            error: task.status === "failed" ? task.error : undefined,
          });

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          isPollingRef.current = false;
        }
      } catch (error) {
        console.error(`[StickerNode ${id}] Error polling task status:`, error);
      }
    };

    // 立即执行一次
    pollTaskStatus();
    // 然后每 3 秒轮询一次
    pollingIntervalRef.current = setInterval(pollTaskStatus, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [data.taskId, id, updateNodeData]); // 移除 data.frames 依赖！

  // 获取有效帧的索引
  const validIndices = data.frames
    ? data.frames
        .map((f: string | null, i: number) => f !== null ? i : -1)
        .filter((i: number) => i !== -1)
    : [];

  // 动画播放逻辑
  useEffect(() => {
    if (isPlaying && validIndices.length > 0) {
      animationRef.current = setInterval(() => {
        setCurrentFrame(prev => {
          // 找到当前帧在有效索引中的位置
          const currentPos = validIndices.indexOf(prev);
          // 移动到下一帧
          const nextPos = (currentPos + 1) % validIndices.length;
          return validIndices[nextPos];
        });
      }, 1000 / fps);
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
  }, [isPlaying, fps, validIndices.length]);

  // 当帧加载完成后自动播放（至少5帧）
  useEffect(() => {
    if (validIndices.length >= 5 && !isPlaying && !data.isLoading) {
      setIsPlaying(true);
    }
  }, [validIndices.length, data.isLoading]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const resetAnimation = () => {
    setCurrentFrame(0);
    setIsPlaying(false);
  };

  // 下载 GIF
  const downloadGIF = async () => {
    if (!data.frames || validIndices.length === 0) return;

    setIsDownloading(true);
    setDownloadType("gif");
    setShowDownloadMenu(false);

    try {
      const validFrames = data.frames.filter((f: string | null) => f !== null);

      const response = await fetch("/api/sticker/gif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: validFrames,
          fps,
          width: 512,
          height: 512,
        }),
      });

      if (!response.ok) {
        throw new Error("GIF 生成失败");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sticker_${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("GIF download error:", error);
      alert("GIF 下载失败");
    } finally {
      setIsDownloading(false);
      setDownloadType(null);
    }
  };

  // 打包下载所有帧 (ZIP)
  const downloadAllFrames = async () => {
    if (!data.frames || validIndices.length === 0) return;

    setIsDownloading(true);
    setDownloadType("zip");
    setShowDownloadMenu(false);

    try {
      const zip = new JSZip();
      const folder = zip.folder("sticker_frames");

      // 下载每一帧并添加到 ZIP
      for (let i = 0; i < data.frames.length; i++) {
        if (!data.frames[i]) continue;

        try {
          const response = await fetch(data.frames[i]);
          const blob = await response.blob();
          folder?.file(`frame_${String(i + 1).padStart(2, "0")}.png`, blob);
        } catch (err) {
          console.error(`Failed to download frame ${i + 1}:`, err);
        }
      }

      // 生成 ZIP 并下载
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sticker_frames_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("ZIP download error:", error);
      alert("打包下载失败");
    } finally {
      setIsDownloading(false);
      setDownloadType(null);
    }
  };

  // 重新生成单帧
  const regenerateFrame = async (frameIndex: number) => {
    if (!data.taskId || regeneratingFrame !== null) return;

    setRegeneratingFrame(frameIndex);
    setContextMenuFrame(null);

    try {
      const response = await fetch("/api/sticker/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: data.taskId,
          frameIndex,
        }),
      });

      if (!response.ok) {
        throw new Error("重新生成失败");
      }

      const result = await response.json();

      if (result.success && result.frameUrl) {
        // 更新帧
        const newFrames = [...(data.frames || [])];
        newFrames[frameIndex] = result.frameUrl;
        updateNodeData(id, { frames: newFrames });
      }
    } catch (error) {
      console.error("Regenerate frame error:", error);
      alert("重新生成失败");
    } finally {
      setRegeneratingFrame(null);
    }
  };

  // 帧右键菜单
  const handleFrameContextMenu = (e: React.MouseEvent, frameIndex: number) => {
    e.preventDefault();
    setContextMenuFrame(frameIndex);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenuFrame(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

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
        <NodeLabel>帧预览 <span className="text-neutral-400">(右键可重新生成)</span></NodeLabel>
        <div className="grid grid-cols-5 gap-1">
          {Array(10).fill(0).map((_, i) => (
            <div
              key={i}
              onClick={() => data.frames?.[i] && setCurrentFrame(i)}
              onDoubleClick={() => data.frames?.[i] && openImageModal(data.frames[i], `帧 ${i + 1}`)}
              onContextMenu={(e) => data.frames?.[i] && handleFrameContextMenu(e, i)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                i === currentFrame
                  ? "border-pink-500 ring-2 ring-pink-500/30"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-pink-300"
              }`}
              title="单击选择，双击放大，右键重新生成"
            >
              {data.frames?.[i] ? (
                <>
                  <img
                    src={data.frames[i]}
                    alt={`Frame ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {/* 重新生成中的遮罩 */}
                  {regeneratingFrame === i && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </>
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

      {/* 右键菜单 */}
      {contextMenuFrame !== null && (
        <div
          className="fixed z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[140px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => regenerateFrame(contextMenuFrame)}
            disabled={regeneratingFrame !== null}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            重新生成此帧
          </button>
          <button
            onClick={() => {
              if (data.frames?.[contextMenuFrame]) {
                openImageModal(data.frames[contextMenuFrame], `帧 ${contextMenuFrame + 1}`);
              }
              setContextMenuFrame(null);
            }}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <Maximize2 className="w-4 h-4" />
            放大查看
          </button>
        </div>
      )}

      {/* 播放控制 - 至少5帧可播放 */}
      {validIndices.length >= 5 && (
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

            {/* 下载菜单 */}
            <div className="relative">
              <NodeButton
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                variant="secondary"
                className="px-3"
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
              </NodeButton>

              {showDownloadMenu && (
                <div className="absolute bottom-full mb-1 right-0 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[140px] z-50">
                  <button
                    onClick={downloadGIF}
                    disabled={isDownloading}
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    下载 GIF
                    {downloadType === "gif" && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                  </button>
                  <button
                    onClick={downloadAllFrames}
                    disabled={isDownloading}
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
                  >
                    <FileArchive className="w-4 h-4" />
                    下载所有帧 (ZIP)
                    {downloadType === "zip" && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                  </button>
                </div>
              )}
            </div>
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

