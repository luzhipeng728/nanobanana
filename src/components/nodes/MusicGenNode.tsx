"use client";

import { memo, useState, useCallback } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Wand2, Music as MusicIcon, Sparkles, ArrowRight } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeButton, NodeLabel, NodeInput } from "@/components/ui/NodeUI";

type MusicGenNodeData = {
  prompt: string;
  lyrics?: string;
  numberOfSongs: number;
  isGenerating: boolean;
};

const MusicGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { addMusicNode } = useCanvas();
  const { getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [lyrics, setLyrics] = useState(data.lyrics || "");
  const [numberOfSongs, setNumberOfSongs] = useState(data.numberOfSongs || 2);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isExtendingLyrics, setIsExtendingLyrics] = useState(false);

  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value;
  };

  const handleLyricsChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLyrics(evt.target.value);
    data.lyrics = evt.target.value;
  };

  const onGenerateLyrics = async () => {
    if (!prompt) {
      alert("Please enter a prompt first");
      return;
    }
    setIsGeneratingLyrics(true);
    try {
      const response = await fetch("/api/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate lyrics");
      }

      const result = await response.json();
      setLyrics(result.lyrics || "");
      data.lyrics = result.lyrics || "";
    } catch (error) {
      console.error("Failed to generate lyrics", error);
      alert("Failed to generate lyrics");
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const onExtendLyrics = async () => {
    if (!lyrics) {
      alert("Please enter or generate lyrics first");
      return;
    }
    setIsExtendingLyrics(true);
    try {
      const response = await fetch("/api/lyrics/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics }),
      });

      if (!response.ok) {
        throw new Error("Failed to extend lyrics");
      }

      const result = await response.json();
      setLyrics(result.lyrics || "");
      data.lyrics = result.lyrics || "";
    } catch (error) {
      console.error("Failed to extend lyrics", error);
      alert("Failed to extend lyrics");
    } finally {
      setIsExtendingLyrics(false);
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      // 创建音乐生成任务
      const response = await fetch("/api/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          lyrics: lyrics || undefined,
          numberOfSongs,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create music task");
      }

      const { taskId } = await response.json();
      console.log(`Created music task: ${taskId}`);

      // 立即创建一个 Music 节点，传入 taskId
      const currentNode = getNode(id);
      if (currentNode) {
        addMusicNode(
          taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y }
        );
      }
    } catch (error) {
      console.error("Failed to create music task", error);
      alert("Failed to create music task");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseNode
      title="Music Generator"
      icon={MusicIcon}
      color="green"
      selected={selected}
      className="w-[320px]"
    >

      <div className="space-y-4">
        <div className="space-y-1">
          <NodeLabel>Prompt</NodeLabel>
          <NodeTextarea
            rows={3}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe the music style..."
            className="focus:border-green-500 focus:ring-green-500/20"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between mb-1.5">
            <NodeLabel className="mb-0">Lyrics (Optional)</NodeLabel>
            <div className="flex gap-1">
              <NodeButton
                variant="ghost"
                onClick={onGenerateLyrics}
                disabled={isGeneratingLyrics || !prompt}
                className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                title="Generate lyrics from prompt"
              >
                {isGeneratingLyrics ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Generate
              </NodeButton>
              {lyrics && (
                <NodeButton
                  variant="ghost"
                  onClick={onExtendLyrics}
                  disabled={isExtendingLyrics}
                  className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                  title="Extend lyrics"
                >
                  {isExtendingLyrics ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                  Extend
                </NodeButton>
              )}
            </div>
          </div>
          <NodeTextarea
            rows={3}
            value={lyrics}
            onChange={handleLyricsChange}
            placeholder="Enter lyrics or click Generate..."
            className="focus:border-green-500 focus:ring-green-500/20"
          />
        </div>

        <div className="space-y-1">
          <NodeLabel>Number of Songs</NodeLabel>
          <NodeInput
            type="number"
            min="1"
            max="5"
            className="focus:border-green-500 focus:ring-green-500/20"
            value={numberOfSongs}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 2;
              setNumberOfSongs(val);
              data.numberOfSongs = val;
            }}
          />
        </div>

        <div className="pt-2">
          <NodeButton
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate Music"}
          </NodeButton>
        </div>
      </div>

    </BaseNode>
  );
};

export default memo(MusicGenNode);
