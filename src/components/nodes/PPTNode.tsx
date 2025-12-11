"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Maximize2, Download, Presentation } from "lucide-react";
import { NodeButton } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";
import { cn } from "@/lib/utils";

interface SlideData {
  id: string;
  layout: string;
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
}

type PPTNodeData = {
  taskId: string;
  topic: string;
  slides: SlideData[];
  pptUrl?: string;
};

const PPTNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  const [slides] = useState<SlideData[]>(data.slides || []);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentSlide = slides[currentSlideIndex];

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/ppt/export?id=${data.taskId}`);
      if (!response.ok) throw new Error("下载失败");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.topic || "presentation"}.pptx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("下载失败,请重试");
    }
  };

  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  // 键盘事件处理(全屏模式)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === "ArrowLeft") goToPrevSlide();
      if (e.key === "ArrowRight") goToNextSlide();
      if (e.key === "Escape") setIsFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, currentSlideIndex]);

  return (
    <>
      <BaseNode
        title="PPT 演示"
        icon={Presentation}
        color="purple"
        selected={selected}
        className="w-[320px]"
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-purple-500"
        />

        <div className="space-y-3">
          {slides.length > 0 ? (
            <>
              {/* 幻灯片预览 */}
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[180px]">
                {currentSlide && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base">{currentSlide.title}</h3>
                    {currentSlide.subtitle && (
                      <p className="text-xs text-neutral-500">{currentSlide.subtitle}</p>
                    )}
                    {currentSlide.content && (
                      <ul className="text-xs space-y-1 mt-2">
                        {currentSlide.content.slice(0, 4).map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-blue-500">•</span>
                            {item}
                          </li>
                        ))}
                        {currentSlide.content.length > 4 && (
                          <li className="text-neutral-400">...</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* 翻页控制 */}
              <div className="flex items-center justify-between">
                <button
                  onClick={goToPrevSlide}
                  disabled={currentSlideIndex === 0}
                  className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-neutral-500">
                  {currentSlideIndex + 1} / {slides.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleFullscreen}
                    className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="全屏播放"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextSlide}
                    disabled={currentSlideIndex === slides.length - 1}
                    className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 下载按钮 */}
              <NodeButton onClick={handleDownload} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                下载 PPT (.pptx)
              </NodeButton>
            </>
          ) : (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              暂无内容
            </div>
          )}
        </div>
      </BaseNode>

      {/* 全屏播放模式 */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="max-w-4xl w-full p-8" onClick={(e) => e.stopPropagation()}>
            {currentSlide && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-12 shadow-2xl">
                <h1 className="text-4xl font-bold mb-4">{currentSlide.title}</h1>
                {currentSlide.subtitle && (
                  <p className="text-xl text-neutral-500 mb-8">{currentSlide.subtitle}</p>
                )}
                {currentSlide.content && (
                  <ul className="text-xl space-y-4">
                    {currentSlide.content.map((item, i) => (
                      <li key={i} className="flex items-start gap-4">
                        <span className="text-blue-500">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-center mt-8 gap-4">
              <button
                onClick={goToPrevSlide}
                disabled={currentSlideIndex === 0}
                className="px-6 py-3 bg-white/10 rounded-lg text-white disabled:opacity-30"
              >
                上一页
              </button>
              <span className="px-6 py-3 text-white">
                {currentSlideIndex + 1} / {slides.length}
              </span>
              <button
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className="px-6 py-3 bg-white/10 rounded-lg text-white disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(PPTNode);
