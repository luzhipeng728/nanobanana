"use client";

import React, { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

// ========================================
// 多主题设计系统 - 表单控件
// ========================================

export function NodeLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';

  return (
    <label className={cn(
      "flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.15em] mb-2 px-1",
      isLight && "text-neutral-600",
      isNeoCyber && "font-cyber text-cyan-400/80",
      !isLight && !isNeoCyber && "text-white/60",
      className
    )}>
      {/* 装饰点 */}
      <span className={cn(
        "w-1 h-1 rounded-full",
        isLight && "bg-neutral-400",
        isNeoCyber && "bg-cyan-500 shadow-[0_0_6px_rgba(0,245,255,0.8)]",
        !isLight && !isNeoCyber && "bg-white/40"
      )} />
      {children}
    </label>
  );
}

export const NodeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function NodeInputInner({ className, ...props }, ref) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isNeoCyber = theme === 'neo-cyber';

    return (
      <div className="relative group">
        {/* Neo-Cyber 发光边框效果 */}
        {isNeoCyber && (
          <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        )}

        <input
          ref={ref}
          className={cn(
            "relative w-full px-4 py-2.5 text-sm",
            "rounded-xl transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            // Light theme
            isLight && [
              "bg-neutral-50 border border-neutral-200",
              "text-neutral-900 placeholder:text-neutral-400",
              "focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100",
            ],
            // Neo-Cyber theme
            isNeoCyber && [
              "font-cyber-body",
              "bg-[#0a0a12] border border-white/10",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-cyan-500/50",
              "focus:shadow-[0_0_20px_rgba(0,245,255,0.15),inset_0_0_20px_rgba(0,245,255,0.05)]",
            ],
            // Glass Dark theme
            !isLight && !isNeoCyber && [
              "bg-white/5 border border-white/10",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-white/20 focus:bg-white/10",
            ],
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
NodeInput.displayName = "NodeInput";

export const NodeTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function NodeTextareaInner({ className, ...props }, ref) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isNeoCyber = theme === 'neo-cyber';

    return (
      <div className="relative group">
        {/* Neo-Cyber 发光边框效果 */}
        {isNeoCyber && (
          <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        )}

        <textarea
          ref={ref}
          className={cn(
            "relative w-full px-4 py-3 text-sm",
            "rounded-xl resize-none min-h-[100px]",
            "transition-all duration-300",
            "scrollbar-thin scrollbar-track-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            // Light theme
            isLight && [
              "bg-neutral-50 border border-neutral-200",
              "text-neutral-900 placeholder:text-neutral-400",
              "focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100",
              "scrollbar-thumb-neutral-300",
            ],
            // Neo-Cyber theme
            isNeoCyber && [
              "font-cyber-body",
              "bg-[#0a0a12] border border-white/10",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-cyan-500/50",
              "focus:shadow-[0_0_20px_rgba(0,245,255,0.15),inset_0_0_20px_rgba(0,245,255,0.05)]",
              "scrollbar-thumb-white/10",
            ],
            // Glass Dark theme
            !isLight && !isNeoCyber && [
              "bg-white/5 border border-white/10",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-white/20 focus:bg-white/10",
              "scrollbar-thumb-white/10",
            ],
            className
          )}
          {...props}
        />

        {/* Neo-Cyber 角落装饰 */}
        {isNeoCyber && (
          <>
            <div className="absolute top-1 right-1 w-2 h-2 border-r border-t border-white/20 pointer-events-none" />
            <div className="absolute bottom-1 left-1 w-2 h-2 border-l border-b border-white/20 pointer-events-none" />
          </>
        )}
      </div>
    );
  }
);
NodeTextarea.displayName = "NodeTextarea";

export const NodeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NodeSelectInner({ className, ...props }, ref) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isNeoCyber = theme === 'neo-cyber';

    return (
      <div className="relative group">
        {/* Neo-Cyber 发光边框效果 */}
        {isNeoCyber && (
          <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        )}

        <select
          ref={ref}
          className={cn(
            "relative w-full appearance-none px-4 py-2.5 text-sm pr-10",
            "rounded-xl cursor-pointer",
            "transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            // Light theme
            isLight && [
              "bg-neutral-50 border border-neutral-200",
              "text-neutral-900",
              "focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100",
              "hover:bg-neutral-100",
            ],
            // Neo-Cyber theme
            isNeoCyber && [
              "font-cyber-body",
              "bg-[#0a0a12] border border-white/10",
              "text-white",
              "focus:outline-none focus:border-purple-500/50",
              "focus:shadow-[0_0_20px_rgba(191,0,255,0.15),inset_0_0_20px_rgba(191,0,255,0.05)]",
              "hover:bg-white/5 hover:border-white/20",
            ],
            // Glass Dark theme
            !isLight && !isNeoCyber && [
              "bg-white/5 border border-white/10",
              "text-white",
              "focus:outline-none focus:border-white/20 focus:bg-white/10",
              "hover:bg-white/10",
            ],
            className
          )}
          {...props}
        />

        {/* 下拉箭头 */}
        <div className={cn(
          "absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none",
          isLight ? "text-neutral-500" : isNeoCyber ? "text-purple-400" : "text-white/50"
        )}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }
);
NodeSelect.displayName = "NodeSelect";

