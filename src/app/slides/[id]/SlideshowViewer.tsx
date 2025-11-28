"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Grid3X3, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideshowViewerProps {
  title: string;
  images: string[];
  createdAt: string;
}

export default function SlideshowViewer({
  title,
  images,
  createdAt,
}: SlideshowViewerProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;

      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev - 1 + images.length) % images.length : null
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % images.length : null
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, images.length]);

  // 阻止灯箱打开时的背景滚动
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  // 标记图片加载完成
  const handleImageLoad = useCallback((index: number) => {
    setLoadedImages((prev) => new Set(prev).add(index));
  }, []);

  // 打开灯箱
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  // 关闭灯箱
  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  // 上一张
  const goToPrev = () => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + images.length) % images.length : null
    );
  };

  // 下一张
  const goToNext = () => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % images.length : null
    );
  };

  // 格式化日期
  const formattedDate = new Date(createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* 头部 */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Grid3X3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {title}
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Calendar className="w-3 h-3" />
                  <span>{formattedDate}</span>
                  <span className="mx-1">·</span>
                  <span>{images.length} 张图片</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 网格展示 */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {images.map((url, index) => (
            <div
              key={index}
              className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-neutral-200 dark:bg-neutral-800 cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              onClick={() => openLightbox(index)}
            >
              {/* 加载占位 */}
              {!loadedImages.has(index) && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800" />
              )}

              {/* 图片 */}
              <img
                src={url}
                alt={`图片 ${index + 1}`}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  loadedImages.has(index) ? "opacity-100" : "opacity-0"
                )}
                loading="lazy"
                onLoad={() => handleImageLoad(index)}
              />

              {/* 悬停遮罩 */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

              {/* 序号角标 */}
              <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <span className="text-xs font-bold text-white">
                  {index + 1}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* 灯箱 */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* 关闭按钮 */}
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            onClick={closeLightbox}
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* 页码指示器 */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
            <span className="text-sm font-medium text-white">
              {lightboxIndex + 1} / {images.length}
            </span>
          </div>

          {/* 上一张按钮 */}
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          {/* 下一张按钮 */}
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>

          {/* 当前图片 */}
          <div
            className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[lightboxIndex]}
              alt={`图片 ${lightboxIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* 底部缩略图导航 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm max-w-[90vw] overflow-x-auto">
            {images.map((url, index) => (
              <button
                key={index}
                className={cn(
                  "w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all",
                  index === lightboxIndex
                    ? "ring-2 ring-white scale-110"
                    : "opacity-50 hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(index);
                }}
              >
                <img
                  src={url}
                  alt={`缩略图 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
