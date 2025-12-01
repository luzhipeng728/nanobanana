"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Check, Trash2, MapPin, Info, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ImageMark,
  ArrowMark,
  ImageMarkerModalProps,
  MarkerStyle,
  ArrowStyle,
  DEFAULT_MARKER_STYLE,
  DEFAULT_ARROW_STYLE,
} from "./types";

type MarkMode = "point" | "arrow";

/**
 * 图片标记弹窗组件
 * 支持定位点标记和箭头方向标记
 */
export function ImageMarkerModal({
  isOpen,
  onClose,
  imageUrl,
  initialMarks = [],
  initialArrows = [],
  onSave,
  style = {},
  arrowStyle = {},
}: ImageMarkerModalProps) {
  const [marks, setMarks] = useState<ImageMark[]>(initialMarks);
  const [arrows, setArrows] = useState<ArrowMark[]>(initialArrows);
  const [mode, setMode] = useState<MarkMode>("point");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 箭头点击状态（点击两次画箭头：第一次=起点，第二次=终点）
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);

  const mergedStyle: MarkerStyle = { ...DEFAULT_MARKER_STYLE, ...style };
  const mergedArrowStyle: ArrowStyle = { ...DEFAULT_ARROW_STYLE, ...arrowStyle };

  // 重置标记 - 只在弹窗打开时重置
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      // 只在从关闭变为打开时重置
      setMarks(initialMarks);
      setArrows(initialArrows);
      setImageError(false);
      setImageLoaded(false);
      setMode("point");
      setArrowStart(null);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, initialMarks, initialArrows]);

  // 处理图片点击
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (mode === "point") {
        // 定位点模式：点击添加/删除标记
        const clickedMark = marks.find((mark) => {
          const distanceX = Math.abs(x - mark.x) * rect.width;
          const distanceY = Math.abs(y - mark.y) * rect.height;
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
      } else {
        // 箭头模式：第一次点击=起点，第二次点击=终点
        if (!arrowStart) {
          // 设置起点
          setArrowStart({ x, y });
        } else {
          // 设置终点，创建箭头
          const newArrow: ArrowMark = {
            id: `arrow-${Date.now()}-${arrows.length + 1}`,
            number: arrows.length + 1,
            startX: arrowStart.x,
            startY: arrowStart.y,
            endX: x,
            endY: y,
          };
          setArrows([...arrows, newArrow]);
          setArrowStart(null); // 重置起点
        }
      }
    },
    [mode, marks, arrows, arrowStart, mergedStyle.size]
  );

  // 删除定位点标记
  const handleRemoveMark = useCallback((markId: string) => {
    setMarks((prev) => {
      const filtered = prev.filter((m) => m.id !== markId);
      return filtered.map((m, index) => ({ ...m, number: index + 1 }));
    });
  }, []);

  // 删除箭头标记
  const handleRemoveArrow = useCallback((arrowId: string) => {
    setArrows((prev) => {
      const filtered = prev.filter((a) => a.id !== arrowId);
      return filtered.map((a, index) => ({ ...a, number: index + 1 }));
    });
  }, []);

  // 清除所有标记
  const handleClear = () => {
    setMarks([]);
    setArrows([]);
  };

  // 确认并保存
  const handleConfirm = async () => {
    // 如果没有任何标记，清除 markerData 并恢复原图
    if (marks.length === 0 && arrows.length === 0) {
      onSave([], [], "");
      onClose();
      return;
    }

    setIsGenerating(true);
    try {
      // 调用服务端 API 生成带标记的图片并上传到 R2
      const response = await fetch('/api/image-marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          marks,
          arrows,
          style: mergedStyle,
          arrowStyle: mergedArrowStyle,
          maxWidth: 1200,
          maxHeight: 1200,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.url) {
        console.log(`[ImageMarkerModal] Marked image uploaded: ${result.url}`);
        onSave(marks, arrows, result.url);
        onClose();
      } else {
        throw new Error(result.error || 'Failed to generate marked image');
      }
    } catch (error) {
      console.error("Failed to generate marked image:", error);
      // 如果失败，仍然保存标记数据，使用原图
      onSave(marks, arrows, imageUrl);
      onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  const totalCount = marks.length + arrows.length;

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
                添加标记
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                选择模式后在图片上标记
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

        {/* 模式切换 */}
        <div className="px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mr-2">标记模式：</span>
            <button
              onClick={() => setMode("point")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                mode === "point"
                  ? "bg-red-500 text-white shadow-md"
                  : "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-700"
              )}
            >
              <MapPin className="w-3.5 h-3.5" />
              定位点
            </button>
            <button
              onClick={() => setMode("arrow")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                mode === "arrow"
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-700"
              )}
            >
              <MoveRight className="w-3.5 h-3.5" />
              方向箭头
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
          <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {mode === "point" ? (
                <>
                  <p className="font-medium">定位点模式：</p>
                  <p>点击图片添加数字标记（①②③...），点击已有标记可删除</p>
                  <p className="mt-1 text-blue-600 dark:text-blue-400">例如：「把 ① 换成猫」「移除 ② 和 ③」</p>
                </>
              ) : (
                <>
                  <p className="font-medium">方向箭头模式：</p>
                  <p>点击两次绘制箭头：第一次点击 = 起点，第二次点击 = 终点</p>
                  {arrowStart && (
                    <p className="mt-1 text-green-600 dark:text-green-400 font-medium">✓ 已选择起点，请点击终点位置</p>
                  )}
                  <p className="mt-1 text-blue-600 dark:text-blue-400">例如：「按 ➀ 方向移动镜头」「让人物朝 ➁ 方向看」</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 图片区域 */}
        <div className="flex-1 p-6 overflow-auto bg-neutral-50 dark:bg-neutral-950">
          <div className="flex justify-center">
            <div
              className={cn(
                "relative rounded-xl shadow-lg inline-block select-none cursor-crosshair"
              )}
              onClick={handleImageClick}
            >
              {/* 原图 */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="待标记图片"
                className="max-w-full max-h-[60vh] object-contain block"
                draggable={false}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />

              {/* 定位点标记层 */}
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

              {/* 箭头标记层 */}
              {arrows.map((arrow) => (
                <ArrowOverlay
                  key={arrow.id}
                  arrow={arrow}
                  style={mergedArrowStyle}
                  onRemove={() => handleRemoveArrow(arrow.id)}
                />
              ))}

              {/* 箭头起点预览（等待点击终点） */}
              {arrowStart && (
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: `${arrowStart.x * 100}%`,
                    top: `${arrowStart.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                </div>
              )}

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
        {(marks.length > 0 || arrows.length > 0) && (
          <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 定位点 */}
              {marks.length > 0 && (
                <>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    定位点 ({marks.length})：
                  </span>
                  {marks.map((mark) => (
                    <span
                      key={mark.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      onClick={() => handleRemoveMark(mark.id)}
                      title="点击删除"
                    >
                      <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                        {mark.number}
                      </span>
                      <X className="w-3 h-3 text-red-400 hover:text-red-600" />
                    </span>
                  ))}
                </>
              )}
              {/* 箭头 */}
              {arrows.length > 0 && (
                <>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 ml-2">
                    箭头 ({arrows.length})：
                  </span>
                  {arrows.map((arrow) => (
                    <span
                      key={arrow.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      onClick={() => handleRemoveArrow(arrow.id)}
                      title="点击删除"
                    >
                      <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                        {arrow.number}
                      </span>
                      <MoveRight className="w-3 h-3" />
                      <X className="w-3 h-3 text-blue-400 hover:text-blue-600" />
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <button
            onClick={handleClear}
            disabled={totalCount === 0}
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
                totalCount > 0
                  ? "bg-gradient-to-r from-red-500 to-blue-500 hover:from-red-600 hover:to-blue-600 shadow-lg"
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
                  {totalCount > 0 ? `确认 (${totalCount} 个标记)` : "完成"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 箭头 Overlay 组件
 */
function ArrowOverlay({
  arrow,
  style,
  onRemove,
}: {
  arrow: ArrowMark;
  style: ArrowStyle;
  onRemove: () => void;
}) {
  // 计算箭头中点位置（用于显示数字）
  const midX = (arrow.startX + arrow.endX) / 2;
  const midY = (arrow.startY + arrow.endY) / 2;

  // 计算箭头角度
  const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);

  return (
    <>
      {/* SVG 箭头线 */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id={`arrowhead-${arrow.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={style.strokeColor}
            />
          </marker>
        </defs>
        <line
          x1={`${arrow.startX * 100}%`}
          y1={`${arrow.startY * 100}%`}
          x2={`${arrow.endX * 100}%`}
          y2={`${arrow.endY * 100}%`}
          stroke={style.strokeColor}
          strokeWidth={style.strokeWidth}
          markerEnd={`url(#arrowhead-${arrow.id})`}
          style={{ filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.3))' }}
        />
      </svg>

      {/* 箭头中间的数字标记 */}
      <div
        className="absolute cursor-pointer hover:scale-110 transition-transform z-20"
        style={{
          left: `${midX * 100}%`,
          top: `${midY * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="点击删除此箭头"
      >
        <div
          className="flex items-center justify-center rounded-full font-bold"
          style={{
            width: style.numberSize,
            height: style.numberSize,
            backgroundColor: style.numberBgColor,
            color: style.numberTextColor,
            fontSize: style.numberFontSize,
            border: '2px solid white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {arrow.number}
        </div>
      </div>
    </>
  );
}

export default ImageMarkerModal;