interface NodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "cyber";
  isLoading?: boolean;
  glowColor?: "cyan" | "purple" | "pink" | "green" | "orange";
}

export const NodeButton = forwardRef<HTMLButtonElement, NodeButtonProps>(
  function NodeButtonInner({ className, variant = "primary", isLoading, glowColor = "cyan", children, ...props }, ref) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isNeoCyber = theme === 'neo-cyber';

    // Neo-Cyber 发光效果
    const neonGlowColors = {
      cyan: "shadow-[0_0_20px_rgba(0,245,255,0.4)] hover:shadow-[0_0_30px_rgba(0,245,255,0.6)]",
      purple: "shadow-[0_0_20px_rgba(191,0,255,0.4)] hover:shadow-[0_0_30px_rgba(191,0,255,0.6)]",
      pink: "shadow-[0_0_20px_rgba(255,0,170,0.4)] hover:shadow-[0_0_30px_rgba(255,0,170,0.6)]",
      green: "shadow-[0_0_20px_rgba(0,255,136,0.4)] hover:shadow-[0_0_30px_rgba(0,255,136,0.6)]",
      orange: "shadow-[0_0_20px_rgba(255,107,0,0.4)] hover:shadow-[0_0_30px_rgba(255,107,0,0.6)]",
    };

    // 根据主题获取变体样式
    const getVariants = () => {
      if (isLight) {
        return {
          primary: cn(
            "bg-gradient-to-r from-blue-500 to-blue-600 text-white",
            "shadow-md hover:shadow-lg",
            "hover:-translate-y-0.5"
          ),
          secondary: cn(
            "bg-neutral-100 text-neutral-700 border border-neutral-200",
            "hover:bg-neutral-200",
            "hover:-translate-y-0.5"
          ),
          danger: cn(
            "bg-gradient-to-r from-red-500 to-red-600 text-white",
            "shadow-md hover:shadow-lg",
            "hover:-translate-y-0.5"
          ),
          ghost: cn(
            "bg-transparent text-neutral-600 border border-transparent",
            "hover:bg-neutral-100 hover:text-neutral-900"
          ),
          cyber: cn(
            "bg-neutral-100 text-blue-600 border-2 border-blue-400",
            "hover:bg-blue-50 hover:border-blue-500",
            "hover:-translate-y-0.5"
          ),
        };
      } else if (isNeoCyber) {
        return {
          primary: cn(
            "bg-gradient-to-r from-cyan-500 to-blue-500 text-white",
            "border border-cyan-400/30",
            neonGlowColors[glowColor],
            "hover:-translate-y-0.5"
          ),
          secondary: cn(
            "bg-white/5 text-white border border-white/20",
            "hover:bg-white/10 hover:border-white/30",
            "hover:-translate-y-0.5"
          ),
          danger: cn(
            "bg-gradient-to-r from-red-500 to-rose-500 text-white",
            "border border-red-400/30",
            "shadow-[0_0_20px_rgba(255,59,48,0.4)]",
            "hover:shadow-[0_0_30px_rgba(255,59,48,0.6)]",
            "hover:-translate-y-0.5"
          ),
          ghost: cn(
            "bg-transparent text-white/70 border border-transparent",
            "hover:bg-white/5 hover:text-white"
          ),
          cyber: cn(
            "bg-[#0a0a12] text-cyan-400 border-2 border-cyan-500/50",
            "shadow-[0_0_15px_rgba(0,245,255,0.3),inset_0_0_15px_rgba(0,245,255,0.1)]",
            "hover:bg-cyan-500/10 hover:border-cyan-400",
            "hover:shadow-[0_0_25px_rgba(0,245,255,0.5),inset_0_0_20px_rgba(0,245,255,0.15)]",
            "hover:-translate-y-0.5"
          ),
        };
      } else {
        // Glass Dark
        return {
          primary: cn(
            "bg-white text-black",
            "hover:bg-white/90",
            "hover:-translate-y-0.5"
          ),
          secondary: cn(
            "bg-white/10 text-white border border-white/10",
            "hover:bg-white/15 hover:border-white/20",
            "hover:-translate-y-0.5"
          ),
          danger: cn(
            "bg-red-500 text-white",
            "hover:bg-red-400",
            "hover:-translate-y-0.5"
          ),
          ghost: cn(
            "bg-transparent text-white/70 border border-transparent",
            "hover:bg-white/5 hover:text-white"
          ),
          cyber: cn(
            "bg-white/5 text-white border border-white/20",
            "hover:bg-white/10 hover:border-white/30",
            "hover:-translate-y-0.5"
          ),
        };
      }
    };

    const variants = getVariants();

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "relative flex items-center justify-center gap-2 px-4 py-2.5",
          "text-sm font-bold tracking-wider uppercase",
          isNeoCyber && "font-cyber",
          "rounded-xl overflow-hidden",
          "transition-all duration-300 ease-out",
          "active:scale-95",
          "disabled:opacity-50 disabled:pointer-events-none disabled:transform-none",
          variants[variant],
          className
        )}
        {...props}
      >
        {/* Neo-Cyber 光效扫过动画 */}
        {isNeoCyber && (
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
        )}

        {/* 内容 */}
        <span className="relative z-10 flex items-center gap-2">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
        </span>
      </button>
    );
  }
);
NodeButton.displayName = "NodeButton";

