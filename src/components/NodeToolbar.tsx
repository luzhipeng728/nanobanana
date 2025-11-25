"use client";

import { Wand2, Brain, Music, MessageSquare, Smile, Video } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeType = 'imageGen' | 'agent' | 'musicGen' | 'videoGen' | 'chat' | 'stickerGen';

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

const items = [
  {
    type: 'imageGen' as NodeType,
    title: 'Generator',
    description: 'AI 图像生成',
    icon: Wand2,
    accentColor: '#3b82f6',
  },
  {
    type: 'agent' as NodeType,
    title: 'Agent',
    description: 'AI 智能体',
    icon: Brain,
    accentColor: '#a855f7',
  },
  {
    type: 'stickerGen' as NodeType,
    title: 'Sticker',
    description: '动态表情包',
    icon: Smile,
    accentColor: '#ec4899',
  },
  {
    type: 'musicGen' as NodeType,
    title: 'Music',
    description: 'AI 音乐生成',
    icon: Music,
    accentColor: '#22c55e',
  },
  {
    type: 'videoGen' as NodeType,
    title: 'Video',
    description: 'Sora 视频生成',
    icon: Video,
    accentColor: '#f97316',
  },
  {
    type: 'chat' as NodeType,
    title: 'Chat',
    description: '流式对话',
    icon: MessageSquare,
    accentColor: '#64748b',
  },
];

export default function NodeToolbar({ onDragStart }: NodeToolbarProps) {
  return (
    <div className="absolute left-4 top-20 z-10 w-60">
      {/* 主容器 - 极致液态玻璃 */}
      <div 
        className={cn(
          "relative overflow-hidden rounded-[32px]",
          // 关键：极低不透明度 + 高模糊 = 通透感
          "bg-white/10 dark:bg-black/20", 
          "backdrop-blur-[40px] backdrop-saturate-[180%]",
          // 边框模拟玻璃边缘
          "border border-white/20 dark:border-white/5",
          // 复杂阴影模拟厚度和折射
          "shadow-[0_8px_32px_0_rgba(0,0,0,0.1),_inset_0_0_0_1px_rgba(255,255,255,0.1),_inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3),_inset_0_0_0_1px_rgba(255,255,255,0.05)]"
        )}
      >
        {/* 顶部强高光 - 模拟光源反射 */}
        <div 
          className="absolute top-0 left-6 right-6 h-[1px] opacity-50"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,1), transparent)',
          }}
        />
        
        {/* 液态流动光斑 - 增加灵动感 */}
        <div 
          className="absolute -top-20 -left-20 w-60 h-60 pointer-events-none opacity-20 dark:opacity-10"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 60%)',
            filter: 'blur(30px)',
          }}
        />
        
        {/* 彩色环境光折射 */}
        <div 
          className="absolute bottom-0 right-0 w-40 h-40 pointer-events-none opacity-10 dark:opacity-20 mix-blend-overlay"
          style={{
            background: 'conic-gradient(from 0deg, #ff0080, #7928ca, #ff0080)',
            filter: 'blur(40px)',
          }}
        />

        {/* 内容区域 */}
        <div className="relative p-4 z-10">
          {/* 标题栏 */}
          <div className="mb-4 pl-1">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center w-3 h-3">
                <div className="absolute inset-0 bg-blue-400/50 rounded-full animate-ping" />
                <div className="w-2 h-2 bg-gradient-to-tr from-blue-400 to-purple-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
              </div>
              <h3 className="text-xs font-bold tracking-widest uppercase text-neutral-800/70 dark:text-white/80">
                Tools
              </h3>
            </div>
          </div>
          
          {/* 工具列表 - 悬浮式卡片 */}
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(event) => onDragStart(event, item.type)}
                className="group relative cursor-grab active:cursor-grabbing"
              >
                {/* 卡片本身也是玻璃，但更通透 */}
                <div 
                  className={cn(
                    "relative flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-300",
                    "hover:translate-x-1 hover:scale-[1.02] active:scale-[0.98]",
                    // 内部卡片样式
                    "bg-white/30 dark:bg-white/5",
                    "hover:bg-white/50 dark:hover:bg-white/10",
                    "border border-white/20 dark:border-white/5",
                    "shadow-sm hover:shadow-md"
                  )}
                >
                  {/* 悬浮时的高光扫描效果 */}
                  <div 
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  </div>

                  {/* 图标容器 - 磨砂玻璃 */}
                  <div 
                    className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `linear-gradient(135deg, ${item.accentColor}20, ${item.accentColor}10)`,
                      boxShadow: `inset 0 0 0 1px ${item.accentColor}30`,
                    }}
                  >
                    <item.icon 
                      className="w-4 h-4 relative z-10 transition-colors duration-300"
                      style={{ color: item.accentColor }}
                    />
                    {/* 图标背景光晕 */}
                    <div 
                      className="absolute inset-0 opacity-50"
                      style={{
                        background: `radial-gradient(circle at center, ${item.accentColor}40, transparent 80%)`,
                      }}
                    />
                  </div>
                  
                  {/* 文字信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate text-neutral-800/90 dark:text-neutral-100/90">
                      {item.title}
                    </p>
                    <p className="text-[10px] truncate text-neutral-600/70 dark:text-neutral-400/70 group-hover:text-neutral-800/80 dark:group-hover:text-neutral-300/80 transition-colors">
                      {item.description}
                    </p>
                  </div>

                  {/* 拖拽指示器 */}
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 pr-1 transform translate-x-2 group-hover:translate-x-0">
                    <div className="flex flex-col gap-[3px]">
                      <div className="w-1 h-1 rounded-full" style={{ background: item.accentColor }} />
                      <div className="w-1 h-1 rounded-full" style={{ background: item.accentColor, opacity: 0.5 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 底部投影 - 增强悬浮立体感 */}
      <div 
        className="absolute -bottom-4 left-4 right-4 h-4 rounded-[100%] -z-10 opacity-40 dark:opacity-60"
        style={{
          background: 'radial-gradient(closest-side, rgba(0,0,0,0.2), transparent)',
          filter: 'blur(8px)',
        }}
      />
    </div>
  );
}
