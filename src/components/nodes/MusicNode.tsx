"use client";

import { memo, useEffect, useState, useRef } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { Music as MusicIcon, Download, Loader2, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useAudio } from "@/contexts/AudioContext";
import { NodeScrollArea } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";

type MusicNodeData = {
  taskId?: string;
  prompt?: string;
  lyrics?: string;
  musicUrls?: Array<{ url: string; flacUrl: string; duration: number; lyrics?: string }>;
  isLoading?: boolean;
  error?: string;
  timestamp?: string;
};

const MusicNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();
  const { registerAudio, unregisterAudio, pauseAllExcept } = useAudio();
  const isLoading = data.isLoading || !data.musicUrls;
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [expandedLyrics, setExpandedLyrics] = useState<{ [key: number]: boolean }>({});
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
          const result = await response.json();

          // 处理 HTTP 错误（404 任务不存在，500 服务器错误）
          if (!response.ok) {
            const errorMsg = response.status === 404
              ? "任务不存在（服务可能已重启）"
              : result.error || `请求失败 (${response.status})`;
            console.error(`[MusicNode ${id}] Task error: ${errorMsg}`);
            updateNodeData(id, {
              isLoading: false,
              error: errorMsg,
            });
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            return;
          }

          const task = result;
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
  const handleAudioPlay = (currentAudio: HTMLAudioElement, index: number) => {
    pauseAllExcept(currentAudio);
    // 如果该歌曲有歌词且当前未展开，则自动展开
    const music = data.musicUrls?.[index];
    if (music?.lyrics && !expandedLyrics[index]) {
      setExpandedLyrics(prev => ({ ...prev, [index]: true }));
    }
  };

  // 切换歌词显示
  const toggleLyrics = (index: number) => {
    setExpandedLyrics(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <BaseNode
      title="Generated Music"
      icon={MusicIcon}
      color="green"
      selected={selected}
      className="w-[320px]"
    >

      <div className="space-y-3">
        {isLoading ? (
          <div className="w-full bg-neutral-100 dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col items-center justify-center py-8 relative overflow-hidden">
             {/* Shimmer effect */}
             <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            <div className="relative z-10 flex flex-col items-center gap-4">
              {/* Audio Wave Animation */}
              <div className="flex items-end gap-1 h-8">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-green-500 rounded-full animate-[music-bar_1s_ease-in-out_infinite]"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      height: "40%"
                    }}
                  />
                ))}
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse">
                  {pollingStatus === "processing" ? "Composing..." : pollingStatus === "pending" ? "In Queue..." : "Generating Music..."}
                </span>
                {data.taskId && (
                  <span className="text-[10px] text-neutral-400 font-mono">
                    ID: {data.taskId.substring(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : data.error ? (
          <div className="w-full bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 flex flex-col items-center justify-center p-4">
            <span className="text-xs font-medium text-red-500 dark:text-red-400 text-center">{data.error}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 音乐播放列表 */}
            {data.musicUrls?.map((music: { url: string; flacUrl: string; duration: number; lyrics?: string }, index: number) => (
              <div key={index} className="border border-neutral-200 dark:border-neutral-700 rounded overflow-hidden">
                <div className="p-2">
                  <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-1.5 font-medium">
                    Song {index + 1} • {Math.floor(music.duration / 60)}:{(music.duration % 60).toString().padStart(2, "0")}
                  </div>
                  
                  <audio
                    ref={(el) => { audioRefs.current[index] = el; }}
                    controls
                    className="w-full h-8 mb-2 opacity-90 hover:opacity-100 transition-opacity"
                    style={{ maxHeight: "32px" }}
                    onPlay={(e) => handleAudioPlay(e.currentTarget, index)}
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

                {/* 每首歌的歌词 */}
                {music.lyrics && (
                  <div className="border-t border-neutral-200 dark:border-neutral-700">
                    <button
                      onClick={() => toggleLyrics(index)}
                      className="w-full flex items-center justify-between px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors"
                    >
                      <span className="text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        歌词
                      </span>
                      {expandedLyrics[index] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {expandedLyrics[index] && (
                      <NodeScrollArea className="p-2 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 max-h-48 overflow-y-auto">
                        <pre className="text-[10px] text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-sans leading-relaxed">
                          {music.lyrics}
                        </pre>
                      </NodeScrollArea>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data.timestamp && !isLoading && !data.error && (
          <div className="text-[9px] font-medium text-neutral-400 dark:text-neutral-600 text-center mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/50">
            {data.timestamp}
          </div>
        )}
      </div>

    </BaseNode>
  );
};

export default memo(MusicNode);