export function NodeScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn(
      "overflow-auto rounded-xl",
      "scrollbar-thin scrollbar-track-transparent",
      isLight ? "scrollbar-thumb-neutral-300" : "scrollbar-thumb-white/10",
      className
    )}>
      {children}
    </div>
  );
}

/**
 * NodeTabSelect - 多主题 Tab 选择器
 */
interface TabOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface NodeTabSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  color?: "blue" | "purple" | "orange" | "green" | "cyan" | "pink";
}

export function NodeTabSelect<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  className,
  size = "md",
  color = "cyan",
}: NodeTabSelectProps<T>) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';

  // 根据主题获取颜色样式
  const getColorStyles = () => {
    if (isLight) {
      return {
        cyan: {
          active: "bg-cyan-500 text-white shadow-sm",
          inactive: "text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50",
        },
        blue: {
          active: "bg-blue-500 text-white shadow-sm",
          inactive: "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
        },
        purple: {
          active: "bg-purple-500 text-white shadow-sm",
          inactive: "text-purple-600 hover:text-purple-700 hover:bg-purple-50",
        },
        pink: {
          active: "bg-pink-500 text-white shadow-sm",
          inactive: "text-pink-600 hover:text-pink-700 hover:bg-pink-50",
        },
        orange: {
          active: "bg-orange-500 text-white shadow-sm",
          inactive: "text-orange-600 hover:text-orange-700 hover:bg-orange-50",
        },
        green: {
          active: "bg-emerald-500 text-white shadow-sm",
          inactive: "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50",
        },
      };
    } else if (isNeoCyber) {
      return {
        cyan: {
          active: "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-[0_0_15px_rgba(0,245,255,0.5)]",
          inactive: "text-cyan-400/60 hover:text-cyan-400",
        },
        blue: {
          active: "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-[0_0_15px_rgba(0,102,255,0.5)]",
          inactive: "text-blue-400/60 hover:text-blue-400",
        },
        purple: {
          active: "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-[0_0_15px_rgba(191,0,255,0.5)]",
          inactive: "text-purple-400/60 hover:text-purple-400",
        },
        pink: {
          active: "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-[0_0_15px_rgba(255,0,170,0.5)]",
          inactive: "text-pink-400/60 hover:text-pink-400",
        },
        orange: {
          active: "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_0_15px_rgba(255,107,0,0.5)]",
          inactive: "text-orange-400/60 hover:text-orange-400",
        },
        green: {
          active: "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-[0_0_15px_rgba(0,255,136,0.5)]",
          inactive: "text-emerald-400/60 hover:text-emerald-400",
        },
      };
    } else {
      // Glass Dark
      return {
        cyan: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
        blue: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
        purple: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
        pink: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
        orange: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
        green: {
          active: "bg-white text-black",
          inactive: "text-white/60 hover:text-white/80 hover:bg-white/5",
        },
      };
    }
  };

  const colorStyles = getColorStyles();

  const sizeStyles = {
    sm: "py-1.5 px-2 text-[9px]",
    md: "py-2 px-3 text-[10px]",
  };

  return (
    <div className={cn(
      "relative flex p-1 rounded-xl",
      isLight && "bg-neutral-100 border border-neutral-200",
      isNeoCyber && "bg-[#0a0a12] border border-white/10",
      !isLight && !isNeoCyber && "bg-white/5 border border-white/10",
      disabled && "opacity-50 pointer-events-none",
      className
    )}>
      {options.map((option) => {
        const isSelected = value === option.value;
        const isDisabled = disabled || option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => !isDisabled && onChange(option.value)}
            disabled={isDisabled}
            className={cn(
              "flex-1 font-bold uppercase tracking-wider rounded-lg",
              isNeoCyber && "font-cyber",
              "transition-all duration-300",
              sizeStyles[size],
              isSelected ? colorStyles[color].active : colorStyles[color].inactive,
              isSelected && "scale-[1.02]",
              !isSelected && !isLight && "hover:bg-white/5",
              isDisabled && "cursor-not-allowed opacity-50"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * NodeBadge - 多主题徽章
 */
interface NodeBadgeProps {
  children: React.ReactNode;
  variant?: "cyan" | "purple" | "pink" | "green" | "orange" | "neutral";
  className?: string;
}

export function NodeBadge({ children, variant = "cyan", className }: NodeBadgeProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';

  const getVariants = () => {
    if (isLight) {
      return {
        cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
        purple: "bg-purple-100 text-purple-700 border-purple-200",
        pink: "bg-pink-100 text-pink-700 border-pink-200",
        green: "bg-emerald-100 text-emerald-700 border-emerald-200",
        orange: "bg-orange-100 text-orange-700 border-orange-200",
        neutral: "bg-neutral-100 text-neutral-600 border-neutral-200",
      };
    } else if (isNeoCyber) {
      return {
        cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(0,245,255,0.3)]",
        purple: "bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_10px_rgba(191,0,255,0.3)]",
        pink: "bg-pink-500/20 text-pink-400 border-pink-500/30 shadow-[0_0_10px_rgba(255,0,170,0.3)]",
        green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(0,255,136,0.3)]",
        orange: "bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_10px_rgba(255,107,0,0.3)]",
        neutral: "bg-white/10 text-white/70 border-white/20",
      };
    } else {
      // Glass Dark
      return {
        cyan: "bg-white/10 text-cyan-400 border-white/10",
        purple: "bg-white/10 text-purple-400 border-white/10",
        pink: "bg-white/10 text-pink-400 border-white/10",
        green: "bg-white/10 text-emerald-400 border-white/10",
        orange: "bg-white/10 text-orange-400 border-white/10",
        neutral: "bg-white/10 text-white/60 border-white/10",
      };
    }
  };

  const variants = getVariants();

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg",
      "text-[10px] font-bold uppercase tracking-wider",
      isNeoCyber && "font-cyber",
      "border",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}

/**
 * NodeDivider - 多主题分隔线
 */
export function NodeDivider({ className }: { className?: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';

  return (
    <div className={cn("relative h-px my-3", className)}>
      <div className={cn(
        "absolute inset-0 bg-gradient-to-r from-transparent to-transparent",
        isLight ? "via-neutral-300" : "via-white/20"
      )} />
      {/* Neo-Cyber 中心装饰点 */}
      {isNeoCyber && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(0,245,255,0.8)]" />
      )}
    </div>
  );
}
