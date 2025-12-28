"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

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

// Light 主题颜色系统 - 干净明亮
const lightColorMap = {
  purple: {
    glow: "shadow-lg shadow-purple-500/10",
    border: "border-purple-200",
    accent: "from-purple-500 to-fuchsia-500",
    header: "bg-gradient-to-r from-purple-50 to-fuchsia-50",
    icon: "bg-purple-100 text-purple-600",
    text: "text-purple-700",
    light: "bg-purple-500",
  },
  blue: {
    glow: "shadow-lg shadow-blue-500/10",
    border: "border-blue-200",
    accent: "from-blue-500 to-cyan-500",
    header: "bg-gradient-to-r from-blue-50 to-cyan-50",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-700",
    light: "bg-blue-500",
  },
  cyan: {
    glow: "shadow-lg shadow-cyan-500/10",
    border: "border-cyan-200",
    accent: "from-cyan-500 to-teal-500",
    header: "bg-gradient-to-r from-cyan-50 to-teal-50",
    icon: "bg-cyan-100 text-cyan-600",
    text: "text-cyan-700",
    light: "bg-cyan-500",
  },
  green: {
    glow: "shadow-lg shadow-emerald-500/10",
    border: "border-emerald-200",
    accent: "from-emerald-500 to-green-500",
    header: "bg-gradient-to-r from-emerald-50 to-green-50",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-700",
    light: "bg-emerald-500",
  },
  orange: {
    glow: "shadow-lg shadow-orange-500/10",
    border: "border-orange-200",
    accent: "from-orange-500 to-amber-500",
    header: "bg-gradient-to-r from-orange-50 to-amber-50",
    icon: "bg-orange-100 text-orange-600",
    text: "text-orange-700",
    light: "bg-orange-500",
  },
  pink: {
    glow: "shadow-lg shadow-pink-500/10",
    border: "border-pink-200",
    accent: "from-pink-500 to-rose-500",
    header: "bg-gradient-to-r from-pink-50 to-rose-50",
    icon: "bg-pink-100 text-pink-600",
    text: "text-pink-700",
    light: "bg-pink-500",
  },
  red: {
    glow: "shadow-lg shadow-red-500/10",
    border: "border-red-200",
    accent: "from-red-500 to-rose-500",
    header: "bg-gradient-to-r from-red-50 to-rose-50",
    icon: "bg-red-100 text-red-600",
    text: "text-red-700",
    light: "bg-red-500",
  },
  neutral: {
    glow: "shadow-lg shadow-neutral-500/10",
    border: "border-neutral-200",
    accent: "from-neutral-400 to-neutral-500",
    header: "bg-gradient-to-r from-neutral-50 to-neutral-100",
    icon: "bg-neutral-100 text-neutral-600",
    text: "text-neutral-700",
    light: "bg-neutral-500",
  },
};

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

