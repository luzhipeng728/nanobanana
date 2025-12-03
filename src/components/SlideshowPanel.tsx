import React, { useState } from "react";
import { 
  Film, Loader2, Check, Video, Share2, Play, Download, X, Mic2 
} from "lucide-react";

interface SlideshowPanelProps {
  videoGenerating: boolean;
  videoProgress: {
    percent: number;
    steps: { index: number; step: string; status: string; text?: string }[];
    error?: string;
  } | null;
  publishedUrl: string | null;
  generatedVideoUrl: string | null;
  slideshowSelections: Map<string, number>;
  slideshowTitle: string;
  setSlideshowTitle: (title: string) => void;
  enableNarration: boolean;
  setEnableNarration: (enable: boolean) => void;
  narrationSpeaker: string;
  setNarrationSpeaker: (speaker: string) => void;
  narrationSpeed: number;
  setNarrationSpeed: (speed: number) => void;
  narrationTransition: string;
  setNarrationTransition: (transition: string) => void;
  narrationStyle: string;
  setNarrationStyle: (style: string) => void;
  isPublishing: boolean;
  onPublish: () => void;
  onExit: () => void;
  onClearSelections: () => void;
}

const NARRATION_SPEAKERS = [
  { key: 'zh_female_vivi', name: 'Vivi', gender: '女', lang: '中/英' },
  { key: 'zh_male_ruyayichen', name: '儒雅逸辰', gender: '男', lang: '中文' },
  { key: 'zh_female_xiaohe', name: '小何', gender: '女', lang: '中文' },
  { key: 'zh_male_yunzhou', name: '云舟', gender: '男', lang: '中文' },
  { key: 'zh_male_dayi', name: '大壹', gender: '男', lang: '中文' },
  { key: 'zh_female_cancan', name: '知性灿灿', gender: '女', lang: '中文' },
];

const TRANSITIONS = [
  { key: 'fade', name: '优雅淡入淡出', desc: '平滑过渡' },
  { key: 'slideleft', name: '向左滑动', desc: '动感切换' },
  { key: 'slideright', name: '向右滑动', desc: '动感切换' },
  { key: 'dissolve', name: '溶解效果', desc: '柔和过渡' },
  { key: 'none', name: '直接切换', desc: '无转场' },
];

