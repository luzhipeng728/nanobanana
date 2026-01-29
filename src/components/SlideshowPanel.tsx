import React, { useState } from "react";
import {
  Film, Loader2, Check, Video, Share2, Play, Download, X, Mic2, Globe, Sparkles
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
  // 新增：一镜到底网页生成
  enableScrollytelling: boolean;
  setEnableScrollytelling: (enable: boolean) => void;
  scrollytellingTheme: string;
  setScrollytellingTheme: (theme: string) => void;
  onGenerateScrollytelling: () => void;
  scrollytellingGenerating: boolean;
  // 新增：循环微动视频
  enableLoopVideo: boolean;
  setEnableLoopVideo: (enable: boolean) => void;
  loopVideoModel: 'lite' | 'pro';
  setLoopVideoModel: (model: 'lite' | 'pro') => void;
}

const NARRATION_SPEAKERS = [
  // 儿童绘本
  { key: 'zh_female_xueayi', name: '学艾伊', gender: '女', lang: '中文', category: '儿童绘本' },
  // 通用场景
  { key: 'zh_female_vivi', name: 'Vivi', gender: '女', lang: '中/英', category: '通用场景' },
  { key: 'zh_male_ruyayichen', name: '儒雅逸辰', gender: '男', lang: '中文', category: '通用场景' },
  { key: 'zh_female_xiaohe', name: '小何', gender: '女', lang: '中文', category: '通用场景' },
  { key: 'zh_male_yunzhou', name: '云舟', gender: '男', lang: '中文', category: '通用场景' },
  { key: 'zh_male_xiaotian', name: '小天', gender: '男', lang: '中文', category: '通用场景' },
  // 视频配音
  { key: 'zh_male_dayi', name: '大壹', gender: '男', lang: '中文', category: '视频配音' },
  { key: 'zh_female_mizai', name: '咪仔', gender: '女', lang: '中文', category: '视频配音' },
  { key: 'zh_female_jitangnv', name: '鸡汤女', gender: '女', lang: '中文', category: '视频配音' },
  { key: 'zh_female_meilinvyou', name: '魅力女友', gender: '女', lang: '中文', category: '视频配音' },
  { key: 'zh_female_liuchang', name: '流畅女声', gender: '女', lang: '中文', category: '视频配音' },
  // 方言口音
  { key: 'zh_female_sichuan', name: '呆萌川妹', gender: '女', lang: '四川话', category: '方言口音' },
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
  // 新增
  enableScrollytelling,
  setEnableScrollytelling,
  scrollytellingTheme,
  setScrollytellingTheme,
  onGenerateScrollytelling,
  scrollytellingGenerating,
  // 循环微动视频
  enableLoopVideo,
  setEnableLoopVideo,
  loopVideoModel,
  setLoopVideoModel,
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

          {/* 生成模式选择 */}
          <div className="flex gap-2">
            {/* 生成讲解视频选项 */}
            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              enableNarration && !enableScrollytelling
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-purple-300 dark:hover:border-purple-700'
            }`}>
              <input
                type="radio"
                name="generateMode"
                checked={enableNarration && !enableScrollytelling}
                onChange={() => {
                  setEnableNarration(true);
                  setEnableScrollytelling(false);
                }}
                className="sr-only"
              />
              <Video className={`w-5 h-5 ${enableNarration && !enableScrollytelling ? 'text-purple-500' : 'text-neutral-400'}`} />
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${enableNarration && !enableScrollytelling ? 'text-purple-700 dark:text-purple-300' : 'text-neutral-600 dark:text-neutral-400'}`}>
                  讲解视频
                </span>
                <span className="text-[10px] text-neutral-400">AI 配音</span>
              </div>
            </label>

            {/* 生成一镜到底网页选项 */}
            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              enableScrollytelling
                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-cyan-300 dark:hover:border-cyan-700'
            }`}>
              <input
                type="radio"
                name="generateMode"
                checked={enableScrollytelling}
                onChange={() => {
                  setEnableScrollytelling(true);
                  setEnableNarration(false);
                }}
                className="sr-only"
              />
              <Globe className={`w-5 h-5 ${enableScrollytelling ? 'text-cyan-500' : 'text-neutral-400'}`} />
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${enableScrollytelling ? 'text-cyan-700 dark:text-cyan-300' : 'text-neutral-600 dark:text-neutral-400'}`}>
                  一镜到底
                </span>
                <span className="text-[10px] text-neutral-400">沉浸网页</span>
              </div>
            </label>

            {/* 仅发布选项 */}
            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              !enableNarration && !enableScrollytelling
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-green-300 dark:hover:border-green-700'
            }`}>
              <input
                type="radio"
                name="generateMode"
                checked={!enableNarration && !enableScrollytelling}
                onChange={() => {
                  setEnableNarration(false);
                  setEnableScrollytelling(false);
                }}
                className="sr-only"
              />
              <Share2 className={`w-5 h-5 ${!enableNarration && !enableScrollytelling ? 'text-green-500' : 'text-neutral-400'}`} />
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${!enableNarration && !enableScrollytelling ? 'text-green-700 dark:text-green-300' : 'text-neutral-600 dark:text-neutral-400'}`}>
                  仅发布
                </span>
                <span className="text-[10px] text-neutral-400">幻灯片</span>
              </div>
            </label>
          </div>

          {/* 讲解视频配置区 */}
          {enableNarration && !enableScrollytelling && (
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

              {/* 循环微动视频选项 */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={enableLoopVideo}
                    onChange={(e) => setEnableLoopVideo(e.target.checked)}
                    className="w-4 h-4 rounded border-purple-300 text-purple-500 focus:ring-purple-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      生成循环微动视频
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      图片元素微动，文字保持静止，可无限循环
                    </span>
                  </div>
                </label>

                {/* 模型选择 - 仅在启用循环视频时显示 */}
                {enableLoopVideo && (
                  <div className="flex gap-2 pl-7">
                    <button
                      onClick={() => setLoopVideoModel('lite')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                        loopVideoModel === 'lite'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700'
                          : 'bg-white dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <div className="font-medium">快速 Lite</div>
                      <div className="text-[10px] opacity-70">~30秒/张</div>
                    </button>
                    <button
                      onClick={() => setLoopVideoModel('pro')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                        loopVideoModel === 'pro'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700'
                          : 'bg-white dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <div className="font-medium">高清 Pro</div>
                      <div className="text-[10px] opacity-70">~60秒/张</div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 一镜到底网页配置区 */}
          {enableScrollytelling && (
            <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl space-y-3 border border-cyan-200 dark:border-cyan-800 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400">
                <Sparkles className="w-4 h-4" />
                <span>AI 将分析图片内容，自动生成沉浸式滚动网页</span>
              </div>

              {/* 主题/风格输入 */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  主题风格 <span className="text-neutral-400">(选填，AI会自动判断)</span>
                </label>
                <input
                  type="text"
                  value={scrollytellingTheme}
                  onChange={(e) => setScrollytellingTheme(e.target.value)}
                  placeholder="如：科技感、优雅艺术、活泼消费品..."
                  className="w-full px-3 py-2 rounded-lg border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-cyan-500 outline-none placeholder:text-neutral-400"
                />
              </div>

              <div className="text-[10px] text-neutral-400 space-y-1">
                <p>• 使用 GSAP + Lenis 实现平滑滚动动画</p>
                <p>• 每张图片将成为一个独立的"分镜"场景</p>
                <p>• 支持视差、淡入淡出、缩放等效果</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {enableScrollytelling ? (
              // 一镜到底网页生成按钮
              <button
                onClick={onGenerateScrollytelling}
                disabled={scrollytellingGenerating || (slideshowSelections.size === 0 && !slideshowTitle.trim())}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 hover:shadow-cyan-500/30"
              >
                {scrollytellingGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    生成一镜到底网页
                  </>
                )}
              </button>
            ) : (
              // 原有的发布按钮
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
            )}
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
