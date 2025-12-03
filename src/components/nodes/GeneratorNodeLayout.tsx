import React, { ReactNode } from "react";
import { LucideIcon, Loader2 } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeButton } from "@/components/ui/NodeUI";
import { cn } from "@/lib/utils";

interface GeneratorNodeLayoutProps {
  title: string;
  icon: LucideIcon;
  color: "purple" | "blue" | "green" | "orange" | "pink" | "red" | "neutral";
  selected?: boolean;
  className?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  
  // Generate Button Props
  isGenerating: boolean;
  onGenerate: () => void;
  generateButtonText?: string;
  generateButtonDisabled?: boolean;
  generateButtonClassName?: string; // Added custom className prop
  loadingText?: ReactNode;
  
  // Optional secondary actions next to generate button
  footerActions?: ReactNode;
  
  // Touch/Event handlers
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

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

          {/* Footer: Generate Button and optional actions */}
          <div className="pt-1 flex gap-2">
            {footerActions}
            
            <NodeButton
              variant="primary"
              onClick={onGenerate}
              disabled={isGenerating || generateButtonDisabled}
              className={cn(
                "flex-1 text-white", // Default to flex-1 instead of w-full
                // Auto-map colors based on prop
                color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700' :
                color === 'green' ? 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700' :
                color === 'orange' ? 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700' :
                color === 'purple' ? 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700' :
                'bg-neutral-800 hover:bg-neutral-900',
                generateButtonClassName // Allow override
              )}
            >
              {isGenerating ? (
                loadingText || <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                generateButtonText
              )}
            </NodeButton>
          </div>
        </div>
      </BaseNode>
    </div>
  );
});

GeneratorNodeLayout.displayName = "GeneratorNodeLayout";
