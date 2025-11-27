"use client";

import React, { useState, useEffect } from "react";
import { X, Info, Zap, Sparkles, ChevronDown, ChevronUp, DollarSign } from "lucide-react";

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
            {/* Pro 模型说明 */}
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 dark:from-purple-500/20 dark:to-purple-500/10 rounded-xl p-3 border border-purple-200/50 dark:border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h4 className="font-semibold text-purple-700 dark:text-purple-300 text-sm">
                    Pro 模型
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-medium">
                    推荐
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 dark:text-gray-300 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    Gemini 3 Pro Image
                  </p>
                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                    <DollarSign className="w-3 h-3" />
                    ~$0.03/张
                  </span>
                </div>
                <ul className="space-y-1 ml-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong className="text-purple-600 dark:text-purple-400">中文文字生成</strong>（必需使用）</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>高质量细节图像</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>复杂场景构图</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>支持 4K 分辨率</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Fast 模型说明 */}
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 dark:from-blue-500/20 dark:to-blue-500/10 rounded-xl p-3 border border-blue-200/50 dark:border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-semibold text-blue-700 dark:text-blue-300 text-sm">
                    Fast 模型
                  </h4>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 dark:text-gray-300 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    Gemini 2.5 Flash Image
                  </p>
                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                    <DollarSign className="w-3 h-3" />
                    ~$0.039/张
                  </span>
                </div>
                <ul className="space-y-1 ml-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>快速人物风格迁移</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>图片融合与编辑</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>角色一致性保持</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>低延迟、高性价比</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 重要提示 */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 dark:from-amber-500/20 dark:to-orange-500/10 rounded-xl p-3 border border-amber-200/50 dark:border-amber-500/20">
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                <strong className="text-amber-600 dark:text-amber-300">⚠️ 提示：</strong>
                生成<strong className="text-amber-700 dark:text-amber-200">中文文字</strong>需使用
                <strong className="text-purple-600 dark:text-purple-300"> Pro 模型</strong>，
                Fast 模型对中文支持有限
              </p>
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
