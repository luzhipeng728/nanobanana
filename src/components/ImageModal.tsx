"use client";

import { Download, X, ZoomIn, ZoomOut, Maximize, Copy, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
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

      // 获取可视区域尺寸（考虑右侧面板）
      const hasPrompt = prompt && prompt.length > 0;
      const viewportWidth = window.innerWidth - (hasPrompt ? 480 : 160); // 右侧面板 400px + padding
      const viewportHeight = window.innerHeight - 160;

      // 计算适应屏幕的缩放比例
      const scaleX = viewportWidth / img.width;
      const scaleY = viewportHeight / img.height;
      const fitScale = Math.min(scaleX, scaleY, 1);

      setFitZoom(fitScale);
      setZoom(fitScale);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl, prompt]);

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setScrollPos({ x: 0, y: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const fileName = `nanobanana-${Date.now()}.png`;
    // 使用服务端 API 下载，绕过 CORS
    const downloadUrl = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(fileName)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.25, 10));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.25, 0.1));
  };

  const handleFitScreen = () => {
    setZoom(fitZoom);
    setScrollPos({ x: 0, y: 0 });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
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
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(10, prev * factor)));
  };

  const hasPrompt = prompt && prompt.length > 0;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex"
      onClick={handleBackdropClick}
    >
      {/* 左侧：图片区域 */}
      <div className={`flex-1 flex flex-col ${hasPrompt ? '' : 'w-full'}`}>
        {/* 顶部工具栏 */}
        <div className="h-16 bg-gradient-to-b from-black/50 to-transparent flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-3">
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
              title="缩小"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-white text-sm font-medium min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
              title="放大"
            >
              <ZoomIn className="w-5 h-5" />
            </button>

            {/* 图片尺寸显示 */}
            {imageSize.width > 0 && (
              <span className="text-white/60 text-xs ml-2">
                {imageSize.width} × {imageSize.height}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 下载按钮 */}
            <button
              onClick={handleDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg"
              title="下载图片"
            >
              <Download className="w-5 h-5" />
              <span className="font-medium">下载</span>
            </button>

            {/* 关闭按钮 - 无 prompt 时显示 */}
            {!hasPrompt && (
              <button
                onClick={handleClose}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors ml-2"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 图片容器 */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-8 overflow-hidden"
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
            onDragStart={(e) => e.preventDefault()}
          />
        </div>

        {/* 底部提示 - 无 prompt 时显示 */}
        {!hasPrompt && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-xs px-4 py-2 rounded-full">
            {zoom > fitZoom ? "拖拽移动图片 • 滚轮缩放 • ESC 退出" : "滚轮缩放 • 点击背景或按 ESC 关闭"}
          </div>
        )}
      </div>

      {/* 右侧：提示词面板 */}
      {hasPrompt && (
        <div
          className="w-[400px] bg-neutral-900 border-l border-neutral-800 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-300">提示词</h3>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 提示词内容 */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700">
              <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                {prompt}
              </p>
            </div>
          </div>

          {/* 底部操作 */}
          <div className="p-4 border-t border-neutral-800">
            <button
              onClick={handleCopyPrompt}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制提示词
                </>
              )}
            </button>
          </div>

          {/* 底部提示 */}
          <div className="px-4 pb-4">
            <p className="text-[10px] text-neutral-500 text-center">
              {zoom > fitZoom ? "拖拽移动 • 滚轮缩放 • ESC 退出" : "滚轮缩放 • ESC 关闭"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
