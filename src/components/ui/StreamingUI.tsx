"use client";

import React, { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Brain,
  Sparkles,
  Search,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Target,
  Wand2,
  Eye,
  MessageSquare,
} from "lucide-react";

// ============================================================================
// 1. ThinkingIndicator - AI 思考状态指示器
// ============================================================================

interface ThinkingIndicatorProps {
  variant?: "dots" | "pulse" | "wave" | "orbit";
  size?: "sm" | "md" | "lg";
  color?: "purple" | "blue" | "cyan" | "emerald";
  className?: string;
}

export const ThinkingIndicator = memo(function ThinkingIndicator({
  variant = "dots",
  size = "md",
  color = "purple",
  className,
}: ThinkingIndicatorProps) {
  const sizeClasses = {
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
  };

  const dotSizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  const colorClasses = {
    purple: "bg-purple-500",
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    emerald: "bg-emerald-500",
  };

  if (variant === "dots") {
    return (
      <div className={cn("flex items-center", sizeClasses[size], className)}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "rounded-full animate-bounce",
              dotSizes[size],
              colorClasses[color]
            )}
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "600ms" }}
          />
        ))}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        <span
          className={cn(
            "absolute rounded-full animate-ping opacity-75",
            size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5",
            colorClasses[color]
          )}
        />
        <span
          className={cn(
            "relative rounded-full",
            size === "sm" ? "w-2 h-2" : size === "md" ? "w-3 h-3" : "w-4 h-4",
            colorClasses[color]
          )}
        />
      </div>
    );
  }

  if (variant === "wave") {
    return (
      <div className={cn("flex items-end", sizeClasses[size], className)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-full",
              colorClasses[color],
              "animate-pulse"
            )}
            style={{
              height: `${8 + Math.sin((i * Math.PI) / 2.5) * 8}px`,
              animationDelay: `${i * 100}ms`,
              animationDuration: "800ms",
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === "orbit") {
    return (
      <div
        className={cn(
          "relative",
          size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-8 h-8",
          className
        )}
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-t-transparent animate-spin",
            color === "purple"
              ? "border-purple-500"
              : color === "blue"
              ? "border-blue-500"
              : color === "cyan"
              ? "border-cyan-500"
              : "border-emerald-500"
          )}
          style={{ animationDuration: "800ms" }}
        />
      </div>
    );
  }

  return null;
});

// ============================================================================
// 2. StreamingThought - 流式思考展示组件
// ============================================================================

interface StreamingThoughtProps {
  content: string;
  iteration?: number;
  isStreaming?: boolean;
  toolName?: string;
  toolInput?: Record<string, any>;
  className?: string;
}

