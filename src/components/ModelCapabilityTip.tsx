"use client";

import React, { useState, useEffect } from "react";
import { X, Info, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

/**
 * 模型能力提示框组件
 * 显示在页面右上角，可以关闭，并记住关闭状态
 * 采用毛玻璃效果设计
 */
export default function ModelCapabilityTip() {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // 从 localStorage 读取关闭状态
  useEffect(() => {
    const dismissed = localStorage.getItem("model-tip-dismissed");
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("model-tip-dismissed", "true");
  };

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {/* 主容器 - 毛玻璃效果 */}
      <div
        className={`
          bg-white/70 dark:bg-neutral-900/70
          backdrop-blur-xl backdrop-saturate-150
          rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.12)]
          dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          border border-white/40 dark:border-white/10
          overflow-hidden
          transition-all duration-300 ease-out
        `}
      >
        {/* 头部 - 始终显示 */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
          onClick={handleToggle}
        >
          <div className="flex items-center gap-3">
            {/* 图标容器 - 渐变背景 */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Info className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                模型能力说明
              </h3>
              {!isExpanded && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  点击查看详情
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* 展开/收起图标 */}
            <div className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500">
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
            {/* 关闭按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors group"
              title="不再显示"
            >
              <X className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
            </button>
          </div>
        </div>

        {/* 内容 - 可展开/收起 */}
        <div
          className={`
            overflow-hidden transition-all duration-300 ease-out
            ${isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}
          `}
        >
          <div className="px-4 pb-4 space-y-3">
            {/* Seedream 4.5 模型说明 */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 dark:from-emerald-500/20 dark:to-teal-500/10 rounded-xl p-3 border border-emerald-200/50 dark:border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">
                    Seedream 4.5
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-medium">
                    推荐
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 dark:text-gray-300 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    Doubao Seedream 4.5
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    ¥0.25/张
                  </span>
                </div>
                <ul className="space-y-1 ml-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>中文文本渲染稳定</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>细节表现更清晰</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>风格一致性更强</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>适合海报与图表类场景</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 底部提示 */}
            <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 pt-1">
              点击 × 可永久关闭此提示
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
