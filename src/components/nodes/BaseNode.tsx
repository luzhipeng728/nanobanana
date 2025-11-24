"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils"; // Assuming utils exists, if not I'll create it or inline clsx
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

const colorMap = {
  purple: "border-purple-500/50 shadow-purple-500/10",
  blue: "border-blue-500/50 shadow-blue-500/10",
  green: "border-green-500/50 shadow-green-500/10",
  orange: "border-orange-500/50 shadow-orange-500/10",
  pink: "border-pink-500/50 shadow-pink-500/10",
  red: "border-red-500/50 shadow-red-500/10",
  neutral: "border-neutral-500/50 shadow-neutral-500/10",
};

const headerColorMap = {
  purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10",
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10",
  green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10",
  orange: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10",
  pink: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/10",
  red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10",
  neutral: "text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/10",
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
        "nowheel group flex flex-col min-w-[300px] bg-white dark:bg-neutral-950 rounded-xl border transition-all duration-200",
        selected ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-black" : "",
        colorMap[color],
        selected ? `ring-${color}-500` : "",
        "shadow-lg",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 rounded-t-xl border-b border-neutral-100 dark:border-neutral-800",
          headerColorMap[color]
        )}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          <span className="text-sm font-semibold tracking-tight">{title}</span>
        </div>
        {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 relative">
        {children}
      </div>
    </div>
  );
}
