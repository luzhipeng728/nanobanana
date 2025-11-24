"use client";

import React, { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export function NodeLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wider", className)}>
      {children}
    </label>
  );
}

export const NodeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg",
          "focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-neutral-300 dark:focus:border-neutral-700",
          "placeholder:text-neutral-400 transition-all",
          className
        )}
        {...props}
      />
    );
  }
);
NodeInput.displayName = "NodeInput";

export const NodeTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg",
          "focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-neutral-300 dark:focus:border-neutral-700",
          "placeholder:text-neutral-400 resize-none min-h-[80px] transition-all",
          "scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800",
          className
        )}
        {...props}
      />
    );
  }
);
NodeTextarea.displayName = "NodeTextarea";

export const NodeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg",
            "focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-neutral-300 dark:focus:border-neutral-700",
            "cursor-pointer transition-all pr-8",
            className
          )}
          {...props}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }
);
NodeSelect.displayName = "NodeSelect";

interface NodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
}

export const NodeButton = forwardRef<HTMLButtonElement, NodeButtonProps>(
  ({ className, variant = "primary", isLoading, children, ...props }, ref) => {
    const variants = {
      primary: "bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200",
      secondary: "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700",
      danger: "bg-red-500 text-white hover:bg-red-600",
      ghost: "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
NodeButton.displayName = "NodeButton";
