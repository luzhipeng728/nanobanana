"use client";

import React, { useState, useEffect } from "react";
import { X, Info, Zap, Sparkles } from "lucide-react";

/**
 * 模型能力提示框组件
 * 显示在页面右上角，可以关闭，并记住关闭状态
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
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg shadow-lg border border-purple-200 dark:border-purple-700 overflow-hidden">
        {/* 头部 - 始终显示 */}
        <div className="flex items-center justify-between p-4 cursor-pointer" onClick={handleToggle}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Info className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              模型能力说明
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-1 hover:bg-purple-100 dark:hover:bg-purple-800 rounded transition-colors"
            title="关闭提示"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 内容 - 可展开/收起 */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-4 text-sm">
            {/* Pro 模型说明 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h4 className="font-semibold text-purple-700 dark:text-purple-300">
                  Pro 模型（推荐）
                </h4>
              </div>
              <div className="space-y-1 text-gray-700 dark:text-gray-300">
                <p className="font-medium">实际模型：Imagen 3 Fast</p>
                <p className="text-xs mt-2">✨ 适用场景：</p>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-purple-600 dark:text-purple-400">图片中包含中文文字</strong>（必需使用 Pro）</li>
                  <li>需要高质量细节的图像</li>
                  <li>复杂的场景构图</li>
                  <li>专业级别的输出质量</li>
                </ul>
              </div>
            </div>

            {/* Fast 模型说明 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-blue-700 dark:text-blue-300">
                  Fast 模型
                </h4>
              </div>
              <div className="space-y-1 text-gray-700 dark:text-gray-300">
                <p className="font-medium">实际模型：Gemini 2.5 Flash Image</p>
                <p className="text-xs mt-2">⚡ 适用场景：</p>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li>快速人物风格迁移</li>
                  <li>快速原型设计</li>
                  <li>简单的图像生成</li>
                  <li>不包含中文文字的场景</li>
                </ul>
              </div>
            </div>

            {/* 重要提示 */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-700">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>⚠️ 重要：</strong>
                如果需要在图片中生成<strong className="text-yellow-900 dark:text-yellow-100">中文文字</strong>，
                必须使用 <strong className="text-yellow-900 dark:text-yellow-100">Pro 模型</strong>，
                Fast 模型对中文支持有限。
              </p>
            </div>

            {/* 点击收起提示 */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
              点击标题可收起此提示
            </p>
          </div>
        )}

        {/* 收起状态提示 */}
        {!isExpanded && (
          <div className="px-4 pb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              点击展开查看详情
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
