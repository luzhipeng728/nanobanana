"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Check, Trash2, RotateCcw, MapPin, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ImageMark,
  ImageMarkerModalProps,
  MarkerStyle,
  DEFAULT_MARKER_STYLE,
  getCircleNumber,
} from "./types";
import { generateMarkedImageDataUrl } from "./useImageMarker";

/**
 * 图片标记弹窗组件
 * 用于在图片上添加 SoM 风格的数字标记
 */
export function ImageMarkerModal({
  isOpen,
  onClose,
  imageUrl,
  initialMarks = [],
  onSave,
  style = {},
}: ImageMarkerModalProps) {
  const [marks, setMarks] = useState<ImageMark[]>(initialMarks);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const mergedStyle: MarkerStyle = { ...DEFAULT_MARKER_STYLE, ...style };

  // 重置标记
  useEffect(() => {
    if (isOpen) {
      setMarks(initialMarks);
    }
  }, [isOpen, initialMarks]);

  // 加载图片并绘制
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !imageUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // 获取容器尺寸
      const container = containerRef.current;
      const maxWidth = container ? container.clientWidth - 48 : 800;
      const maxHeight = window.innerHeight * 0.6;

      let width = img.naturalWidth;
      let height = img.naturalHeight;
      const aspectRatio = width / height;

      // 适应容器
      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;
      setCanvasSize({ width, height });
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);

      // 绘制标记
      drawMarks(ctx, marks, width, height);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // 重新绘制标记
  useEffect(() => {
    if (!canvasRef.current || !imageUrl || canvasSize.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawMarks(ctx, marks, canvas.width, canvas.height);
    };
    img.src = imageUrl;
  }, [marks, imageUrl, canvasSize]);

  // 绘制标记
  const drawMarks = (
    ctx: CanvasRenderingContext2D,
    marks: ImageMark[],
    width: number,
    height: number
  ) => {
    marks.forEach((mark) => {
      const x = mark.x * width;
      const y = mark.y * height;
      const { size, fontSize, bgColor, textColor, borderColor, borderWidth, shadow } = mergedStyle;

      // 绘制阴影
      if (shadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }

      // 绘制圆形背景
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = bgColor;
      ctx.fill();

      // 绘制边框
      if (borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }

      // 重置阴影
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 绘制数字
      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(mark.number), x, y);
    });
  };

  // 处理画布点击
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

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
        setMarks(newMarks);
      } else {
        // 添加新标记
        const newMark: ImageMark = {
          id: `mark-${Date.now()}-${marks.length + 1}`,
          number: marks.length + 1,
          x,
          y,
        };
        setMarks([...marks, newMark]);
      }
    },
    [marks, mergedStyle.size]
  );

  // 清除所有标记
  const handleClear = () => {
    setMarks([]);
  };

  // 确认并保存
  const handleConfirm = async () => {
    if (marks.length === 0) {
      onClose();
      return;
    }

    setIsGenerating(true);
    try {
      // 生成带标记的图片
      const markedImageDataUrl = await generateMarkedImageDataUrl(
        imageUrl,
        marks,
        mergedStyle,
        1200, // 最大宽度
        1200  // 最大高度
      );
      onSave(marks, markedImageDataUrl);
      onClose();
    } catch (error) {
      console.error("Failed to generate marked image:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div
        ref={containerRef}
        className="relative bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                添加标记点
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                点击图片添加标记，点击标记可删除
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* 提示信息 */}
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
          <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">使用方法：</p>
              <p>在图片上点击添加数字标记（①②③...），然后在提示词中引用这些标记来描述需要修改的区域。</p>
              <p className="mt-1 text-blue-600 dark:text-blue-400">例如：「把 ① 换成猫」「移除 ② 和 ③」</p>
            </div>
          </div>
        </div>

        {/* 画布区域 */}
        <div className="flex-1 p-6 overflow-auto bg-neutral-50 dark:bg-neutral-950">
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="rounded-xl shadow-lg cursor-crosshair"
              style={{ maxWidth: "100%", maxHeight: "60vh" }}
            />
          </div>
        </div>

        {/* 标记列表 */}
        {marks.length > 0 && (
          <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                已添加 {marks.length} 个标记：
              </span>
              {marks.map((mark) => (
                <span
                  key={mark.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium"
                >
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                    {mark.number}
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    ({(mark.x * 100).toFixed(0)}%, {(mark.y * 100).toFixed(0)}%)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <button
            onClick={handleClear}
            disabled={marks.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清除全部
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
                marks.length > 0
                  ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/25"
                  : "bg-neutral-400 hover:bg-neutral-500",
                isGenerating && "opacity-70 cursor-wait"
              )}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {marks.length > 0 ? `确认 (${marks.length} 个标记)` : "完成"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageMarkerModal;
