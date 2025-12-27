"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, RefreshCw, Loader2, Edit2, Check, X } from "lucide-react";
import { cn, getThumbnailUrl } from "@/lib/utils";

interface Segment {
  id: string;
  order: number;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  imagePrompt?: string;
  ttsStatus: string;
  imageStatus: string;
}

interface SegmentDetailProps {
  segment: Segment;
  onRegenerateTTS: (segmentId: string, newText?: string) => Promise<void>;
  onRegenerateImage: (segmentId: string, customPrompt?: string) => Promise<void>;
  onUpdateText: (segmentId: string, text: string) => Promise<void>;
}

export function SegmentDetail({
  segment,
  onRegenerateTTS,
  onRegenerateImage,
  onUpdateText,
}: SegmentDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState(segment.text);
  const [isRegeneratingTTS, setIsRegeneratingTTS] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // 同步文本
  useEffect(() => {
    setEditedText(segment.text);
    setIsEditingText(false);
  }, [segment.id, segment.text]);

  // 播放/暂停音频
  const togglePlay = () => {
    if (!audioRef.current || !segment.audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // 音频结束
  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  // 保存文本
  const handleSaveText = async () => {
    if (editedText.trim() === segment.text) {
      setIsEditingText(false);
      return;
    }

    await onUpdateText(segment.id, editedText.trim());
    setIsEditingText(false);
  };

  // 重新生成 TTS
  const handleRegenerateTTS = async () => {
    setIsRegeneratingTTS(true);
    try {
      await onRegenerateTTS(segment.id);
    } finally {
      setIsRegeneratingTTS(false);
    }
  };

  // 重新生成图片
  const handleRegenerateImage = async () => {
    setIsRegeneratingImage(true);
    try {
      await onRegenerateImage(segment.id);
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  // 格式化时间
  const formatDuration = (seconds: number): string => {
    return `${seconds.toFixed(1)}s`;
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">
          分段 #{segment.order + 1}
        </h3>
        {segment.audioDuration && (
          <span className="text-xs text-gray-500">
            {formatDuration(segment.audioDuration)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 文本编辑 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">解说文本</span>
            {!isEditingText ? (
              <button
                className="text-xs text-purple-400 hover:text-purple-300"
                onClick={() => setIsEditingText(true)}
              >
                <Edit2 className="w-3 h-3" />
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  className="text-xs text-green-400 hover:text-green-300"
                  onClick={handleSaveText}
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  className="text-xs text-red-400 hover:text-red-300"
                  onClick={() => {
                    setEditedText(segment.text);
                    setIsEditingText(false);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {isEditingText ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full h-24 text-xs bg-gray-900 border border-gray-700 rounded p-2 text-gray-200 resize-none focus:outline-none focus:border-purple-500"
            />
          ) : (
            <div className="h-24 text-xs text-gray-300 bg-gray-900/50 rounded p-2 overflow-y-auto">
              {segment.text}
            </div>
          )}

          {/* 音频控制 */}
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={!segment.audioUrl}
              className={cn(
                "p-2 rounded transition-colors",
                segment.audioUrl
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              )}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={handleRegenerateTTS}
              disabled={isRegeneratingTTS}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
                isRegeneratingTTS
                  ? "bg-gray-700 text-gray-500"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              )}
            >
              {isRegeneratingTTS ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              重新生成语音
            </button>
          </div>

          {segment.audioUrl && (
            <audio
              ref={audioRef}
              src={segment.audioUrl}
              onEnded={handleAudioEnded}
              className="hidden"
            />
          )}
        </div>

        {/* 图片预览 */}
        <div className="space-y-2">
          <span className="text-xs text-gray-400">配图</span>

          <div className="aspect-video bg-gray-900 rounded overflow-hidden">
            {segment.imageUrl ? (
              <img
                src={getThumbnailUrl(segment.imageUrl, 600)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                {segment.imageStatus === "generating" ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  "无图片"
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleRegenerateImage}
            disabled={isRegeneratingImage}
            className={cn(
              "w-full flex items-center justify-center gap-1 px-2 py-1 text-xs rounded transition-colors",
              isRegeneratingImage
                ? "bg-gray-700 text-gray-500"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            )}
          >
            {isRegeneratingImage ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            重新生成配图
          </button>

          {segment.imagePrompt && (
            <div className="text-xs text-gray-500 truncate" title={segment.imagePrompt}>
              提示词: {segment.imagePrompt.slice(0, 50)}...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SegmentDetail;
