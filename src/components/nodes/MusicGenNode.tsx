"use client";

import { memo, useState, useCallback } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Music as MusicIcon, Sparkles, ArrowRight } from "lucide-react";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { NodeTextarea, NodeButton, NodeLabel, NodeInput } from "@/components/ui/NodeUI";
import { useTaskGeneration } from "@/hooks/useTaskGeneration";

const MusicGenNode = ({ data, id, selected }: NodeProps<any>) => {
  const { addMusicNode } = useCanvas();
  const { getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(data.prompt || "");
  const [lyrics, setLyrics] = useState(data.lyrics || "");
  const [numberOfSongs, setNumberOfSongs] = useState(data.numberOfSongs || 2);

  // Main Generation Hook
  const { isGenerating, generate } = useTaskGeneration<{ taskId: string }>({
    onSuccess: (result) => {
      console.log(`Created music task: ${result.taskId}`);
      const currentNode = getNode(id);
      if (currentNode) {
        addMusicNode(
          result.taskId,
          prompt,
          { x: currentNode.position.x + 350, y: currentNode.position.y }
        );
      }
    }
  });

  // Helper hooks for sub-tasks (Lyrics)
  const { isGenerating: isGeneratingLyrics, generate: generateLyrics } = useTaskGeneration<{ lyrics: string }>({
    onSuccess: (res) => {
      setLyrics(res.lyrics || "");
      data.lyrics = res.lyrics || "";
    }
  });

  const { isGenerating: isExtendingLyrics, generate: extendLyrics } = useTaskGeneration<{ lyrics: string }>({
    onSuccess: (res) => {
      setLyrics(res.lyrics || "");
      data.lyrics = res.lyrics || "";
    }
  });

  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value;
  };

  const handleLyricsChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLyrics(evt.target.value);
    data.lyrics = evt.target.value;
  };

  const onGenerateLyrics = () => {
    if (!prompt) {
      alert("Please enter a prompt first");
      return;
    }
    generateLyrics({
      apiPath: "/api/lyrics/generate",
      body: { prompt }
    });
  };

  const onExtendLyrics = () => {
    if (!lyrics) {
      alert("Please enter or generate lyrics first");
      return;
    }
    extendLyrics({
      apiPath: "/api/lyrics/extend",
      body: { lyrics }
    });
  };

  const onGenerate = () => {
    if (!prompt) return;
    generate({
      apiPath: "/api/generate-music",
      body: {
        prompt,
        lyrics: lyrics || undefined,
        numberOfSongs,
      }
    });
  };

  return (
    <GeneratorNodeLayout
      title="Music Generator"
      icon={MusicIcon}
      color="green"
      selected={selected}
      isGenerating={isGenerating}
      onGenerate={onGenerate}
      generateButtonText="Generate Music"
      generateButtonDisabled={!prompt}
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
      </div>
    </GeneratorNodeLayout>
  );
};

export default memo(MusicGenNode);