export const SlideshowPanel = React.memo(({
  videoGenerating,
  videoProgress,
  publishedUrl,
  generatedVideoUrl,
  slideshowSelections,
  slideshowTitle,
  setSlideshowTitle,
  enableNarration,
  setEnableNarration,
  narrationSpeaker,
  setNarrationSpeaker,
  narrationSpeed,
  setNarrationSpeed,
  narrationTransition,
  setNarrationTransition,
  narrationStyle,
  setNarrationStyle,
  isPublishing,
  onPublish,
  onExit,
  onClearSelections,
}: SlideshowPanelProps) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 p-4 min-w-[420px] max-w-[480px] animate-slide-up">
      {/* 视频生成进度状态 */}
      {videoGenerating && videoProgress ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-600 animate-pulse" />
            <span className="font-semibold text-neutral-800 dark:text-neutral-100">生成讲解视频中...</span>
          </div>

          {/* 进度条 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-neutral-500">
              <span>进度</span>
              <span>{videoProgress.percent}%</span>
            </div>
            <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                style={{ width: `${videoProgress.percent}%` }}
              />
            </div>
          </div>

          {/* 步骤列表 */}
          <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
            {videoProgress.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                {step.status === 'done' ? (
                  <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                ) : step.status === 'generating' ? (
                  <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-neutral-300 dark:border-neutral-600 flex-shrink-0" />
                )}
                <span className={step.status === 'done' ? 'text-neutral-500' : step.status === 'generating' ? 'text-purple-600 font-medium' : 'text-neutral-400'}>
                  {step.step === 'narration' ? `第 ${step.index + 1} 张：生成文案` :
                   step.step === 'tts' ? `第 ${step.index + 1} 张：语音合成` :
                   step.step === 'video' ? '合成视频' : step.step}
                  {step.status === 'generating' && '...'}
                </span>
              </div>
            ))}
          </div>

          {videoProgress.error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600">
              {videoProgress.error}
            </div>
          )}
        </div>
      ) : publishedUrl || generatedVideoUrl ? (
        // 发布成功状态
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-green-600">
            {generatedVideoUrl ? <Video className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
            <span className="font-semibold">{generatedVideoUrl ? '视频生成完成！' : '发布成功！'}</span>
          </div>

          {generatedVideoUrl && (
            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-md">
              <video src={generatedVideoUrl} controls className="w-full h-full" />
            </div>
          )}

          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              value={`${window.location.origin}${publishedUrl}`}
              readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-sm font-mono"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}${publishedUrl}`);
                alert("链接已复制！");
              }}
              className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors shadow-sm"
            >
              复制链接
            </button>
          </div>
          <div className="flex gap-2 w-full justify-center">
            <button
              onClick={() => publishedUrl && window.open(publishedUrl, "_blank")}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm"
            >
              <Play className="w-4 h-4" />
              打开预览
            </button>
            {generatedVideoUrl && (
              <a
                href={generatedVideoUrl}
                download
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                下载视频
              </a>
            )}
            <button
              onClick={onExit}
              className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      ) : (
        // 选择和编辑状态
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">发布幻灯片</span>
            </div>
            <button
              onClick={onExit}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              title="取消"
            >
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="text-sm text-neutral-500">
            点击图片节点选择并排序，已选择 <span className="font-bold text-green-600">{slideshowSelections.size}</span> 张图片
          </div>

          <input
            type="text"
            value={slideshowTitle}
            onChange={(e) => setSlideshowTitle(e.target.value)}
            placeholder="输入幻灯片标题..."
            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent text-sm focus:ring-2 focus:ring-green-500 outline-none transition-shadow"
          />

          {/* 生成讲解视频勾选框 */}
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              enableNarration
                ? 'bg-purple-500 border-purple-500'
                : 'border-neutral-300 dark:border-neutral-600 group-hover:border-purple-400'
            }`}>
              {enableNarration && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <div className="flex items-center gap-1.5">
              <Video className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">生成讲解视频</span>
            </div>
            <input
              type="checkbox"
              checked={enableNarration}
              onChange={(e) => setEnableNarration(e.target.checked)}
              className="sr-only"
            />
          </label>

          {/* 讲解视频配置区 */}
          {enableNarration && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl space-y-3 border border-purple-200 dark:border-purple-800 animate-fade-in">
              {/* 发音人选择 */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  <Mic2 className="w-3.5 h-3.5" />
                  发音人
                </label>
                <select
                  value={narrationSpeaker}
                  onChange={(e) => setNarrationSpeaker(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  {NARRATION_SPEAKERS.map(s => (
                    <option key={s.key} value={s.key}>
                      {s.name} ({s.gender} · {s.lang})
                    </option>
                  ))}
                </select>
              </div>

              {/* 语速选择 */}
              <div className="space-y-1">
                <label className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  <span>语速</span>
                  <span className="text-purple-500">{narrationSpeed.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={narrationSpeed}
                  onChange={(e) => setNarrationSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-purple-200 dark:bg-purple-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>慢 0.5x</span>
                  <span>正常 1.0x</span>
                  <span>快 2.0x</span>
                </div>
              </div>

              {/* 转场效果选择 */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  <Film className="w-3.5 h-3.5" />
                  转场效果
                </label>
                <select
                  value={narrationTransition}
                  onChange={(e) => setNarrationTransition(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  {TRANSITIONS.map(t => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 讲解风格 */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  讲解风格 <span className="text-neutral-400">(选填)</span>
                </label>
                <input
                  type="text"
                  value={narrationStyle}
                  onChange={(e) => setNarrationStyle(e.target.value)}
                  placeholder="如：轻松活泼 / 专业解说 / 故事感..."
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-neutral-400"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onPublish}
              disabled={isPublishing || slideshowSelections.size === 0 || !slideshowTitle.trim()}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${
                enableNarration
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:shadow-purple-500/30'
                  : 'bg-green-500 hover:bg-green-600 hover:shadow-green-500/30'
              }`}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  发布中...
                </>
              ) : enableNarration ? (
                <>
                  <Video className="w-4 h-4" />
                  发布并生成视频
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  发布
                </>
              )}
            </button>
            <button
              onClick={onClearSelections}
              className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              清空选择
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

SlideshowPanel.displayName = "SlideshowPanel";
