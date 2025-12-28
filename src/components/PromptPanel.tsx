"use client";

import React, { useState, useCallback } from "react";
import { Copy, Check, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface PromptPanelProps {
  prompt: string;
  label?: string;
  onClose: () => void;
}

export default function PromptPanel({ prompt, label, onClose }: PromptPanelProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  // Theme helpers
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';
  const isGlassDark = theme === 'glass-dark';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, [prompt]);

  if (!prompt || !prompt.trim()) return null;

  return (
    <div className={cn(
      "absolute top-0 right-0 h-full w-[320px] backdrop-blur-xl border-l z-40 flex flex-col animate-slide-in-right",
      isLight && "bg-white/95 border-neutral-200 shadow-2xl",
      isNeoCyber && "bg-[#0a0a12]/95 border-cyan-500/30 shadow-[0_0_40px_rgba(0,245,255,0.15)]",
      isGlassDark && "bg-[#1a1a1a]/95 border-white/10 shadow-2xl"
    )}>
      {/* Neo-Cyber 装饰 */}
      {isNeoCyber && (
        <>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500" />
          <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-cyan-500/50" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-cyan-500/50" />
        </>
      )}

      {/* 头部 */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b",
        isLight && "border-neutral-200",
        isNeoCyber && "border-cyan-500/20",
        isGlassDark && "border-white/10"
      )}>
        <div className="flex items-center gap-2">
          <FileText className={cn(
            "w-4 h-4",
            isLight ? "text-blue-500" : isNeoCyber ? "text-cyan-400" : "text-white/70"
          )} />
          <span className={cn(
            "text-sm font-medium",
            isLight ? "text-neutral-800" : isNeoCyber ? "text-cyan-400 font-cyber" : "text-white/90"
          )}>
            {isNeoCyber ? "PROMPT" : "提示词"}
          </span>
          {label && (
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              isLight && "text-neutral-500 bg-neutral-100",
              isNeoCyber && "text-purple-400 bg-purple-500/20 border border-purple-500/30",
              isGlassDark && "text-white/60 bg-white/10"
            )}>
              {label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isLight && "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600",
            isNeoCyber && "hover:bg-red-500/20 text-white/50 hover:text-red-400",
            isGlassDark && "hover:bg-white/10 text-white/50 hover:text-white/80"
          )}
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 提示词内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className={cn(
          "rounded-xl p-4 border",
          isLight && "bg-neutral-50 border-neutral-200",
          isNeoCyber && "bg-[#050508] border-cyan-500/20 shadow-[inset_0_0_20px_rgba(0,245,255,0.05)]",
          isGlassDark && "bg-white/5 border-white/10"
        )}>
          <p className={cn(
            "text-sm whitespace-pre-wrap break-words leading-relaxed",
            isLight ? "text-neutral-700" : "text-white/80"
          )}>
            {prompt}
          </p>
        </div>
      </div>

      {/* 复制按钮 */}
      <div className={cn(
        "p-4 border-t",
        isLight && "border-neutral-200",
        isNeoCyber && "border-cyan-500/20",
        isGlassDark && "border-white/10"
      )}>
        <button
          onClick={handleCopy}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
            isLight && "bg-blue-500 hover:bg-blue-600 text-white",
            isNeoCyber && "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-cyber tracking-wider shadow-[0_0_20px_rgba(0,245,255,0.4)] hover:shadow-[0_0_30px_rgba(0,245,255,0.6)]",
            isGlassDark && "bg-white hover:bg-white/90 text-black"
          )}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              {isNeoCyber ? "COPIED" : "已复制"}
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              {isNeoCyber ? "COPY PROMPT" : "复制提示词"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
