"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface BaseNodeProps {
  title: string;
  icon?: LucideIcon;
  color?: "purple" | "blue" | "green" | "orange" | "pink" | "red" | "neutral" | "cyan";
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
  selected?: boolean;
  onTitleClick?: () => void;
  hideHeader?: boolean;
}

// Neo-Cyber 颜色系统 - 霓虹发光效果
const neonColorMap = {
  purple: {
    glow: "shadow-[0_0_30px_rgba(191,0,255,0.3)]",
    border: "border-purple-500/30",
    accent: "from-purple-500 to-fuchsia-500",
    header: "bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20",
    icon: "bg-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(191,0,255,0.5)]",
    text: "text-purple-400",
    light: "bg-purple-500",
  },
  blue: {
    glow: "shadow-[0_0_30px_rgba(0,102,255,0.3)]",
    border: "border-blue-500/30",
    accent: "from-blue-500 to-cyan-500",
    header: "bg-gradient-to-r from-blue-500/20 to-cyan-500/20",
    icon: "bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(0,102,255,0.5)]",
    text: "text-blue-400",
    light: "bg-blue-500",
  },
  cyan: {
    glow: "shadow-[0_0_30px_rgba(0,245,255,0.3)]",
    border: "border-cyan-500/30",
    accent: "from-cyan-500 to-teal-500",
    header: "bg-gradient-to-r from-cyan-500/20 to-teal-500/20",
    icon: "bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(0,245,255,0.5)]",
    text: "text-cyan-400",
    light: "bg-cyan-500",
  },
  green: {
    glow: "shadow-[0_0_30px_rgba(0,255,136,0.3)]",
    border: "border-emerald-500/30",
    accent: "from-emerald-500 to-green-500",
    header: "bg-gradient-to-r from-emerald-500/20 to-green-500/20",
    icon: "bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(0,255,136,0.5)]",
    text: "text-emerald-400",
    light: "bg-emerald-500",
  },
  orange: {
    glow: "shadow-[0_0_30px_rgba(255,107,0,0.3)]",
    border: "border-orange-500/30",
    accent: "from-orange-500 to-amber-500",
    header: "bg-gradient-to-r from-orange-500/20 to-amber-500/20",
    icon: "bg-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(255,107,0,0.5)]",
    text: "text-orange-400",
    light: "bg-orange-500",
  },
  pink: {
    glow: "shadow-[0_0_30px_rgba(255,0,170,0.3)]",
    border: "border-pink-500/30",
    accent: "from-pink-500 to-rose-500",
    header: "bg-gradient-to-r from-pink-500/20 to-rose-500/20",
    icon: "bg-pink-500/20 text-pink-400 shadow-[0_0_15px_rgba(255,0,170,0.5)]",
    text: "text-pink-400",
    light: "bg-pink-500",
  },
  red: {
    glow: "shadow-[0_0_30px_rgba(255,59,48,0.3)]",
    border: "border-red-500/30",
    accent: "from-red-500 to-rose-500",
    header: "bg-gradient-to-r from-red-500/20 to-rose-500/20",
    icon: "bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(255,59,48,0.5)]",
    text: "text-red-400",
    light: "bg-red-500",
  },
  neutral: {
    glow: "shadow-[0_0_30px_rgba(150,150,180,0.2)]",
    border: "border-neutral-500/30",
    accent: "from-neutral-400 to-neutral-500",
    header: "bg-gradient-to-r from-neutral-500/20 to-neutral-600/20",
    icon: "bg-neutral-500/20 text-neutral-400 shadow-[0_0_15px_rgba(150,150,180,0.3)]",
    text: "text-neutral-400",
    light: "bg-neutral-500",
  },
};

export function BaseNode({
  title,
  icon: Icon,
  color = "neutral",
  children,
  headerActions,
  className,
  contentClassName,
  selected,
  hideHeader = false,
  onTitleClick,
}: BaseNodeProps) {
  const colors = neonColorMap[color];

  return (
    <div
      className={cn(
        // 基础容器 - 深色玻璃质感
        "nowheel group relative flex flex-col min-w-[320px]",
        "bg-[#0d0d15]/95 backdrop-blur-xl",
        "border border-white/10",
        "rounded-2xl overflow-hidden",
        // GPU 加速
        "will-change-transform transform-gpu",
        "[contain:layout_style_paint]",
        // 过渡动画
        "transition-all duration-300 ease-out",
        // 悬浮效果
        "hover:border-white/20",
        colors.glow,
        selected && [
          "ring-2 ring-offset-0",
          `ring-${color === 'neutral' ? 'white' : color}-500/50`,
          colors.glow.replace('0.3', '0.5'),
        ],
        className
      )}
    >
      {/* 霓虹渐变边框 - 顶部装饰线 */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[2px]",
        "bg-gradient-to-r",
        colors.accent,
        "opacity-80"
      )} />

      {/* 角落装饰 */}
      <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-white/20 rounded-tl-sm" />
      <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-white/20 rounded-tr-sm" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-white/20 rounded-bl-sm" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-white/20 rounded-br-sm" />

      {/* 扫描线效果 */}
      <div className="absolute inset-0 pointer-events-none opacity-30 cyber-scanline" />

      {/* Header */}
      {!hideHeader && (
        <div
          className={cn(
            "relative flex items-center justify-between px-4 py-3",
            colors.header,
            "border-b border-white/10"
          )}
        >
          {/* 数据流动画线 */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[data-stream_3s_linear_infinite]"
                 style={{ transform: 'translateX(-100%)', animation: 'data-stream 3s linear infinite' }} />
          </div>

          <div className="flex items-center gap-3 relative z-10">
            {/* 状态指示灯 */}
            <div className={cn("cyber-status-light", colors.light)} />

            {Icon && (
              <div className={cn(
                "p-2 rounded-lg",
                colors.icon,
                "transition-all duration-300"
              )}>
                <Icon className="w-4 h-4" />
              </div>
            )}
            <span
              className={cn(
                "font-cyber text-xs font-bold tracking-wider uppercase",
                colors.text,
                onTitleClick && "cursor-pointer hover:opacity-80 transition-opacity"
              )}
              onClick={onTitleClick}
            >
              {title}
            </span>
          </div>

          {headerActions && (
            <div className="flex items-center gap-2 relative z-10">
              {headerActions}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn(
        "relative p-4 space-y-4 flex-1 min-h-0",
        "bg-gradient-to-b from-transparent to-black/20",
        contentClassName
      )}>
        {children}
      </div>

      {/* 底部装饰线 */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-[1px]",
        "bg-gradient-to-r from-transparent",
        colors.accent.replace('from-', 'via-'),
        "to-transparent",
        "opacity-50"
      )} />
    </div>
  );
}