const TOOL_INFO: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  skill_matcher: { icon: Target, label: "匹配技能", color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
  load_skill: { icon: Zap, label: "加载技能", color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800" },
  generate_prompt: { icon: Wand2, label: "生成提示词", color: "text-purple-500 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
  web_search: { icon: Search, label: "搜索资料", color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
  research_topic: { icon: Brain, label: "深度研究", color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800" },
  analyze_image: { icon: Eye, label: "分析图片", color: "text-pink-500 bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800" },
  optimize_prompt: { icon: Sparkles, label: "优化提示词", color: "text-violet-500 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800" },
  evaluate_prompt: { icon: CheckCircle2, label: "质量评估", color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" },
  finalize_output: { icon: CheckCircle2, label: "输出结果", color: "text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" },
};

export const StreamingThought = memo(function StreamingThought({
  content,
  iteration,
  isStreaming = false,
  toolName,
  toolInput,
  className,
}: StreamingThoughtProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && isStreaming) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  const toolInfo = toolName ? TOOL_INFO[toolName] : null;
  const ToolIcon = toolInfo?.icon || MessageSquare;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30",
        "dark:from-slate-900/80 dark:via-purple-900/20 dark:to-blue-900/20",
        "shadow-sm",
        "border",
        isStreaming
          ? "border-purple-300 dark:border-purple-600"
          : "border-purple-100/50 dark:border-purple-800/30",
        className
      )}
    >
      {/* 顶部渐变光效 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent z-10" />

      {/* 动态背景光斑 */}
      {isStreaming && (
        <>
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-400/10 rounded-full blur-3xl animate-pulse z-0" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl animate-pulse z-0" style={{ animationDelay: "500ms" }} />
        </>
      )}

      {/* Header */}
      <div className="relative flex items-center gap-2 px-3 py-2 border-b border-purple-100/30 dark:border-purple-800/20">
        <div className="relative">
          <Brain className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          {isStreaming && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          )}
        </div>
        <span className="text-[11px] font-bold bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 bg-clip-text text-transparent">
          {isStreaming ? "正在思考" : "思考完成"}
        </span>
        {typeof iteration === "number" && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 font-medium">
            迭代 {iteration}
          </span>
        )}
        {isStreaming && (
          <ThinkingIndicator variant="dots" size="sm" color="purple" />
        )}
      </div>

      {/* Tool Badge */}
      {toolName && toolInfo && (
        <div className="px-3 pt-2">
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border",
            toolInfo.color
          )}>
            <ToolIcon className="w-3 h-3" />
            {toolInfo.label}
            {toolInput && Object.keys(toolInput).length > 0 && (
              <span className="opacity-60 ml-1 truncate max-w-[120px]">
                {JSON.stringify(toolInput).substring(0, 30)}...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div
        ref={containerRef}
        className="relative p-3 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-800"
      >
        <div className="text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 ml-0.5 bg-purple-500 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// 3. AnimatedProgress - 带动画的进度条
// ============================================================================

interface AnimatedProgressProps {
  progress: number;
  status?: string;
  variant?: "default" | "gradient" | "glow";
  color?: "purple" | "blue" | "cyan" | "emerald";
  showPercentage?: boolean;
  className?: string;
}

export const AnimatedProgress = memo(function AnimatedProgress({
  progress,
  status,
  variant = "gradient",
  color = "purple",
  showPercentage = true,
  className,
}: AnimatedProgressProps) {
  const colorClasses = {
    purple: {
      bar: "from-purple-500 via-violet-500 to-purple-600",
      glow: "shadow-purple-500/50",
      text: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-900/30",
    },
    blue: {
      bar: "from-blue-500 via-cyan-500 to-blue-600",
      glow: "shadow-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    cyan: {
      bar: "from-cyan-500 via-teal-500 to-cyan-600",
      glow: "shadow-cyan-500/50",
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-100 dark:bg-cyan-900/30",
    },
    emerald: {
      bar: "from-emerald-500 via-green-500 to-emerald-600",
      glow: "shadow-emerald-500/50",
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
    },
  };

  const colors = colorClasses[color];

  return (
    <div className={cn("space-y-2", className)}>
      {(status || showPercentage) && (
        <div className="flex items-center justify-between text-[10px]">
          {status && (
            <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 truncate">
              <Loader2 className={cn("w-3 h-3 animate-spin", colors.text)} />
              {status}
            </span>
          )}
          {showPercentage && (
            <span className={cn("font-bold tabular-nums", colors.text)}>
              {Math.round(progress)}%
            </span>
          )}
        </div>
      )}

      <div className="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
        {/* 背景动画 */}
        <div
          className={cn(
            "absolute inset-0 opacity-30",
            colors.bg
          )}
        />

        {/* 进度条 */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
            "bg-gradient-to-r",
            colors.bar,
            variant === "glow" && cn("shadow-lg", colors.glow)
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        >
          {/* 流动光效 */}
          {variant === "gradient" && progress < 100 && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
              style={{ backgroundSize: "200% 100%" }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// 4. StepTimeline - 步骤时间线组件
// ============================================================================

interface TimelineStep {
  id: string | number;
  title: string;
  description?: string;
  status: "pending" | "active" | "completed" | "error";
  icon?: React.ElementType;
}

interface StepTimelineProps {
  steps: TimelineStep[];
  variant?: "vertical" | "horizontal";
  color?: "purple" | "blue" | "cyan" | "emerald";
  compact?: boolean;
  className?: string;
}

export const StepTimeline = memo(function StepTimeline({
  steps,
  variant = "vertical",
  color = "purple",
  compact = false,
  className,
}: StepTimelineProps) {
  const colorClasses = {
    purple: {
      active: "bg-purple-500 border-purple-500 text-white",
      completed: "bg-purple-500 border-purple-500 text-white",
      line: "bg-purple-500",
      text: "text-purple-600 dark:text-purple-400",
    },
    blue: {
      active: "bg-blue-500 border-blue-500 text-white",
      completed: "bg-blue-500 border-blue-500 text-white",
      line: "bg-blue-500",
      text: "text-blue-600 dark:text-blue-400",
    },
    cyan: {
      active: "bg-cyan-500 border-cyan-500 text-white",
      completed: "bg-cyan-500 border-cyan-500 text-white",
      line: "bg-cyan-500",
      text: "text-cyan-600 dark:text-cyan-400",
    },
    emerald: {
      active: "bg-emerald-500 border-emerald-500 text-white",
      completed: "bg-emerald-500 border-emerald-500 text-white",
      line: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
    },
  };

  const colors = colorClasses[color];

  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center", className)}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 transition-all duration-300",
                    compact ? "w-6 h-6" : "w-8 h-8",
                    step.status === "completed" && colors.completed,
                    step.status === "active" && cn(colors.active, "animate-pulse"),
                    step.status === "pending" && "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600",
                    step.status === "error" && "bg-red-500 border-red-500 text-white"
                  )}
                >
                  {step.status === "completed" ? (
                    <CheckCircle2 className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
                  ) : step.status === "error" ? (
                    <AlertCircle className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
                  ) : Icon ? (
                    <Icon className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
                  ) : (
                    <span className={cn("font-bold", compact ? "text-[9px]" : "text-[10px]")}>
                      {index + 1}
                    </span>
                  )}
                </div>
                {!compact && (
                  <span className={cn(
                    "mt-1 text-[9px] font-medium text-center max-w-[60px] truncate",
                    step.status === "active" ? colors.text : "text-neutral-500"
                  )}>
                    {step.title}
                  </span>
                )}
              </div>
              {!isLast && (
                <div className={cn(
                  "flex-1 h-0.5 mx-1 rounded-full transition-all duration-500",
                  step.status === "completed" ? colors.line : "bg-neutral-200 dark:bg-neutral-700"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Vertical variant
  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Icon & Line */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full border-2 transition-all duration-300 flex-shrink-0",
                  compact ? "w-5 h-5" : "w-6 h-6",
                  step.status === "completed" && colors.completed,
                  step.status === "active" && cn(colors.active, "animate-pulse"),
                  step.status === "pending" && "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-400",
                  step.status === "error" && "bg-red-500 border-red-500 text-white"
                )}
              >
                {step.status === "completed" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : step.status === "error" ? (
                  <AlertCircle className="w-3 h-3" />
                ) : step.status === "active" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : Icon ? (
                  <Icon className="w-3 h-3" />
                ) : (
                  <span className="text-[9px] font-bold">{index + 1}</span>
                )}
              </div>
              {!isLast && (
                <div className={cn(
                  "w-0.5 flex-1 min-h-[16px] transition-all duration-500",
                  step.status === "completed" ? colors.line : "bg-neutral-200 dark:bg-neutral-700"
                )} />
              )}
            </div>

            {/* Content */}
            <div className={cn("pb-3 flex-1 min-w-0", isLast && "pb-0")}>
              <span className={cn(
                "text-[11px] font-medium block truncate",
                step.status === "active" ? colors.text :
                step.status === "completed" ? "text-neutral-700 dark:text-neutral-300" :
                "text-neutral-500 dark:text-neutral-400"
              )}>
                {step.title}
              </span>
              {step.description && (
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block truncate mt-0.5">
                  {step.description}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ============================================================================
// 5. PromptCard - 提示词卡片组件
// ============================================================================

interface PromptCardProps {
  scene: string;
  prompt: string;
  chineseTexts?: string[];
  status: "pending" | "generating" | "completed" | "error";
  error?: string;
  onGenerate?: () => void;
  className?: string;
}

export const PromptCard = memo(function PromptCard({
  scene,
  prompt,
  chineseTexts = [],
  status,
  error,
  onGenerate,
  className,
}: PromptCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-300",
        "bg-white dark:bg-neutral-900/50",
        "border",
        status === "generating"
          ? "border-purple-300 dark:border-purple-700 shadow-md shadow-purple-500/10"
          : status === "completed"
          ? "border-emerald-200 dark:border-emerald-800"
          : status === "error"
          ? "border-red-200 dark:border-red-800"
          : "border-neutral-200 dark:border-neutral-800",
        "hover:border-purple-200 dark:hover:border-purple-800/50 hover:shadow-sm",
        className
      )}
    >
      {/* 生成中的金属光线边框 */}
      {status === "generating" && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div className="metallic-border-glow-purple rounded-xl" />
          <div className="absolute inset-[2px] bg-white dark:bg-neutral-900 rounded-[10px]" />
        </div>
      )}

      <div className="relative p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate flex-1">
            {scene}
          </span>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {status === "pending" && onGenerate && (
              <button
                onClick={onGenerate}
                className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-500 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
              </button>
            )}
            {status === "pending" && (
              <span className="text-[10px] text-neutral-400 px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                等待中
              </span>
            )}
            {status === "generating" && (
              <span className="text-[10px] text-purple-500 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                生成中
              </span>
            )}
            {status === "completed" && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            {status === "error" && (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
        </div>

        {/* Prompt preview */}
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
          {prompt}
        </p>

        {/* Chinese texts */}
        {chineseTexts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chineseTexts.map((text, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[9px] rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border border-purple-100 dark:border-purple-800"
              >
                "{text}"
              </span>
            ))}
          </div>
        )}

        {/* Error message */}
        {status === "error" && error && (
          <p className="mt-2 text-[10px] text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// 6. SkillBadge - 技能匹配徽章
// ============================================================================

interface SkillBadgeProps {
  name: string;
  confidence?: number;
  className?: string;
}

export const SkillBadge = memo(function SkillBadge({
  name,
  confidence,
  className,
}: SkillBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl",
        "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20",
        "border border-emerald-200 dark:border-emerald-800",
        className
      )}
    >
      <div className="relative">
        <Target className="w-4 h-4 text-emerald-500" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block truncate">
          匹配技能: {name}
        </span>
      </div>
      {typeof confidence === "number" && (
        <span className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 tabular-nums">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
});

// ============================================================================
// CSS Keyframes (Add to global styles)
// ============================================================================

// Add these to your global.css:
// @keyframes shimmer {
//   0% { background-position: -200% 0; }
//   100% { background-position: 200% 0; }
// }
// .animate-shimmer {
//   animation: shimmer 2s linear infinite;
// }
// @keyframes spin-slow {
//   from { transform: rotate(0deg); }
//   to { transform: rotate(360deg); }
// }
// .animate-spin-slow {
//   animation: spin-slow 3s linear infinite;
// }
