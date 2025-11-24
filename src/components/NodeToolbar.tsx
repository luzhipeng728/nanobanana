"use client";

import { Image, Wand2, Brain, Music, Video, MessageSquare } from "lucide-react";

type NodeType = 'imageGen' | 'agent' | 'musicGen' | 'videoGen' | 'chat';

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

export default function NodeToolbar({ onDragStart }: NodeToolbarProps) {
  return (
    <div className="absolute left-4 top-20 z-10 w-48 bg-white dark:bg-neutral-900 rounded border border-neutral-300 dark:border-neutral-700 shadow-lg">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          Nodes
        </h3>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Drag to canvas
        </p>
      </div>
      <div className="p-2 space-y-1">
        {/* Image Generator Node */}
        <div
          draggable
          onDragStart={(event) => onDragStart(event, 'imageGen')}
          className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <Wand2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
              Generator
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              AI Image Generator
            </p>
          </div>
        </div>

        {/* Agent Node */}
        <div
          draggable
          onDragStart={(event) => onDragStart(event, 'agent')}
          className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
            <Brain className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
              Agent
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              AI Agent
            </p>
          </div>
        </div>

        {/* Music Generator Node */}
        <div
          draggable
          onDragStart={(event) => onDragStart(event, 'musicGen')}
          className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <Music className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
              Music Generator
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              AI Music Generator
            </p>
          </div>
        </div>

        {/* Chat Node */}
        <div
          draggable
          onDragStart={(event) => onDragStart(event, 'chat')}
          className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-pink-500 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-all"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
              AI Chat
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              Streaming Chat
            </p>
          </div>
        </div>

        {/* Video Generator Node - Temporarily hidden due to API token issues */}
        {/* <div
          draggable
          onDragStart={(event) => onDragStart(event, 'videoGen')}
          className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
            <Video className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
              Video Generator
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              AI Video Generator
            </p>
          </div>
        </div> */}
      </div>
    </div>
  );
}
