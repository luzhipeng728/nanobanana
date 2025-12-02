"use client";

import React, { useState, useCallback } from "react";
import { Copy, Check, X, FileText } from "lucide-react";

interface PromptPanelProps {
  prompt: string;
  label?: string;
  onClose: () => void;
}

export default function PromptPanel({ prompt, label, onClose }: PromptPanelProps) {
  const [copied, setCopied] = useState(false);

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
    <div className="absolute top-0 right-0 h-full w-[320px] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-l border-neutral-200 dark:border-neutral-800 shadow-2xl z-40 flex flex-col animate-slide-in-right">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            提示词
          </span>
          {label && (
            <span className="text-xs text-neutral-500 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-full">
              {label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 提示词内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
            {prompt}
          </p>
        </div>
      </div>

      {/* 复制按钮 */}
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              复制提示词
            </>
          )}
        </button>
      </div>
    </div>
  );
}
