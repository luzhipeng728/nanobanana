"use client";

import { memo, useState, useCallback } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { rewritePrompt, generateImageAction } from "@/app/actions/generate";
import { type GeminiImageModel, type ImageGenerationConfig } from "@/types/image-gen";
import { Loader2, Wand2, Image as ImageIcon, Sparkles, Maximize } from "lucide-react";

// Define the data structure for the node
type ImageGenNodeData = {
  prompt: string;
  imageUrl?: string;
  isGenerating: boolean;
};

const ImageGenNode = ({ data, id, isConnectable }: NodeProps<any>) => {
  const [prompt, setPrompt] = useState(data.prompt || "");
  const [imageUrl, setImageUrl] = useState(data.imageUrl || "");
  const [selectedModel, setSelectedModel] = useState<GeminiImageModel>(data.model || "nano-banana-pro");
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || "1:1");
  const [imageSize, setImageSize] = useState<string>(data.imageSize || "1K");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Handle local prompt change
  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    data.prompt = evt.target.value; // Update node data directly (or use updateNodeData hook if available in context)
  };

  const onRewrite = async () => {
    if (!prompt) return;
    setIsRewriting(true);
    try {
      const newPrompt = await rewritePrompt(prompt);
      setPrompt(newPrompt);
      data.prompt = newPrompt;
    } catch (error) {
      console.error("Failed to rewrite prompt", error);
    } finally {
      setIsRewriting(false);
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      const config: ImageGenerationConfig = {
        aspectRatio: aspectRatio as any,
      };

      // imageSize only supported by Pro model
      if (selectedModel === "nano-banana-pro") {
        config.imageSize = imageSize as any;
      }

      const result = await generateImageAction(prompt, selectedModel, config);
      if (result.success && result.imageUrl) {
        setImageUrl(result.imageUrl);
        data.imageUrl = result.imageUrl;
        data.model = selectedModel;
        data.aspectRatio = aspectRatio;
        if (selectedModel === "nano-banana-pro") {
          data.imageSize = imageSize;
        }
      } else {
        console.error("Generation failed:", result.error);
        alert("Generation failed: " + (result.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to generate image", error);
      alert("Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl w-[300px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
      
      <div className="bg-neutral-100 dark:bg-neutral-800 p-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
          <ImageIcon className="w-3 h-3" /> AI Image Gen
        </span>
        <div className="flex gap-1">
           {/* Minimal controls or status indicators could go here */}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {imageUrl ? (
          <div className="relative group">
             <img 
               src={imageUrl} 
               alt="Generated" 
               className="w-full aspect-square object-cover rounded-md border border-neutral-200 dark:border-neutral-700"
             />
             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-white text-xs hover:underline">View Full</a>
             </div>
          </div>
        ) : (
          <div className="w-full aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-md flex items-center justify-center text-neutral-400">
             <ImageIcon className="w-8 h-8 opacity-50" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-500 ml-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Model
            </label>
            <select
              className="w-full text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as GeminiImageModel)}
            >
              <option value="nano-banana">Fast</option>
              <option value="nano-banana-pro">Pro</option>
            </select>
          </div>

          {selectedModel === "nano-banana-pro" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-500 ml-1 flex items-center gap-1">
                <Maximize className="w-3 h-3" />
                Size
              </label>
              <select
                className="w-full text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-500 ml-1">Aspect Ratio</label>
          <select
            className="w-full text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="1:1">1:1 (Square)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
            <option value="4:3">4:3 (Standard)</option>
            <option value="3:4">3:4 (Portrait)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 ml-1">Prompt</label>
          <textarea
            className="w-full text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Describe your image..."
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRewrite}
            disabled={isRewriting || !prompt}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
          </button>
          <button
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="flex-[2] flex items-center justify-center gap-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 py-1.5 rounded transition-colors disabled:opacity-50 font-medium shadow-sm"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
    </div>
  );
};

export default memo(ImageGenNode);

