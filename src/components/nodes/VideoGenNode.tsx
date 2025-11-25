"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Video as VideoIcon, Link2, UserPlus } from "lucide-react";
import { NodeTextarea, NodeSelect, NodeLabel, NodeButton } from "@/components/ui/NodeUI";
import { BaseNode } from "./BaseNode";
import cameoData from "@/data/composer_profiles.json";

type VideoGenNodeData = {
  prompt: string;
  orientation: "portrait" | "landscape";
  isGenerating: boolean;
};

interface CameoProfile {
  username: string;
  display_name?: string;
  profile_picture_url: string;
  verified: boolean;
}

const VideoGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addVideoNode, getConnectedImageNodes } = useCanvas();
  const { getNode } = useReactFlow();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(data.orientation || "portrait");
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectedImagesCount, setConnectedImagesCount] = useState<number>(0);
  const [showCameos, setShowCameos] = useState(false);
  const [selectedCameos, setSelectedCameos] = useState<string[]>([]);

  const cameos: CameoProfile[] = (cameoData as any).composer_profiles.map((p: any) => ({
    username: p.username,
    display_name: p.display_name || p.username,
    profile_picture_url: p.profile_picture_url,
    verified: p.verified || false,
  }));

  // 更新连接的图片数量
  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    setConnectedImagesCount(connectedNodes.length);
  }, [id, getConnectedImageNodes]);

  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value;
  };

  const handleCameoSelect = (username: string) => {
    if (selectedCameos.includes(username)) {
      // 取消选择
      setSelectedCameos(prev => prev.filter(u => u !== username));
    } else if (selectedCameos.length < 3) {
      // 选择新的 cameo
      setSelectedCameos(prev => [...prev, username]);

      const textarea = promptRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = prompt;
        const before = text.substring(0, start);
        const after = text.substring(end);
        const tag = `@${username} `;

        const newPrompt = before + tag + after;
        setPrompt(newPrompt);
        data.prompt = newPrompt;

        setTimeout(() => {
          const newPos = start + tag.length;
          textarea.setSelectionRange(newPos, newPos);
          textarea.focus();
        }, 0);
      }
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      // 获取连接的图片节点（用于图生视频）
      const connectedNodes = getConnectedImageNodes(id);
      const inputImage = connectedNodes.length > 0 ? connectedNodes[0].data.imageUrl : undefined;

      if (inputImage) {
        console.log(`Using input image for image-to-video: ${inputImage}`);
      }

      // 创建视频生成任务
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          orientation,
          inputImage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create video task");
      }

      const { taskId } = await response.json();
      console.log(`Created video task: ${taskId}`);

      // 立即创建一个 Video 节点，传入 taskId
      const currentNode = getNode(id);
      if (currentNode) {
        addVideoNode(
          taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y }
        );
      }
    } catch (error) {
      console.error("Failed to create video task", error);
      alert("Failed to create video task");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseNode
      title="Video Generator"
      icon={VideoIcon}
      color="orange"
      selected={selected}
      className="w-[320px]"
      headerActions={
        connectedImagesCount > 0 ? (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
            <Link2 className="w-3 h-3" />
            图生视频
          </span>
        ) : (
          <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium opacity-60">
            ← 可连接图片
          </span>
        )
      }
    >
      {/* 左侧输入连接点 - 接收参考图片用于图生视频 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-orange-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-orange-500/50"
        title="连接图片作为参考 (图生视频)"
      />

      <div className="space-y-3">
        <div>
          <NodeLabel>Orientation</NodeLabel>
          <NodeSelect
            value={orientation}
            onChange={(e) => {
              const val = e.target.value as "portrait" | "landscape";
              setOrientation(val);
              data.orientation = val;
            }}
            className="w-full"
          >
            <option value="portrait">Portrait (9:16)</option>
            <option value="landscape">Landscape (16:9)</option>
          </NodeSelect>
        </div>

        {/* Cameo Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <NodeLabel className="mb-0">Add Cameo</NodeLabel>
            <NodeButton
              variant="ghost"
              onClick={() => setShowCameos(!showCameos)}
              className="h-5 px-1.5 text-[10px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            >
              <UserPlus className="w-3 h-3 mr-1" />
              {showCameos ? "Hide" : "Show"}
            </NodeButton>
          </div>
          {showCameos && (
            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800" style={{ maxWidth: "100%" }}>
              {cameos.slice(0, 10).map((cameo) => (
                <button
                  key={cameo.username}
                  type="button"
                  onClick={() => handleCameoSelect(cameo.username)}
                  disabled={!selectedCameos.includes(cameo.username) && selectedCameos.length >= 3}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 p-1 rounded-md border transition-all duration-200 ${
                    selectedCameos.includes(cameo.username)
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-sm"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-orange-400 dark:hover:border-orange-600"
                  } disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-neutral-900`}
                  title={cameo.display_name}
                >
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800">
                    <img
                      src={cameo.profile_picture_url}
                      alt={cameo.username}
                      className="w-full h-full object-cover"
                    />
                    {cameo.verified && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-500 ring-1 ring-white dark:ring-neutral-900 rounded-full flex items-center justify-center text-[8px] text-white">
                        ✓
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-medium text-neutral-600 dark:text-neutral-400 max-w-[40px] truncate">
                    {cameo.display_name?.split(" ")[0] || cameo.username}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <NodeLabel>Prompt</NodeLabel>
          <NodeTextarea
            ref={promptRef}
            className="w-full resize-none focus:border-orange-500 focus:ring-orange-500/20"
            rows={4}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe the video scene..."
          />
        </div>

        {connectedImagesCount > 0 && (
          <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-md border border-orange-100 dark:border-orange-900/30 flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            Image-to-video mode active
          </div>
        )}

        <div className="pt-1">
          <NodeButton
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700 text-white"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate Video"}
          </NodeButton>
        </div>
      </div>

    </BaseNode>
  );
};

export default memo(VideoGenNode);
