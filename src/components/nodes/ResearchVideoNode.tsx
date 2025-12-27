"use client";

import { memo, useState, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Play, Pause, Download, Edit, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResearchVideoNodeData {
  projectId: string;
  title?: string;
  videoUrl: string;
  duration?: number;
  coverUrl?: string;
}

const ResearchVideoNode = ({ data, id, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(data.duration || 0);

  const videoRef = useRef<HTMLVideoElement>(null);

  // 播放/暂停
  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // 静音切换
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // 时间更新
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  // 加载完成
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  // 播放结束
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // 进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 全屏
  const handleFullscreen = () => {
    if (!videoRef.current) return;
    videoRef.current.requestFullscreen();
  };

  // 打开编辑器
  const openEditor = () => {
    const newNodeId = `research-video-editor-${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: "researchVideoEditor",
      position: { x: 400, y: 0 },
      style: { width: 800, height: 600 },
      data: {
        projectId: data.projectId,
        title: data.title,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${id}-${newNodeId}`,
        source: id,
        target: newNodeId,
      },
    ]);
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <NodeResizer
        color="#8B5CF6"
        isVisible={selected}
        minWidth={300}
        minHeight={200}
      />

      <div
        className={cn(
          "bg-gray-900 border rounded-lg overflow-hidden h-full flex flex-col",
          selected ? "border-purple-500" : "border-gray-700"
        )}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        {/* 视频 */}
        <div className="relative flex-1 bg-black">
          <video
            ref={videoRef}
            src={data.videoUrl}
            poster={data.coverUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            playsInline
          />

          {/* 播放按钮覆盖层 */}
          {!isPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
              onClick={togglePlay}
            >
              <div className="p-4 bg-purple-600/80 rounded-full">
                <Play className="w-8 h-8 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* 控制栏 */}
        <div className="p-2 bg-gray-800 space-y-2">
          {/* 进度条 */}
          <div
            className="h-1 bg-gray-700 rounded-full cursor-pointer"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="p-1 text-gray-300 hover:text-white transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="p-1 text-gray-300 hover:text-white transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <span className="text-xs text-gray-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openEditor}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="编辑"
              >
                <Edit className="w-4 h-4" />
              </button>

              <a
                href={data.videoUrl}
                download
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="下载"
              >
                <Download className="w-4 h-4" />
              </a>

              <button
                onClick={handleFullscreen}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="全屏"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 标题 */}
          {data.title && (
            <div className="text-xs text-gray-400 truncate">
              {data.title}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default memo(ResearchVideoNode);
