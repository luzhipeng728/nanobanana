import React, { ReactNode } from "react";
import { LucideIcon, Loader2, Zap } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeButton, NodeDivider } from "@/components/ui/NodeUI";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface GeneratorNodeLayoutProps {
  title: string;
  icon: LucideIcon;
  color: "purple" | "blue" | "green" | "orange" | "pink" | "red" | "neutral" | "cyan";
  selected?: boolean;
  className?: string;
  headerActions?: ReactNode;
  children: ReactNode;

  // Generate Button Props
  isGenerating: boolean;
  onGenerate: () => void;
  generateButtonText?: string;
  generateButtonDisabled?: boolean;
  generateButtonClassName?: string;
  loadingText?: ReactNode;

  // Optional secondary actions next to generate button
  footerActions?: ReactNode;

  // Touch/Event handlers
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

// 颜色到发光色的映射
const colorToGlow = {
  purple: "purple",
  blue: "cyan",
  green: "green",
  orange: "orange",
  pink: "pink",
  red: "orange",
  neutral: "cyan",
  cyan: "cyan",
} as const;

export const GeneratorNodeLayout = React.memo(({
  title,
  icon,
  color,
  selected,
  className = "w-[320px]",
  headerActions,
  children,
  isGenerating,
  onGenerate,
  generateButtonText = "Generate",
  generateButtonDisabled = false,
  generateButtonClassName,
  loadingText,
  footerActions,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: GeneratorNodeLayoutProps) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';
  const glowColor = colorToGlow[color];

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <BaseNode
        title={title}
        icon={icon}
        color={color}
        selected={selected}
        className={className}
        headerActions={headerActions}
      >
        <div className="space-y-4">
          {/* Main Input Content */}
          {children}

          {/* Divider */}
          <NodeDivider />

          {/* Footer: Generate Button and optional actions */}
          <div className="flex gap-2">
            {footerActions}

            <NodeButton
              variant="primary"
              onClick={onGenerate}
              disabled={isGenerating || generateButtonDisabled}
              glowColor={glowColor}
              className={cn(
                "flex-1 group",
                generateButtonClassName
              )}
            >
              {isGenerating ? (
                loadingText || (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="animate-pulse">处理中</span>
                  </span>
                )
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 group-hover:animate-pulse" />
                  {generateButtonText}
                </span>
              )}
            </NodeButton>
          </div>

          {/* 生成中的进度指示 */}
          {isGenerating && (
            <div className={cn(
              "relative h-1 rounded-full overflow-hidden",
              isLight ? "bg-neutral-200" : "bg-white/5"
            )}>
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  "animate-[shimmer_2s_linear_infinite]",
                  isLight && "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600",
                  isNeoCyber && "bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500",
                  !isLight && !isNeoCyber && "bg-gradient-to-r from-white/60 via-white to-white/60"
                )}
                style={{
                  width: '100%',
                  backgroundSize: '200% 100%',
                }}
              />
            </div>
          )}
        </div>
      </BaseNode>
    </div>
  );
});

GeneratorNodeLayout.displayName = "GeneratorNodeLayout";
