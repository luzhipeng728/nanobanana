"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface BaseNodeProps {
  title: string;
  icon?: LucideIcon;
  color?: "purple" | "blue" | "green" | "orange" | "pink" | "red" | "neutral";
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  selected?: boolean;
}

// Pastel/Cute color palette
const colorMap = {
  purple: "border-purple-200 dark:border-purple-800 shadow-[0_8px_20px_-6px_rgba(168,85,247,0.15)] bg-purple-50/50 dark:bg-purple-950/20",
  blue: "border-blue-200 dark:border-blue-800 shadow-[0_8px_20px_-6px_rgba(59,130,246,0.15)] bg-blue-50/50 dark:bg-blue-950/20",
  green: "border-green-200 dark:border-green-800 shadow-[0_8px_20px_-6px_rgba(34,197,94,0.15)] bg-green-50/50 dark:bg-green-950/20",
  orange: "border-orange-200 dark:border-orange-800 shadow-[0_8px_20px_-6px_rgba(249,115,22,0.15)] bg-orange-50/50 dark:bg-orange-950/20",
  pink: "border-pink-200 dark:border-pink-800 shadow-[0_8px_20px_-6px_rgba(236,72,153,0.15)] bg-pink-50/50 dark:bg-pink-950/20",
  red: "border-red-200 dark:border-red-800 shadow-[0_8px_20px_-6px_rgba(239,68,68,0.15)] bg-red-50/50 dark:bg-red-950/20",
  neutral: "border-neutral-200 dark:border-neutral-800 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.05)] bg-white dark:bg-neutral-900",
};

const headerColorMap = {
  purple: "text-purple-600 dark:text-purple-300 bg-purple-100/50 dark:bg-purple-900/30",
  blue: "text-blue-600 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30",
  green: "text-green-600 dark:text-green-300 bg-green-100/50 dark:bg-green-900/30",
  orange: "text-orange-600 dark:text-orange-300 bg-orange-100/50 dark:bg-orange-900/30",
  pink: "text-pink-600 dark:text-pink-300 bg-pink-100/50 dark:bg-pink-900/30",
  red: "text-red-600 dark:text-red-300 bg-red-100/50 dark:bg-red-900/30",
  neutral: "text-neutral-600 dark:text-neutral-300 bg-neutral-100/50 dark:bg-neutral-800/50",
};

const iconColorMap = {
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",
  green: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300",
  red: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300",
};

export function BaseNode({
  title,
  icon: Icon,
  color = "neutral",
  children,
  headerActions,
  className,
  selected,
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        "nowheel group flex flex-col min-w-[320px] backdrop-blur-md rounded-[2rem] border-2 transition-all duration-300 ease-out",
        selected ? "ring-4 ring-offset-0 ring-opacity-30 scale-[1.02]" : "hover:scale-[1.01] hover:shadow-lg",
        colorMap[color],
        selected ? `ring-${color}-400/40` : "",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-5 py-4 rounded-t-[2rem] transition-colors duration-300",
          headerColorMap[color]
        )}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={cn("p-2 rounded-xl", iconColorMap[color])}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <span className="text-sm font-extrabold tracking-wide text-opacity-90">{title}</span>
        </div>
        {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
      </div>

      {/* Content */}
      <div className="p-5 space-y-4 relative">
        {children}
      </div>
    </div>
  );
}
