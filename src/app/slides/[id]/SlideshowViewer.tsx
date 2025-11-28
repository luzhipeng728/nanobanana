"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar, Images, Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideshowViewerProps {
  title: string;
  images: string[];
  createdAt: string;
}

// 生成 Cloudflare Image Resizing URL
function getResizedUrl(url: string, options: { width?: number; quality?: number; blur?: number } = {}): string {
  const { width, quality = 80, blur } = options;

  // 检查是否是 doubao.luzhipeng.com 的图片
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const params = ['format=auto'];
      if (width) params.push(`width=${width}`);
      if (quality) params.push(`quality=${quality}`);
      if (blur) params.push(`blur=${blur}`);
      return `https://doubao.luzhipeng.com/cdn-cgi/image/${params.join(',')}${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

// 缩略图 URL
function getThumbnailUrl(url: string): string {
  return getResizedUrl(url, { width: 160, quality: 70 });
}

// 模糊预览图 URL（用于渐进式加载）- 用较大尺寸保证快速加载且不太模糊
function getBlurPreviewUrl(url: string): string {
  return getResizedUrl(url, { width: 400, quality: 50 });
}

export default function SlideshowViewer({
  title,
  images,
  createdAt,
}: SlideshowViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // 缩放和平移状态
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });

  // 重置缩放和位置
  const resetTransform = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPrev();
      } else if (e.key === "ArrowRight") {
        goToNext();
      } else if (e.key === "Escape") {
        resetTransform();
      } else if (e.key === "+" || e.key === "=") {
        setScale(s => Math.min(s * 1.2, 5));
      } else if (e.key === "-") {
        setScale(s => Math.max(s / 1.2, 0.5));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, resetTransform]);

  // 滚轮缩放
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(s => {
        const newScale = Math.min(Math.max(s * delta, 0.5), 5);
        // 如果缩放回到1以下，重置位置
        if (newScale <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return newScale;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // 当前图片变化时，滚动缩略图到可见位置并重置缩放
  useEffect(() => {
    if (thumbnailContainerRef.current) {
      const container = thumbnailContainerRef.current;
      const thumbnail = container.children[currentIndex] as HTMLElement;
      if (thumbnail) {
        const containerRect = container.getBoundingClientRect();
        const thumbnailRect = thumbnail.getBoundingClientRect();

        if (thumbnailRect.left < containerRect.left || thumbnailRect.right > containerRect.right) {
          thumbnail.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
      }
    }
    // 切换图片时重置缩放
    resetTransform();
  }, [currentIndex, resetTransform]);

  // 图片切换时重置加载状态，并检查缓存
  useEffect(() => {
    setIsImageLoading(true);
    setImageError(false);

    // 检查图片是否已缓存（立即可用）
    const img = new Image();
    img.src = images[currentIndex];
    if (img.complete) {
      // 图片已缓存，直接标记为加载完成
      setIsImageLoading(false);
    }
  }, [currentIndex, images]);

  // 上一张
  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // 下一张
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  // 格式化日期
  const formattedDate = new Date(createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return; // 只有放大时才能拖拽
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: positionStartRef.current.x + dx,
      y: positionStartRef.current.y + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 触摸滑动支持（切换图片）
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isPinching = useRef(false);
  const lastPinchDistance = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 双指捏合开始
      isPinching.current = true;
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastPinchDistance.current = distance;
    } else if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      if (scale > 1) {
        // 放大状态下开始拖拽
        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        positionStartRef.current = { ...position };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching.current) {
      // 双指捏合缩放
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastPinchDistance.current !== null) {
        const delta = distance / lastPinchDistance.current;
        setScale(s => Math.min(Math.max(s * delta, 0.5), 5));
      }
      lastPinchDistance.current = distance;
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // 单指拖拽（放大状态）
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPosition({
        x: positionStartRef.current.x + dx,
        y: positionStartRef.current.y + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isPinching.current) {
      isPinching.current = false;
      lastPinchDistance.current = null;
      if (scale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return;
    }

    setIsDragging(false);

    // 只有未放大时才支持滑动切换
    if (scale <= 1 && touchStartX.current !== null) {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX;

      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // 双击放大/还原
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (scale > 1) {
      resetTransform();
    } else {
      // 以点击位置为中心放大
      setScale(2.5);
    }
  };

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* 顶部信息栏 */}
      <header className="flex-shrink-0 bg-black/80 backdrop-blur-sm border-b border-white/10 px-4 py-3 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Images className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">
                {title}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Calendar className="w-3 h-3" />
                <span>{formattedDate}</span>
                <span className="mx-1">·</span>
                <span>{images.length} 张图片</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 缩放控制 */}
            <div className="hidden sm:flex items-center gap-1 mr-2">
              <button
                onClick={() => setScale(s => Math.max(s / 1.3, 0.5))}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="缩小"
              >
                <ZoomOut className="w-4 h-4 text-white" />
              </button>
              <span className="text-xs text-white/70 w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale(s => Math.min(s * 1.3, 5))}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="放大"
              >
                <ZoomIn className="w-4 h-4 text-white" />
              </button>
              {scale !== 1 && (
                <button
                  onClick={resetTransform}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors ml-1"
                  title="重置"
                >
                  <RotateCcw className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            {/* 页码指示器 */}
            <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="text-sm font-medium text-white">
                {currentIndex + 1} / {images.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 主图区域 */}
      <main
        ref={imageContainerRef}
        className={cn(
          "flex-1 relative flex items-center justify-center overflow-hidden",
          scale > 1 ? "cursor-grab" : "cursor-default",
          isDragging && "cursor-grabbing"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* 左右切换按钮 */}
        {images.length > 1 && scale <= 1 && (
          <>
            <button
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
              onClick={goToPrev}
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </button>
            <button
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
              onClick={goToNext}
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </button>
          </>
        )}

        {/* 加载指示器 - 只在模糊图也没加载时显示 */}

        {/* 加载失败提示 */}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center z-5">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <Images className="w-8 h-8 text-red-400" />
              </div>
              <span className="text-sm text-white/70">图片加载失败</span>
              <span className="text-xs text-white/40 max-w-xs break-all">{images[currentIndex]}</span>
            </div>
          </div>
        )}

        {/* 当前大图 - 渐进式加载 */}
        <div
          className="relative flex items-center justify-center"
          style={{
            width: '90vw',
            height: 'calc(100vh - 160px)',
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? "none" : "transform 0.2s ease-out",
          }}
        >
          {/* 预览图（快速加载，铺满容器） */}
          <img
            key={`preview-${currentIndex}`}
            src={getBlurPreviewUrl(images[currentIndex])}
            alt=""
            className={cn(
              "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
              isImageLoading ? "opacity-100" : "opacity-0"
            )}
            aria-hidden="true"
          />
          {/* 清晰大图（铺满同样容器） */}
          <img
            key={`main-${currentIndex}`}
            src={images[currentIndex]}
            alt={`图片 ${currentIndex + 1}`}
            className={cn(
              "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
              isImageLoading ? "opacity-0" : "opacity-100"
            )}
            onLoad={() => setIsImageLoading(false)}
            onError={() => {
              setIsImageLoading(false);
              setImageError(true);
            }}
            draggable={false}
          />
        </div>

        {/* 缩放提示 */}
        {scale <= 1 && !isImageLoading && !imageError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
            <span className="text-xs text-white/70">滚轮缩放 · 双击放大 · 拖拽平移</span>
          </div>
        )}
      </main>

      {/* 底部缩略图导航 */}
      <footer className="flex-shrink-0 bg-black/80 backdrop-blur-sm border-t border-white/10 px-4 py-3">
        <div
          ref={thumbnailContainerRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
        >
          {images.map((url, index) => (
            <button
              key={index}
              className={cn(
                "relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden transition-all duration-200",
                index === currentIndex
                  ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-105"
                  : "opacity-50 hover:opacity-80"
              )}
              onClick={() => setCurrentIndex(index)}
            >
              <img
                src={getThumbnailUrl(url)}
                alt={`缩略图 ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* 序号角标 */}
              <div className="absolute bottom-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-black/70 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">
                  {index + 1}
                </span>
              </div>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
