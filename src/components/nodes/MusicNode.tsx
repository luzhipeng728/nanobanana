"use client";

import { memo, useEffect, useState, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Music as MusicIcon, Download, Loader2, ChevronDown, ChevronUp, FileText, Play, Pause } from "lucide-react";
import { useAudio } from "@/contexts/AudioContext";
import { NodeScrollArea } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";

type MusicNodeData = {
  taskId?: string;
  prompt?: string;
  lyrics?: string;
  musicUrls?: Array<{ url: string; flacUrl: string; duration: number }>;
  isLoading?: boolean;
  error?: string;
  timestamp?: string;
};

const MusicNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();
  const { registerAudio, unregisterAudio, pauseAllExcept } = useAudio();
  const isLoading = data.isLoading || !data.musicUrls;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  // 轮询任务状态
  useEffect(() => {
    // 如果已经有音乐URL，不需要轮询
    if (data.musicUrls) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // 如果有 taskId，开始轮询
    if (data.taskId) {
      console.log(`[MusicNode ${id}] Starting polling for task ${data.taskId}`);

      const pollTaskStatus = async () => {
        try {
          const response = await fetch(`/api/music-task?taskId=${data.taskId}`);
          if (!response.ok) {
            console.error(`[MusicNode ${id}] Failed to fetch task status`);
            return;
          }

          const task = await response.json();
          console.log(`[MusicNode ${id}] Task status: ${task.status}`);
          setPollingStatus(task.status);

          if (task.status === "completed" && task.musicUrls) {
            // 任务完成，更新节点数据
            console.log(`[MusicNode ${id}] Task completed, updating node with music URLs`);
            updateNodeData(id, {
              musicUrls: task.musicUrls,
              lyrics: task.lyrics,
              prompt: task.prompt,
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
            console.error(`[MusicNode ${id}] Task failed: ${task.error}`);
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
          console.error(`[MusicNode ${id}] Error polling task status:`, error);
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
  }, [data.taskId, data.musicUrls, id, updateNodeData]);

  // 注册/注销音频元素
  useEffect(() => {
    const currentAudios = audioRefs.current.filter(Boolean) as HTMLAudioElement[];
    currentAudios.forEach(audio => registerAudio(audio));

    return () => {
      currentAudios.forEach(audio => unregisterAudio(audio));
    };
  }, [data.musicUrls, registerAudio, unregisterAudio]);

  // 全局音频互斥播放控制 + 自动显示歌词
  const handleAudioPlay = (index: number) => {
    const audio = audioRefs.current[index];
    if (audio) {
      pauseAllExcept(audio);
      setPlayingIndex(index);
      // 如果有歌词且当前未展开，则自动展开
      if (data.lyrics && !showLyrics) {
        setShowLyrics(true);
      }
    }
  };

  const handleAudioPause = () => {
    setPlayingIndex(null);
  };

  return (
    <BaseNode
      title="Generated Music"
      icon={MusicIcon}
      color="green"
      selected={selected}
      className="w-[320px]"
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-green-500 !border-0"
      />

      <div className="space-y-3">
        {isLoading ? (
          <div className="w-full bg-green-50/30 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/30 flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-green-400 animate-spin mb-2" />
            <span className="text-xs font-bold text-green-500 dark:text-green-400">
              {pollingStatus === "processing" ? "Processing..." : pollingStatus === "pending" ? "Queued..." : "Generating..."}
            </span>
            {data.taskId && (
              <span className="text-[10px] text-green-400 dark:text-green-500 mt-1 font-mono">
                ID: {data.taskId.substring(0, 8)}
              </span>
            )}
          </div>
        ) : data.error ? (
          <div className="w-full bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 flex flex-col items-center justify-center p-4">
            <span className="text-xs font-medium text-red-500 dark:text-red-400 text-center">{data.error}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 歌词显示区域 */}
            {data.lyrics && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
                <button
                  onClick={() => setShowLyrics(!showLyrics)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <FileText className="w-3 h-3" />
                    Lyrics
                  </span>
                  {showLyrics ? <ChevronUp className="w-3.5 h-3.5 text-neutral-400" /> : <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />}
                </button>
                {showLyrics && (
                  <NodeScrollArea className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 max-h-40 overflow-y-auto">
                    <pre className="text-[10px] text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-sans leading-relaxed">
                      {data.lyrics}
                    </pre>
                  </NodeScrollArea>
                )}
              </div>
            )}

            {/* 音乐播放列表 */}
            <div className="space-y-2">
              {data.musicUrls?.map((music: { url: string; flacUrl: string; duration: number }, index: number) => (
                <div 
                  key={index} 
                  className={cn(
                    "border rounded-2xl p-3 transition-all duration-200",
                    playingIndex === index 
                      ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20 shadow-sm" 
                      : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-green-200 dark:hover:border-green-800"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm",
                        playingIndex === index ? "bg-green-500 animate-pulse" : "bg-neutral-200 dark:bg-neutral-700"
                      )}>
                        <MusicIcon className="w-3 h-3" />
                      </div>
                      <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                        Track {index + 1}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
                      {Math.floor(music.duration / 60)}:{(music.duration % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                  
                  <audio
                    ref={(el) => { audioRefs.current[index] = el; }}
                    controls
                    className="w-full h-8 mb-2 opacity-90 hover:opacity-100 transition-opacity"
                    style={{ maxHeight: "32px" }}
                    onPlay={() => handleAudioPlay(index)}
                    onPause={handleAudioPause}
                    onWheel={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  >
                    <source src={music.url} type="audio/mpeg" />
                    Your browser does not support audio playback.
                  </audio>

                  <div className="flex gap-2">
                    <a
                      href={music.url}
                      download
                      className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 py-1.5 rounded-full transition-all"
                    >
                      <Download className="w-3 h-3" />
                      MP3
                    </a>
                    <a
                      href={music.flacUrl}
                      download
                      className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 py-1.5 rounded-full transition-all"
                    >
                      <Download className="w-3 h-3" />
                      FLAC
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.timestamp && !isLoading && !data.error && (
          <div className="text-[9px] font-medium text-neutral-400 dark:text-neutral-600 text-center mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/50">
            {data.timestamp}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-green-500 !border-0"
      />
    </BaseNode>
  );
};

export default memo(MusicNode);

