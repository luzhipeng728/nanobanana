"use client";

import { useState, useRef, useEffect } from "react";
import { cn, getThumbnailUrl } from "@/lib/utils";

interface Segment {
  id: string;
  order: number;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  ttsStatus: string;
  imageStatus: string;
}

interface TimelineProps {
  segments: Segment[];
  selectedIndex: number;
  onSelectSegment: (index: number) => void;
  totalDuration: number;
}

export function Timeline({ segments, selectedIndex, onSelectSegment, totalDuration }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // 计算每个分段的位置和宽度
  const getSegmentPosition = (index: number): { left: number; width: number } => {
    if (totalDuration === 0) {
      return { left: (index / segments.length) * 100, width: 100 / segments.length };
    }

    let startTime = 0;
    for (let i = 0; i < index; i++) {
      startTime += segments[i].audioDuration || 3;
    }

    const duration = segments[index].audioDuration || 3;
    return {
      left: (startTime / totalDuration) * 100,
      width: (duration / totalDuration) * 100,
    };
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 生成时间刻度
  const timeMarkers: number[] = [];
  const interval = totalDuration > 60 ? 15 : 5;
  for (let t = 0; t <= totalDuration; t += interval) {
    timeMarkers.push(t);
  }

  return (
    <div className="bg-gray-900 rounded-lg p-3 space-y-2">
      {/* 时间刻度 */}
      <div className="relative h-5 text-xs text-gray-500">
        {timeMarkers.map((t) => (
          <div
            key={t}
            className="absolute transform -translate-x-1/2"
            style={{ left: `${(t / totalDuration) * 100}%` }}
          >
            {formatTime(t)}
          </div>
        ))}
      </div>

      {/* 音频轨道 */}
      <div className="relative h-12 bg-gray-800 rounded overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-8 bg-gray-700 flex items-center justify-center text-xs text-gray-400">
          音频
        </div>
        <div className="ml-8 relative h-full">
          {segments.map((segment, index) => {
            const pos = getSegmentPosition(index);
            return (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-1 bottom-1 rounded cursor-pointer transition-all",
                  "flex items-center justify-center text-xs overflow-hidden",
                  selectedIndex === index
                    ? "bg-purple-600 ring-2 ring-purple-400"
                    : "bg-purple-800/50 hover:bg-purple-700/50",
                  !segment.audioUrl && "bg-gray-700 opacity-50"
                )}
                style={{
                  left: `${pos.left}%`,
                  width: `calc(${pos.width}% - 2px)`,
                }}
                onClick={() => onSelectSegment(index)}
              >
                {segment.audioDuration ? formatTime(segment.audioDuration) : "-"}
              </div>
            );
          })}
        </div>
      </div>

      {/* 图片轨道 */}
      <div className="relative h-16 bg-gray-800 rounded overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-8 bg-gray-700 flex items-center justify-center text-xs text-gray-400">
          图片
        </div>
        <div className="ml-8 relative h-full">
          {segments.map((segment, index) => {
            const pos = getSegmentPosition(index);
            return (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-1 bottom-1 rounded cursor-pointer transition-all overflow-hidden",
                  selectedIndex === index
                    ? "ring-2 ring-purple-400"
                    : "hover:ring-1 hover:ring-purple-400/50",
                  !segment.imageUrl && "bg-gray-700"
                )}
                style={{
                  left: `${pos.left}%`,
                  width: `calc(${pos.width}% - 2px)`,
                }}
                onClick={() => onSelectSegment(index)}
              >
                {segment.imageUrl ? (
                  <img
                    src={getThumbnailUrl(segment.imageUrl, 200)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    无图片
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 总时长 */}
      <div className="text-xs text-gray-500 text-right">
        总时长: {formatTime(totalDuration)}
      </div>
    </div>
  );
}

export default Timeline;
