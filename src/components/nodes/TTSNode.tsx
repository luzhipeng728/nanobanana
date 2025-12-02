"use client";

import { memo, useState, useRef, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { Volume2, Play, Pause, Download, Loader2 } from "lucide-react";
import { BaseNode } from "./BaseNode";

type TTSNodeData = {
  audioUrl?: string;
  text?: string;
  isLoading?: boolean;
  error?: string;
};

const TTSNode = ({ data, id, selected }: NodeProps<any>) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const { audioUrl, text, isLoading, error } = data as TTSNodeData;

  // 音频事件处理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleDownload = async () => {
    if (!audioUrl) return;

    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tts-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <BaseNode
      title="语音"
      icon={Volume2}
      color="cyan"
      selected={selected}
      className="w-[300px]"
    >
      <div className="space-y-3">
        {/* 隐藏的 audio 元素 */}
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

        {/* 加载中状态 */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 blur-xl opacity-30 animate-pulse" />
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
              </div>
            </div>
            <span className="text-xs text-neutral-500">生成语音中...</span>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="py-4 px-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
            <p className="text-xs text-red-500 dark:text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* 播放器 */}
        {audioUrl && !isLoading && !error && (
          <>
            {/* 文本预览 */}
            {text && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3">
                  {text}
                </p>
              </div>
            )}

            {/* 播放控制 */}
            <div className="flex items-center gap-3">
              {/* 播放/暂停按钮 */}
              <button
                onClick={togglePlay}
                disabled={!isLoaded}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>

              {/* 进度条 */}
              <div className="flex-1 space-y-1">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!isLoaded}
                  className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* 下载按钮 */}
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                title="下载音频"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </BaseNode>
  );
};

export default memo(TTSNode);
