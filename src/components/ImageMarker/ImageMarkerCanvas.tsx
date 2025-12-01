"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ImageMark,
  ImageMarkerCanvasProps,
  MarkerStyle,
  DEFAULT_MARKER_STYLE,
} from "./types";
import { drawMarksOnCanvas } from "./useImageMarker";

/**
 * 图片标记画布组件
 * 支持在图片上点击添加数字标记，类似地图标记点的效果
 */
export function ImageMarkerCanvas({
  imageUrl,
  marks,
  onMarksChange,
  style = {},
  editable = true,
  className,
}: ImageMarkerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [hoveredMark, setHoveredMark] = useState<string | null>(null);

  const mergedStyle: MarkerStyle = { ...DEFAULT_MARKER_STYLE, ...style };

  // 加载图片并绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // 计算画布尺寸（保持比例，适应容器）
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight || 500;

      let width = img.naturalWidth;
      let height = img.naturalHeight;
      const aspectRatio = width / height;

      // 适应容器
      if (width > containerWidth) {
        width = containerWidth;
        height = width / aspectRatio;
      }
      if (height > containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;
      setImageDimensions({ width, height });

      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);

      // 绘制标记
      drawMarksOnCanvas(ctx, marks, width, height, mergedStyle);

      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error("Failed to load image:", imageUrl);
    };
    img.src = imageUrl;
  }, [imageUrl, marks, mergedStyle]);

  // 重新绘制（当标记变化时）
  useEffect(() => {
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawMarksOnCanvas(ctx, marks, canvas.width, canvas.height, mergedStyle);
    };
    img.src = imageUrl;
  }, [marks, imageLoaded, imageUrl, mergedStyle]);

  // 处理画布点击
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!editable || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvas.width;
      const y = (e.clientY - rect.top) / canvas.height;

      // 检查是否点击了已有标记（删除）
      const clickedMark = marks.find((mark) => {
        const markX = mark.x * canvas.width;
        const markY = mark.y * canvas.height;
        const distance = Math.sqrt(
          Math.pow(e.clientX - rect.left - markX, 2) +
          Math.pow(e.clientY - rect.top - markY, 2)
        );
        return distance < mergedStyle.size / 2 + 5;
      });

      if (clickedMark) {
        // 点击已有标记，删除它
        const newMarks = marks
          .filter((m) => m.id !== clickedMark.id)
          .map((m, index) => ({ ...m, number: index + 1 }));
        onMarksChange(newMarks);
      } else {
        // 添加新标记
        const newMark: ImageMark = {
          id: `mark-${Date.now()}-${marks.length + 1}`,
          number: marks.length + 1,
          x,
          y,
        };
        onMarksChange([...marks, newMark]);
      }
    },
    [editable, marks, onMarksChange, mergedStyle.size]
  );

  // 处理鼠标移动（悬停效果）
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      const hoveredMarkId = marks.find((mark) => {
        const markX = mark.x * canvas.width;
        const markY = mark.y * canvas.height;
        const distance = Math.sqrt(
          Math.pow(e.clientX - rect.left - markX, 2) +
          Math.pow(e.clientY - rect.top - markY, 2)
        );
        return distance < mergedStyle.size / 2 + 5;
      })?.id || null;

      setHoveredMark(hoveredMarkId);
    },
    [marks, mergedStyle.size]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-neutral-100 dark:bg-neutral-900 rounded-xl overflow-hidden",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredMark(null)}
        className={cn(
          "block mx-auto",
          editable && "cursor-crosshair",
          hoveredMark && "cursor-pointer"
        )}
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      />

      {/* 提示文字 */}
      {editable && marks.length === 0 && imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm">
            点击图片添加标记点
          </div>
        </div>
      )}

      {/* 标记数量显示 */}
      {marks.length > 0 && (
        <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
          {marks.length} 个标记
        </div>
      )}
    </div>
  );
}

/**
 * 获取 Canvas 的 DataURL（用于导出带标记的图片）
 */
export function getCanvasDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export default ImageMarkerCanvas;