// Glass Dark 颜色系统 - 简约玻璃质感
const glassDarkColorMap = {
  purple: {
    glow: "shadow-xl shadow-purple-500/5",
    border: "border-white/10",
    accent: "from-purple-400 to-fuchsia-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-purple-400",
    text: "text-purple-400",
    light: "bg-purple-400",
  },
  blue: {
    glow: "shadow-xl shadow-blue-500/5",
    border: "border-white/10",
    accent: "from-blue-400 to-cyan-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-blue-400",
    text: "text-blue-400",
    light: "bg-blue-400",
  },
  cyan: {
    glow: "shadow-xl shadow-cyan-500/5",
    border: "border-white/10",
    accent: "from-cyan-400 to-teal-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-cyan-400",
    text: "text-cyan-400",
    light: "bg-cyan-400",
  },
  green: {
    glow: "shadow-xl shadow-emerald-500/5",
    border: "border-white/10",
    accent: "from-emerald-400 to-green-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-emerald-400",
    text: "text-emerald-400",
    light: "bg-emerald-400",
  },
  orange: {
    glow: "shadow-xl shadow-orange-500/5",
    border: "border-white/10",
    accent: "from-orange-400 to-amber-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-orange-400",
    text: "text-orange-400",
    light: "bg-orange-400",
  },
  pink: {
    glow: "shadow-xl shadow-pink-500/5",
    border: "border-white/10",
    accent: "from-pink-400 to-rose-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-pink-400",
    text: "text-pink-400",
    light: "bg-pink-400",
  },
  red: {
    glow: "shadow-xl shadow-red-500/5",
    border: "border-white/10",
    accent: "from-red-400 to-rose-400",
    header: "bg-white/5",
    icon: "bg-white/10 text-red-400",
    text: "text-red-400",
    light: "bg-red-400",
  },
  neutral: {
    glow: "shadow-xl shadow-white/5",
    border: "border-white/10",
    accent: "from-neutral-400 to-neutral-500",
    header: "bg-white/5",
    icon: "bg-white/10 text-white/70",
    text: "text-white/70",
    light: "bg-white/50",
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
  const { theme } = useTheme();

  // 根据主题选择颜色系统
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';
  const isGlassDark = theme === 'glass-dark';

  const colorMap = isLight ? lightColorMap : isNeoCyber ? neonColorMap : glassDarkColorMap;
  const colors = colorMap[color];

  return (
    <div
      className={cn(
        // 基础容器
        "nowheel group relative flex flex-col min-w-[320px]",
        "backdrop-blur-xl",
        "rounded-2xl overflow-hidden",
        // GPU 加速
        "will-change-transform transform-gpu",
        "[contain:layout_style_paint]",
        // 过渡动画
        "transition-all duration-300 ease-out",
        // 主题特定背景
        isLight && "bg-white/95 border border-neutral-200/80 hover:border-neutral-300",
        isNeoCyber && "bg-[#0d0d15]/95 border border-white/10 hover:border-white/20",
        isGlassDark && "bg-[#1a1a1a]/90 border border-white/10 hover:border-white/15",
        colors.glow,
        selected && [
          "ring-2 ring-offset-0",
          isLight ? `ring-${color === 'neutral' ? 'neutral' : color}-400/50` : `ring-${color === 'neutral' ? 'white' : color}-500/50`,
        ],
        className
      )}
    >
      {/* 顶部装饰线 - 所有主题都有，样式不同 */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[2px]",
        "bg-gradient-to-r",
        colors.accent,
        isLight ? "opacity-60" : "opacity-80"
      )} />

      {/* Neo-Cyber 专属角落装饰 */}
      {isNeoCyber && (
        <>
          <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-white/20 rounded-tl-sm" />
          <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-white/20 rounded-tr-sm" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-white/20 rounded-bl-sm" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-white/20 rounded-br-sm" />
        </>
      )}

      {/* Neo-Cyber 扫描线效果 */}
      {isNeoCyber && (
        <div className="absolute inset-0 pointer-events-none opacity-30 cyber-scanline" />
      )}

      {/* Header */}
      {!hideHeader && (
        <div
          className={cn(
            "relative flex items-center justify-between px-4 py-3",
            colors.header,
            isLight && "border-b border-neutral-200/80",
            isNeoCyber && "border-b border-white/10",
            isGlassDark && "border-b border-white/5"
          )}
        >
          {/* Neo-Cyber 数据流动画线 */}
          {isNeoCyber && (
            <div className="absolute bottom-0 left-0 right-0 h-[1px] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[data-stream_3s_linear_infinite]"
                   style={{ transform: 'translateX(-100%)', animation: 'data-stream 3s linear infinite' }} />
            </div>
          )}

          <div className="flex items-center gap-3 relative z-10">
            {/* 状态指示灯 - Neo-Cyber 专属 */}
            {isNeoCyber && <div className={cn("cyber-status-light", colors.light)} />}

            {/* Light/GlassDark 的简洁色点 */}
            {(isLight || isGlassDark) && (
              <div className={cn("w-2 h-2 rounded-full", colors.light)} />
            )}

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
                "text-xs font-bold tracking-wider uppercase",
                isNeoCyber && "font-cyber",
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
        isNeoCyber && "bg-gradient-to-b from-transparent to-black/20",
        contentClassName
      )}>
        {children}
      </div>

      {/* 底部装饰线 - Neo-Cyber 专属 */}
      {isNeoCyber && (
        <div className={cn(
          "absolute bottom-0 left-0 right-0 h-[1px]",
          "bg-gradient-to-r from-transparent",
          colors.accent.replace('from-', 'via-'),
          "to-transparent",
          "opacity-50"
        )} />
      )}
    </div>
  );
}
