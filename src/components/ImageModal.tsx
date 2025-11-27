"use client";

import { Download, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  prompt?: string;
  onClose: () => void;
}

export default function ImageModal({ isOpen, imageUrl, prompt, onClose }: ImageModalProps) {
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ESC 键关闭弹框
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 计算适应屏幕的缩放比例
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });

      // 获取可视区域尺寸（减去 padding 和工具栏）
      const viewportWidth = window.innerWidth - 160; // 两边各80px padding
      const viewportHeight = window.innerHeight - 160; // 上下各80px padding

      // 计算适应屏幕的缩放比例
      const scaleX = viewportWidth / img.width;
      const scaleY = viewportHeight / img.height;
      const fitScale = Math.min(scaleX, scaleY, 1); // 不超过原始大小

      setFitZoom(fitScale);
      setZoom(fitScale); // 默认使用适应屏幕的缩放
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nanobanana-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.25, 10)); // 最大 1000%，使用乘法使缩放更自然
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.25, 0.1)); // 最小 10%，使用除法使缩放更自然
  };

  const handleFitScreen = () => {
    setZoom(fitZoom); // 重置为适应屏幕
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
    // 延迟重置缩放，避免关闭动画时看到缩放变化
    setTimeout(() => {
      setZoom(fitZoom);
      setScrollPos({ x: 0, y: 0 });
    }, 300);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > fitZoom) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - scrollPos.x, y: e.clientY - scrollPos.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setScrollPos({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    // 使用乘法缩放使体验更自然
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(10, prev * factor)));
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* 顶部工具栏 */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/50 to-transparent flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3 flex-1 mr-4 overflow-hidden">
          {prompt && (
            <div className="group relative flex-1">
              <span className="text-white text-sm font-medium block truncate cursor-help">
                {prompt}
              </span>
              {/* 悬停显示完整prompt */}
              {prompt.length > 80 && (
                <div className="absolute top-full left-0 mt-2 bg-black/95 text-white text-xs p-3 rounded-lg shadow-2xl max-w-[600px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20 whitespace-normal break-words">
                  {prompt}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 适应屏幕按钮 */}
          <button
            onClick={handleFitScreen}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="适应屏幕"
          >
            <Maximize className="w-5 h-5" />
          </button>

          {/* 缩放控制 */}
          <button
            onClick={handleZoomOut}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="缩小 (10%-200%)"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-white text-sm font-medium min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="放大 (10%-200%)"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* 图片尺寸显示 */}
          {imageSize.width > 0 && (
            <span className="text-white/60 text-xs ml-2">
              {imageSize.width} × {imageSize.height}
            </span>
          )}

          {/* 下载按钮 */}
          <button
            onClick={handleDownload}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg ml-2"
            title="下载图片"
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">下载</span>
          </button>

          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors ml-2"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 图片容器 */}
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center p-20 overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: zoom > fitZoom ? (isDragging ? "grabbing" : "grab") : "default",
        }}
      >
        <img
          src={imageUrl}
          alt="Preview"
          className="max-w-none transition-transform duration-200 rounded-lg shadow-2xl select-none"
          style={{
            transform: `scale(${zoom}) translate(${scrollPos.x / zoom}px, ${scrollPos.y / zoom}px)`,
            transformOrigin: "center center",
          }}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()} // 防止默认拖拽行为
        />
      </div>

      {/* 底部提示 */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-xs px-4 py-2 rounded-full">
        {zoom > fitZoom ? "拖拽移动图片 • 滚轮缩放 • ESC 退出" : "滚轮缩放 • 点击背景或按 ESC 关闭"}
      </div>
    </div>
  );
}
