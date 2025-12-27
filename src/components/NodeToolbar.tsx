"use client";

import { useState, useEffect, useRef } from "react";
import { Wand2, Brain, Music, MessageSquare, Ghost, Video, Image, ChevronLeft, ChevronRight, Sparkles, Bot, Mic2, Presentation, Film, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";

type NodeType = 'imageGen' | 'agent' | 'musicGen' | 'videoGen' | 'chat' | 'chatAgent' | 'sprite' | 'superAgent' | 'ttsGen' | 'pptGen' | 'researchVideoGen' | 'storyVideoGen';

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
  onImageUploadClick?: () => void;
  onNodeTypeSelect?: (nodeType: NodeType) => void; // 触摸设备点击选择节点类型
}

// Video 工具单独定义（彩蛋解锁后显示）
const videoItem = {
  type: 'videoGen' as NodeType,
  title: 'Video',
  description: 'AI 视频生成',
  icon: Video,
  accentColor: '#f97316',
};

// 基础工具列表（不包含 Video）
const baseItems = [
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
    type: 'superAgent' as NodeType,
    title: 'Prompt Expert',
    description: '超级提示词专家',
    icon: Sparkles,
    accentColor: '#7c3aed',
  },
  {
    type: 'sprite' as NodeType,
    title: 'Sprite',
    description: 'Sprite 动画',
    icon: Ghost,
    accentColor: '#8b5cf6',
  },
  {
    type: 'musicGen' as NodeType,
    title: 'Music',
    description: 'AI 音乐生成',
    icon: Music,
    accentColor: '#22c55e',
  },
  {
    type: 'ttsGen' as NodeType,
    title: 'TTS',
    description: '文字转语音',
    icon: Mic2,
    accentColor: '#06b6d4',
  },
  {
    type: 'chatAgent' as NodeType,
    title: 'Agent Chat',
    description: '智能体对话',
    icon: Bot,
    accentColor: '#6366f1',
  },
  {
    type: 'chat' as NodeType,
    title: 'AI Diagram',
    description: 'AI 图表生成',
    icon: MessageSquare,
    accentColor: '#ec4899',
  },
  {
    type: 'pptGen' as NodeType,
    title: 'PPT',
    description: 'AI 智能生成演示文稿',
    icon: Presentation,
    accentColor: '#f59e0b',
  },
  {
    type: 'researchVideoGen' as NodeType,
    title: '研究视频',
    description: 'AI 深度研究视频生成',
    icon: Film,
    accentColor: '#8b5cf6',
  },
  // 故事视频节点暂时隐藏
  // {
  //   type: 'storyVideoGen' as NodeType,
  //   title: '故事视频',
  //   description: 'AI 儿童读物/古诗解说视频',
  //   icon: BookOpen,
  //   accentColor: '#ec4899',
  // },
];

const VIDEO_UNLOCK_KEY = 'nanobanana-video-unlocked';

// 图片上传项（特殊处理，点击而非拖拽）
const uploadItem = {
  title: 'Upload',
  description: '上传本地图片',
  icon: Image,
  accentColor: '#06b6d4',
};

// 导出工具列表供右键菜单使用
export const toolItems = baseItems;
export const videoToolItem = videoItem;
export const uploadToolItem = uploadItem;
export type { NodeType };

