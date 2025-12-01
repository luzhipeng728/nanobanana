"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Check, Trash2, MapPin, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ImageMark,
  ImageMarkerModalProps,
  MarkerStyle,
  DEFAULT_MARKER_STYLE,
} from "./types";
import { generateMarkedImageDataUrl } from "./useImageMarker";

/**
 * 图片标记弹窗组件
 * 用于在图片上添加 SoM 风格的数字标记
 * 使用 HTML 元素而非 Canvas，避免 CORS 问题
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
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const mergedStyle: MarkerStyle = { ...DEFAULT_MARKER_STYLE, ...style };

  // 重置标记
  useEffect(() => {
    if (isOpen) {
      setMarks(initialMarks);
      setImageError(false);
      setImageLoaded(false);
    }
  }, [isOpen, initialMarks]);

  // 处理图片点击 - 添加新标记
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // 检查是否点击了已有标记区域（通过相对坐标判断）
      const clickedMark = marks.find((mark) => {
        const markX = mark.x;
        const markY = mark.y;
        // 计算点击位置与标记中心的距离（以图片尺寸为基准）
        const distanceX = Math.abs(x - markX) * rect.width;
        const distanceY = Math.abs(y - markY) * rect.height;
        return distanceX < mergedStyle.size / 2 + 5 && distanceY < mergedStyle.size / 2 + 5;
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

  // 删除单个标记
  const handleRemoveMark = useCallback((markId: string) => {
    setMarks((prev) => {
      const filtered = prev.filter((m) => m.id !== markId);
      return filtered.map((m, index) => ({ ...m, number: index + 1 }));
    });
  }, []);

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
      // 生成带标记的图片（通过代理或服务端处理）
      const markedImageDataUrl = await generateMarkedImageDataUrl(
        imageUrl,
        marks,
        mergedStyle,
        1200,
        1200
      );
      onSave(marks, markedImageDataUrl);
      onClose();
    } catch (error) {
      console.error("Failed to generate marked image:", error);
      // 即使生成失败，也保存标记数据（可以在发送时重新生成）
      // 创建一个简单的占位图
      onSave(marks, imageUrl);
      onClose();
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

        {/* 图片区域 - 使用 HTML 元素而非 Canvas */}
        <div className="flex-1 p-6 overflow-auto bg-neutral-50 dark:bg-neutral-950">
          <div className="flex justify-center">
            <div
              className="relative cursor-crosshair rounded-xl shadow-lg inline-block"
              onClick={handleImageClick}
              style={{ position: 'relative' }}
            >
              {/* 原图 */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="待标记图片"
                className="max-w-full max-h-[60vh] object-contain block"
                onLoad={() => {
                  console.log('[ImageMarkerModal] Image loaded');
                  setImageLoaded(true);
                }}
                onError={() => {
                  console.log('[ImageMarkerModal] Image load error');
                  setImageError(true);
                }}
              />

              {/* 标记层 - 始终渲染，不依赖 imageLoaded */}
              {marks.map((mark) => (
                <div
                  key={mark.id}
                  className="absolute cursor-pointer hover:scale-110 transition-transform z-10"
                  style={{
                    left: `${mark.x * 100}%`,
                    top: `${mark.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveMark(mark.id);
                  }}
                  title="点击删除此标记"
                >
                  <div
                    className="flex items-center justify-center rounded-full font-bold"
                    style={{
                      width: mergedStyle.size,
                      height: mergedStyle.size,
                      backgroundColor: mergedStyle.bgColor,
                      color: mergedStyle.textColor,
                      fontSize: mergedStyle.fontSize,
                      border: `${mergedStyle.borderWidth}px solid ${mergedStyle.borderColor}`,
                      boxShadow: mergedStyle.shadow ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
                    }}
                  >
                    {mark.number}
                  </div>
                </div>
              ))}

              {/* 图片加载失败提示 */}
              {imageError && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-20">
                  <div className="text-center text-neutral-500">
                    <p className="text-sm">图片加载失败</p>
                    <p className="text-xs mt-1">请检查图片链接</p>
                  </div>
                </div>
              )}
            </div>
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  onClick={() => handleRemoveMark(mark.id)}
                  title="点击删除"
                >
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                    {mark.number}
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    ({(mark.x * 100).toFixed(0)}%, {(mark.y * 100).toFixed(0)}%)
                  </span>
                  <X className="w-3 h-3 text-red-400 hover:text-red-600" />
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
