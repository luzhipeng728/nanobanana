"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Video as VideoIcon, Link2, UserPlus } from "lucide-react";
import { NodeTextarea } from "@/components/NodeInputs";
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

const VideoGenNode = ({ data, id, isConnectable }: NodeProps<any>) => {
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
    <div className="nowheel bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded w-[300px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-orange-500 !border-0"
      />

      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
          <VideoIcon className="w-3.5 h-3.5" />
          Video Generator
        </span>
        {connectedImagesCount > 0 && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            {connectedImagesCount}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Orientation</label>
          <select
            className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-orange-500"
            value={orientation}
            onChange={(e) => {
              const val = e.target.value as "portrait" | "landscape";
              setOrientation(val);
              data.orientation = val;
            }}
          >
            <option value="portrait">Portrait (9:16)</option>
            <option value="landscape">Landscape (16:9)</option>
          </select>
        </div>

        {/* Cameo Selector */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Add Cameo</label>
            <button
              type="button"
              onClick={() => setShowCameos(!showCameos)}
              className="flex items-center gap-0.5 text-[10px] text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
            >
              <UserPlus className="w-3 h-3" />
              {showCameos ? "Hide" : "Show"}
            </button>
          </div>
          {showCameos && (
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ maxWidth: "100%" }}>
              {cameos.slice(0, 10).map((cameo) => (
                <button
                  key={cameo.username}
                  type="button"
                  onClick={() => handleCameoSelect(cameo.username)}
                  disabled={!selectedCameos.includes(cameo.username) && selectedCameos.length >= 3}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 p-1 rounded border transition-all ${
                    selectedCameos.includes(cameo.username)
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                      : "border-neutral-300 dark:border-neutral-700 hover:border-orange-400"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={cameo.display_name}
                >
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white dark:border-neutral-900">
                    <img
                      src={cameo.profile_picture_url}
                      alt={cameo.username}
                      className="w-full h-full object-cover"
                    />
                    {cameo.verified && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white">
                        ✓
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-neutral-600 dark:text-neutral-400 max-w-[40px] truncate">
                    {cameo.display_name?.split(" ")[0] || cameo.username}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-neutral-600 dark:text-neutral-400">Prompt</label>
          <NodeTextarea
            ref={promptRef}
            className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 resize-none focus:outline-none focus:border-orange-500"
            rows={4}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe the video scene..."
          />
        </div>

        {connectedImagesCount > 0 && (
          <div className="text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1.5 rounded">
            Image-to-video mode: Using connected image
          </div>
        )}

        <div className="pt-1">
          <button
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full flex items-center justify-center gap-1 text-xs bg-orange-600 dark:bg-orange-600 text-white hover:bg-orange-700 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate Video"}
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-orange-500 !border-0"
      />
    </div>
  );
};

export default memo(VideoGenNode);
