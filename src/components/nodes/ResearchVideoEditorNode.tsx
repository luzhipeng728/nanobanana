"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from "@xyflow/react";
import { Loader2, Film, Download, Play, RefreshCw, ExternalLink } from "lucide-react";
import { NodeButton } from "@/components/ui/NodeUI";
import { Timeline } from "@/components/research-video/Timeline";
import { SegmentDetail } from "@/components/research-video/SegmentDetail";
import { cn } from "@/lib/utils";

// 分段类型
interface Segment {
  id: string;
  order: number;
  text: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  imagePrompt?: string;
  ttsStatus: string;
  imageStatus: string;
}

interface ResearchVideoEditorNodeData {
  projectId: string;
  title?: string;
  segments?: Segment[];
}

const ResearchVideoEditorNode = ({ data, id, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  // 状态
  const [projectId] = useState(data.projectId);
  const [title, setTitle] = useState(data.title || "研究视频");
  const [segments, setSegments] = useState<Segment[]>(data.segments || []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(!data.segments);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 计算总时长
  const totalDuration = segments.reduce((sum, s) => sum + (s.audioDuration || 3), 0);

  // 加载项目数据
  useEffect(() => {
    if (data.segments) {
      setSegments(data.segments);
      setIsLoading(false);
      return;
    }

    const loadProject = async () => {
      try {
        const res = await fetch(`/api/research-video/${projectId}`);
        const { project } = await res.json();

        setTitle(project.title || "研究视频");
        setSegments(project.segments || []);
        setVideoUrl(project.videoUrl || null);
      } catch (error) {
        setError("加载项目失败");
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId, data.segments]);

  // 选中的分段
  const selectedSegment = segments[selectedIndex];

  // 重新生成 TTS
  const handleRegenerateTTS = useCallback(async (segmentId: string, newText?: string) => {
    setSegments(prev => prev.map(s =>
      s.id === segmentId ? { ...s, ttsStatus: "generating" } : s
    ));

    try {
      const res = await fetch("/api/research-video/tts/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId, text: newText }),
      });

      if (!res.ok) throw new Error("重新生成失败");

      const { audioUrl, duration } = await res.json();

      setSegments(prev => prev.map(s =>
        s.id === segmentId
          ? { ...s, audioUrl, audioDuration: duration, ttsStatus: "completed" }
          : s
      ));
    } catch (error) {
      setSegments(prev => prev.map(s =>
        s.id === segmentId ? { ...s, ttsStatus: "failed" } : s
      ));
      setError("语音重新生成失败");
    }
  }, []);

  // 重新生成图片
  const handleRegenerateImage = useCallback(async (segmentId: string, customPrompt?: string) => {
    setSegments(prev => prev.map(s =>
      s.id === segmentId ? { ...s, imageStatus: "generating" } : s
    ));

    try {
      const res = await fetch("/api/research-video/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId, customPrompt }),
      });

      if (!res.ok) throw new Error("重新生成失败");

      const { imageUrl, prompt } = await res.json();

      setSegments(prev => prev.map(s =>
        s.id === segmentId
          ? { ...s, imageUrl, imagePrompt: prompt, imageStatus: "completed" }
          : s
      ));
    } catch (error) {
      setSegments(prev => prev.map(s =>
        s.id === segmentId ? { ...s, imageStatus: "failed" } : s
      ));
      setError("图片重新生成失败");
    }
  }, []);

  // 更新文本
  const handleUpdateText = useCallback(async (segmentId: string, text: string) => {
    try {
      await fetch(`/api/research-video/segment/${segmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      setSegments(prev => prev.map(s =>
        s.id === segmentId ? { ...s, text } : s
      ));
    } catch (error) {
      setError("更新文本失败");
    }
  }, []);

  // 合成视频
  const handleCompose = useCallback(async () => {
    // 检查所有分段是否完整
    const incomplete = segments.filter(s => !s.audioUrl || !s.imageUrl);
    if (incomplete.length > 0) {
      setError(`${incomplete.length} 个分段尚未完成`);
      return;
    }

    setIsComposing(true);
    setComposeProgress(0);
    setError(null);

    try {
      const response = await fetch("/api/research-video/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) throw new Error("合成请求失败");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.progress) {
                setComposeProgress(data.progress);
              }

              if (data.type === "compose_complete") {
                setVideoUrl(data.data.videoUrl);
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "合成失败");
    } finally {
      setIsComposing(false);
    }
  }, [projectId, segments]);

  // 创建视频结果节点
  const createVideoNode = useCallback(() => {
    if (!videoUrl) return;

    const newNodeId = `research-video-${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: "researchVideo",
      position: { x: 850, y: 0 },
      style: { width: 400, height: 300 },
      data: {
        projectId,
        title,
        videoUrl,
        duration: totalDuration,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${id}-${newNodeId}`,
        source: id,
        target: newNodeId,
      },
    ]);
  }, [id, projectId, title, videoUrl, totalDuration, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        color="#8B5CF6"
        isVisible={selected}
        minWidth={600}
        minHeight={400}
      />

      <div className={cn(
        "bg-gray-900 border rounded-lg overflow-hidden h-full flex flex-col",
        selected ? "border-purple-500" : "border-gray-700"
      )}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">{title}</span>
            <span className="text-xs text-gray-500">
              {Math.floor(totalDuration / 60)}:{Math.floor(totalDuration % 60).toString().padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {videoUrl ? (
              <>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  查看视频
                </a>
                <NodeButton
                  onClick={createVideoNode}
                  className="text-xs bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-3 h-3 mr-1" />
                  导出节点
                </NodeButton>
              </>
            ) : (
              <NodeButton
                onClick={handleCompose}
                disabled={isComposing}
                className="text-xs bg-purple-600 hover:bg-purple-700"
              >
                {isComposing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    合成中 {composeProgress}%
                  </>
                ) : (
                  <>
                    <Film className="w-3 h-3 mr-1" />
                    合成视频
                  </>
                )}
              </NodeButton>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* 主体区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 nowheel">
          {/* 时间线 */}
          <Timeline
            segments={segments}
            selectedIndex={selectedIndex}
            onSelectSegment={setSelectedIndex}
            totalDuration={totalDuration}
          />

          {/* 分段详情 */}
          {selectedSegment && (
            <SegmentDetail
              segment={selectedSegment}
              onRegenerateTTS={handleRegenerateTTS}
              onRegenerateImage={handleRegenerateImage}
              onUpdateText={handleUpdateText}
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
          <span>{segments.length} 个分段</span>
          <span>
            TTS: {segments.filter(s => s.audioUrl).length}/{segments.length} |
            图片: {segments.filter(s => s.imageUrl).length}/{segments.length}
          </span>
        </div>
      </div>
    </>
  );
};

export default memo(ResearchVideoEditorNode);
