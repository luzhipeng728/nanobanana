"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, Images, Loader2, ZoomIn, ZoomOut, RotateCcw, ArrowLeft, Home, PlayCircle, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideshowViewerProps {
  slideshowId: string;
  title: string;
  images: string[];
  createdAt: string;
  videoUrl?: string;
  videoStatus?: string;
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

// TTS 发音人列表
const TTS_SPEAKERS = [
  { key: 'zh_female_vivi', name: 'Vivi (通用)', category: '通用场景' },
  { key: 'zh_male_ruyayichen', name: '儒雅逸辰', category: '通用场景' },
  { key: 'zh_female_xiaohe', name: '小何', category: '通用场景' },
  { key: 'zh_male_dayi', name: '大壹', category: '视频配音' },
  { key: 'zh_female_mizai', name: '咪仔', category: '视频配音' },
  { key: 'zh_female_jitangnv', name: '鸡汤女', category: '视频配音' },
  { key: 'zh_female_meilinvyou', name: '魅力女友', category: '视频配音' },
];

export default function SlideshowViewer({
  slideshowId,
  title,
  images,
  createdAt,
  videoUrl: initialVideoUrl,
  videoStatus: initialVideoStatus,
}: SlideshowViewerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // 视频模式状态
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [videoStatus, setVideoStatus] = useState(initialVideoStatus);

  // 视频生成相关状态
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateMessage, setGenerateMessage] = useState("");
  const [generateError, setGenerateError] = useState("");

  // TTS 配置
  const [speaker, setSpeaker] = useState("zh_female_vivi");
  const [speed, setSpeed] = useState(1.0);
  const [transition, setTransition] = useState("fade");

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

  // 生成解说视频
  const handleGenerateVideo = async () => {
    setIsGenerating(true);
    setGenerateProgress(0);
    setGenerateMessage("正在初始化...");
    setGenerateError("");

    try {
      const response = await fetch("/api/slideshow/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideshowId,
          speaker,
          transition,
          speed,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "视频生成失败");
      }

      // 处理 SSE 流
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'progress') {
                setGenerateProgress(data.percent);
                setGenerateMessage(data.message);
              } else if (data.type === 'complete') {
                setVideoUrl(data.videoUrl);
                setVideoStatus('completed');
                setShowGenerateModal(false);
                setShowVideo(true);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* 顶部信息栏 */}
      <header className="flex-shrink-0 bg-black/80 backdrop-blur-sm border-b border-white/10 px-4 py-3 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 返回画廊按钮 */}
            <button
              onClick={() => router.push('/gallery')}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors group"
              title="返回画廊"
            >
              <ArrowLeft className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
            </button>
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
            {/* 生成解说视频按钮 - 仅当没有视频且不在生成中时显示 */}
            {!videoUrl && videoStatus !== 'generating' && (
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-300 hover:from-orange-500/30 hover:to-amber-500/30 transition-all"
              >
                <PlayCircle className="w-4 h-4" />
                <span className="text-sm font-medium">生成解说</span>
              </button>
            )}

            {/* 生成中状态 */}
            {videoStatus === 'generating' && !videoUrl && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/20 text-yellow-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">生成中...</span>
              </div>
            )}

            {/* 视频/图片切换按钮 */}
            {videoUrl && (
              <button
                onClick={() => setShowVideo(!showVideo)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
                  showVideo
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    : "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 hover:from-purple-500/30 hover:to-pink-500/30"
                )}
              >
                {showVideo ? (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">看图片</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">讲解视频</span>
                  </>
                )}
              </button>
            )}

            {/* 缩放控制 - 仅图片模式 */}
            {!showVideo && (
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
            )}

            {/* 页码指示器 - 仅图片模式 */}
            {!showVideo && (
              <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
                <span className="text-sm font-medium text-white">
                  {currentIndex + 1} / {images.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 视频播放模式 */}
      {showVideo && videoUrl ? (
        <main className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-w-full max-h-full w-auto h-auto"
            controls
            autoPlay
            playsInline
            style={{
              maxWidth: '90vw',
              maxHeight: 'calc(100vh - 80px)',
            }}
          >
            您的浏览器不支持视频播放
          </video>
        </main>
      ) : (
        <>
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
        </>
      )}

      {/* 生成视频模态框 */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">生成解说视频</h3>
              {!isGenerating && (
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-white/70" />
                </button>
              )}
            </div>

            {/* 内容区 */}
            <div className="p-4 space-y-4">
              {!isGenerating ? (
                <>
                  {/* 发音人选择 */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      选择发音人
                    </label>
                    <select
                      value={speaker}
                      onChange={(e) => setSpeaker(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    >
                      {TTS_SPEAKERS.map((s) => (
                        <option key={s.key} value={s.key} className="bg-neutral-800">
                          {s.name} ({s.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 语速 */}
                  <div>
                    <label className="flex items-center justify-between text-sm font-medium text-neutral-400 mb-2">
                      <span>语速</span>
                      <span className="text-orange-400">{speed.toFixed(1)}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-orange-200/20 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                      <span>慢 0.5x</span>
                      <span>正常 1.0x</span>
                      <span>快 2.0x</span>
                    </div>
                  </div>

                  {/* 转场效果 */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      转场效果
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 'fade', label: '淡入淡出' },
                        { value: 'none', label: '无转场' },
                      ].map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setTransition(t.value)}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-xl text-sm transition-all",
                            transition === t.value
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/50"
                              : "bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {generateError && (
                    <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                      {generateError}
                    </div>
                  )}
                </>
              ) : (
                /* 生成进度 */
                <div className="py-8 space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
                    <div className="text-center">
                      <p className="text-white font-medium">{generateMessage}</p>
                      <p className="text-sm text-neutral-400 mt-1">{generateProgress}%</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                      style={{ width: `${generateProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            {!isGenerating && (
              <div className="p-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerateVideo}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-colors"
                >
                  开始生成
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
