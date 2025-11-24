"use client";

import { Wand2, Brain, Music, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeType = 'imageGen' | 'agent' | 'musicGen' | 'videoGen' | 'chat';

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

const items = [
  {
    type: 'imageGen' as NodeType,
    title: 'Generator',
    description: 'AI Image Generator',
    icon: Wand2,
    color: 'blue',
    gradient: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-white dark:bg-blue-900/30',
  },
  {
    type: 'agent' as NodeType,
    title: 'Agent',
    description: 'AI Agent',
    icon: Brain,
    color: 'purple',
    gradient: 'from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10',
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-white dark:bg-purple-900/30',
  },
  {
    type: 'musicGen' as NodeType,
    title: 'Music',
    description: 'AI Music Generator',
    icon: Music,
    color: 'green',
    gradient: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10',
    iconColor: 'text-green-600 dark:text-green-400',
    iconBg: 'bg-white dark:bg-green-900/30',
  },
  {
    type: 'chat' as NodeType,
    title: 'Chat',
    description: 'Streaming Chat',
    icon: MessageSquare,
    color: 'pink',
    gradient: 'from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-900/10',
    iconColor: 'text-pink-600 dark:text-pink-400',
    iconBg: 'bg-white dark:bg-pink-900/30',
  },
];

export default function NodeToolbar({ onDragStart }: NodeToolbarProps) {
  return (
    <div className="absolute left-4 top-20 z-10 w-56 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-3 space-y-1">
      <div className="px-2 pb-2 border-b border-neutral-100 dark:border-neutral-800 mb-2">
        <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
          Tools
        </h3>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
          Drag to canvas
        </p>
      </div>
      
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(event) => onDragStart(event, item.type)}
            className={cn(
              "group flex items-center gap-3 p-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-200",
              "hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-neutral-100 dark:hover:border-neutral-800",
              `bg-gradient-to-br ${item.gradient} opacity-90 hover:opacity-100`
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-transform group-hover:scale-110",
              item.iconBg,
              item.iconColor
            )}>
              <item.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200 truncate">
                {item.title}
              </p>
              <p className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 truncate opacity-80 group-hover:opacity-100">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
