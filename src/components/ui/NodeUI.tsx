"use client";

import React, { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export function NodeLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400 mb-2 tracking-wider px-1", className)}>
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
          "w-full px-4 py-2.5 text-sm bg-white dark:bg-neutral-950 border-2 border-transparent shadow-sm rounded-full",
          "focus:outline-none focus:border-neutral-300 dark:focus:border-neutral-700 focus:ring-4 focus:ring-neutral-100 dark:focus:ring-neutral-800",
          "placeholder:text-neutral-400 dark:placeholder:text-neutral-600 transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
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
          "w-full px-4 py-3 text-sm bg-white dark:bg-neutral-950 border-2 border-transparent shadow-sm rounded-[1.5rem]",
          "focus:outline-none focus:border-neutral-300 dark:focus:border-neutral-700 focus:ring-4 focus:ring-neutral-100 dark:focus:ring-neutral-800",
          "placeholder:text-neutral-400 dark:placeholder:text-neutral-600 resize-none min-h-[100px] transition-all duration-200",
          "scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800 scrollbar-track-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
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
      <div className="relative group">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none px-4 py-2.5 text-sm bg-white dark:bg-neutral-950 border-2 border-transparent shadow-sm rounded-full",
            "focus:outline-none focus:border-neutral-300 dark:focus:border-neutral-700 focus:ring-4 focus:ring-neutral-100 dark:focus:ring-neutral-800",
            "cursor-pointer transition-all duration-200 pr-10 hover:bg-neutral-50 dark:hover:bg-neutral-900",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
      primary: "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 border-2 border-transparent shadow-md hover:shadow-lg hover:-translate-y-0.5",
      secondary: "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-2 border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 shadow-sm hover:shadow-md hover:-translate-y-0.5",
      danger: "bg-red-500 text-white hover:bg-red-600 border-2 border-transparent shadow-md hover:shadow-lg hover:-translate-y-0.5",
      ghost: "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-2 border-transparent",
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:hover:transform-none",
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

export function NodeScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("overflow-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800 scrollbar-track-transparent rounded-[1.5rem]", className)}>
            {children}
        </div>
    )
}