export default function NodeToolbar({ onDragStart, onImageUploadClick, onNodeTypeSelect }: NodeToolbarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true); // 默认收起
  const isTouchDevice = useIsTouchDevice();

  // 彩蛋：Video 工具解锁状态
  const [videoUnlocked, setVideoUnlocked] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化时从 localStorage 读取解锁状态
  useEffect(() => {
    const unlocked = localStorage.getItem(VIDEO_UNLOCK_KEY) === 'true';
    setVideoUnlocked(unlocked);
  }, []);

  // 彩蛋点击处理 - 在标题 "Tools" 上点击 4 次解锁
  const handleTitleClick = () => {
    if (videoUnlocked) return; // 已解锁则忽略

    // 重置计时器
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= 4) {
      // 解锁！
      setVideoUnlocked(true);
      localStorage.setItem(VIDEO_UNLOCK_KEY, 'true');
      setClickCount(0);
      // 可选：显示解锁提示
      console.log('🎉 Video tool unlocked!');
    } else {
      // 2 秒内没有继续点击则重置计数
      clickTimerRef.current = setTimeout(() => {
        setClickCount(0);
      }, 2000);
    }
  };

  // 根据解锁状态决定显示的工具列表
  // baseItems: imageGen(0), agent(1), superAgent(2), sprite(3), musicGen(4), chat(5)
  // 解锁后在 sprite 后面插入 video
  const items = videoUnlocked
    ? [...baseItems.slice(0, 4), videoItem, ...baseItems.slice(4)]
    : baseItems;

  // 折叠状态：显示小按钮
  if (isCollapsed) {
    return (
      <div className="absolute left-4 top-20 z-10">
        <button
          onClick={() => setIsCollapsed(false)}
          className={cn(
            "relative overflow-hidden rounded-2xl p-3",
            "bg-white/[0.02] dark:bg-white/[0.02]",
            "backdrop-blur-[2px]",
            "border border-neutral-200/50 dark:border-white/10",
            "hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-300",
            "group"
          )}
          title="展开工具栏"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-3 h-3">
              <div className="absolute inset-0 bg-blue-400/50 rounded-full animate-ping" />
              <div className="w-2 h-2 bg-gradient-to-tr from-blue-400 to-purple-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-4 top-20 z-10 w-60">
      {/* 主容器 - 超透明玻璃 */}
      <div
        className={cn(
          "relative overflow-hidden rounded-[32px]",
          // 几乎完全透明
          "bg-white/[0.02] dark:bg-white/[0.02]",
          "backdrop-blur-[2px]",
          // 淡边框
          "border border-neutral-200/50 dark:border-white/10",
          // 极淡阴影
          "shadow-[0_0_0_1px_rgba(0,0,0,0.02)]"
        )}
      >

        {/* 内容区域 */}
        <div className="relative p-4 z-10">
          {/* 标题栏 - 添加折叠按钮 + 彩蛋点击 */}
          <div className="mb-4 pl-1">
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2.5 cursor-pointer select-none"
                onClick={handleTitleClick}
                title={videoUnlocked ? "Video 已解锁" : undefined}
              >
                <div className="relative flex items-center justify-center w-3 h-3">
                  <div className="absolute inset-0 bg-blue-400/50 rounded-full animate-ping" />
                  <div className="w-2 h-2 bg-gradient-to-tr from-blue-400 to-purple-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                </div>
                <h3 className="text-xs font-bold tracking-widest uppercase text-neutral-800/70 dark:text-white/80">
                  Tools
                </h3>
                {/* 彩蛋点击进度提示（未解锁时） */}
                {!videoUnlocked && clickCount > 0 && (
                  <span className="text-[10px] text-orange-500 font-bold animate-pulse">
                    {clickCount}/4
                  </span>
                )}
              </div>
              {/* 折叠按钮 */}
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-white/10 transition-colors group"
                title="收起工具栏"
              >
                <ChevronLeft className="w-4 h-4 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors" />
              </button>
            </div>
          </div>

          {/* 工具列表 - 悬浮式卡片 */}
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.type}
                draggable={!isTouchDevice}
                onDragStart={(event) => !isTouchDevice && onDragStart(event, item.type)}
                onClick={() => isTouchDevice && onNodeTypeSelect?.(item.type)}
                className={cn(
                  "group relative",
                  isTouchDevice ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                )}
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

                  {/* 拖拽/点击指示器 */}
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 pr-1 transform translate-x-2 group-hover:translate-x-0">
                    {isTouchDevice ? (
                      <div className="text-[10px] font-medium" style={{ color: item.accentColor }}>
                        Tap
                      </div>
                    ) : (
                      <div className="flex flex-col gap-[3px]">
                        <div className="w-1 h-1 rounded-full" style={{ background: item.accentColor }} />
                        <div className="w-1 h-1 rounded-full" style={{ background: item.accentColor, opacity: 0.5 }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* 分隔线 */}
            <div className="my-3 mx-2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* 图片上传项 - 点击而非拖拽 */}
            <div
              onClick={onImageUploadClick}
              className="group relative cursor-pointer"
            >
              <div
                className={cn(
                  "relative flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-300",
                  "hover:translate-x-1 hover:scale-[1.02] active:scale-[0.98]",
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

                {/* 图标容器 */}
                <div
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{
                    background: `linear-gradient(135deg, ${uploadItem.accentColor}20, ${uploadItem.accentColor}10)`,
                    boxShadow: `inset 0 0 0 1px ${uploadItem.accentColor}30`,
                  }}
                >
                  <uploadItem.icon
                    className="w-4 h-4 relative z-10 transition-colors duration-300"
                    style={{ color: uploadItem.accentColor }}
                  />
                  <div
                    className="absolute inset-0 opacity-50"
                    style={{
                      background: `radial-gradient(circle at center, ${uploadItem.accentColor}40, transparent 80%)`,
                    }}
                  />
                </div>

                {/* 文字信息 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate text-neutral-800/90 dark:text-neutral-100/90">
                    {uploadItem.title}
                  </p>
                  <p className="text-[10px] truncate text-neutral-600/70 dark:text-neutral-400/70 group-hover:text-neutral-800/80 dark:group-hover:text-neutral-300/80 transition-colors">
                    {uploadItem.description}
                  </p>
                </div>

                {/* 点击指示器 */}
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 pr-1 transform translate-x-2 group-hover:translate-x-0">
                  <div className="text-[10px] font-medium" style={{ color: uploadItem.accentColor }}>
                    Click
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
