"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow, addEdge } from "@xyflow/react";
import { Loader2, ChevronLeft, ChevronRight, Edit3, RefreshCw, Check, Plus } from "lucide-react";
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

type PPTEditorNodeData = {
  taskId: string;
  topic: string;
  isLoading: boolean;
  slides?: SlideData[];
  error?: string;
};

const PPTEditorNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { setNodes, setEdges, getNode } = useReactFlow();

  const [slides, setSlides] = useState<SlideData[]>(data.slides || []);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(data.isLoading);
  const [error, setError] = useState(data.error);

  // 轮询任务状态
  useEffect(() => {
    if (!data.taskId || !isLoading) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ppt/task?id=${data.taskId}`);
        const result = await response.json();

        if (result.success && result.task) {
          if (result.task.status === "completed") {
            setSlides(result.task.slides || []);
            setIsLoading(false);
            data.isLoading = false;
            data.slides = result.task.slides;
            clearInterval(pollInterval);
          } else if (result.task.status === "failed") {
            setError(result.task.error || "生成失败");
            setIsLoading(false);
            data.isLoading = false;
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [data.taskId, isLoading]);

  const currentSlide = slides[currentSlideIndex];

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const handleConfirm = useCallback(() => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    // 创建 PPTNode
    const pptNodeId = `ppt-${Date.now()}`;
    const newNode = {
      id: pptNodeId,
      type: "ppt",
      position: { x: currentNode.position.x + 520, y: currentNode.position.y },
      style: { width: 420, height: 360 },
      data: {
        taskId: data.taskId,
        topic: data.topic,
        slides,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => addEdge({
      id: `edge-${id}-${pptNodeId}`,
      source: id,
      target: pptNodeId,
    }, eds));
  }, [id, data.taskId, data.topic, slides, getNode, setNodes, setEdges]);

  return (
    <BaseNode
      title="PPT 编辑器"
      icon={Edit3}
      color="purple"
      selected={selected}
      className="!w-[480px]"
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-blue-500"
      />

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm text-neutral-500">正在生成 PPT...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <NodeButton onClick={() => setIsLoading(true)} variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </NodeButton>
          </div>
        ) : slides.length > 0 ? (
          <>
            {/* 幻灯片预览 */}
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[200px]">
              {currentSlide && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{currentSlide.title}</h3>
                  {currentSlide.subtitle && (
                    <p className="text-sm text-neutral-500">{currentSlide.subtitle}</p>
                  )}
                  {currentSlide.content && (
                    <ul className="text-sm space-y-1 mt-3">
                      {currentSlide.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500">•</span>
                          {item}
                        </li>
                      ))}
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
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-neutral-500">
                {currentSlideIndex + 1} / {slides.length}
              </span>
              <button
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* 缩略图导航 */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={cn(
                    "flex-shrink-0 w-16 h-12 rounded border-2 text-xs flex items-center justify-center transition-all",
                    index === currentSlideIndex
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-neutral-200 dark:border-neutral-700 hover:border-blue-300"
                  )}
                >
                  {index + 1}
                </button>
              ))}
              <button className="flex-shrink-0 w-16 h-12 rounded border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:border-blue-400 flex items-center justify-center">
                <Plus className="w-4 h-4 text-neutral-400" />
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <NodeButton variant="secondary" className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" />
                重新生成
              </NodeButton>
              <NodeButton onClick={handleConfirm} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                确认完成
              </NodeButton>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-12 text-neutral-500">
            暂无内容
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-green-500"
      />
    </BaseNode>
  );
};

export default memo(PPTEditorNode);
