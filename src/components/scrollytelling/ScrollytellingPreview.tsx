"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, AlertCircle, Download, ExternalLink, RefreshCw, Code, Copy, Check, Send, Upload, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollytellingPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  prompts?: string[]; // 图片描述数组
  title: string;
  initialTheme?: string;
}

export default function ScrollytellingPreview({
  isOpen,
  onClose,
  images,
  prompts = [],
  title,
  initialTheme = "",
}: ScrollytellingPreviewProps) {
  const [htmlContent, setHtmlContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsErrors, setJsErrors] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [showCode, setShowCode] = useState(true); // 默认显示代码（生成中）
  const [copied, setCopied] = useState(false);

  // 自由指令输入
  const [customPrompt, setCustomPrompt] = useState(initialTheme);

  // 发布状态
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // 自动修复状态
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixAttempts, setAutoFixAttempts] = useState(0);
  const MAX_AUTO_FIX_ATTEMPTS = 2;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const pendingContentRef = useRef<string>("");

  // 渲染 HTML 到 iframe
  const renderToIframe = useCallback((html: string, forceComplete = false) => {
    if (!iframeRef.current) return;

    let renderableHtml = html;
    if (!forceComplete && !html.includes("</html>")) {
      renderableHtml = html + "\n</script></style></head></body></html>";
    }

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(renderableHtml);
      doc.close();
    }
  }, []);

  // 节流渲染（每 500ms 渲染一次）
  const throttledRender = useCallback((html: string) => {
    pendingContentRef.current = html;
    const now = Date.now();
    if (now - lastRenderTimeRef.current > 500) {
      lastRenderTimeRef.current = now;
      renderToIframe(html);
    }
  }, [renderToIframe]);

  // 生成完成后渲染到 iframe（确保 iframe 已挂载）
  useEffect(() => {
    if (!isComplete || !htmlContent || isGenerating) return;

    // 延迟渲染，确保 iframe 已挂载到 DOM
    const timer = setTimeout(() => {
      if (iframeRef.current) {
        renderToIframe(htmlContent, true);
      } else {
        // 如果 iframe 还没准备好，再等一下
        setTimeout(() => {
          if (iframeRef.current) {
            renderToIframe(htmlContent, true);
          }
        }, 200);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isComplete, isGenerating]);

  // 监听 iframe 内的 JS 错误
  useEffect(() => {
    if (!iframeRef.current || !isComplete) return;

    const iframe = iframeRef.current;

    const checkForErrors = () => {
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          // 注入错误监听器
          const script = iframeWindow.document.createElement('script');
          script.textContent = `
            window.onerror = function(msg, url, line) {
              window.parent.postMessage({ type: 'iframe-error', message: msg, line: line }, '*');
              return false;
            };
          `;
          iframeWindow.document.head?.appendChild(script);
        }
      } catch (e) {
        // 跨域错误，忽略
      }
    };

    // iframe 加载完成后检查错误
    iframe.addEventListener('load', checkForErrors);

    // 监听来自 iframe 的错误消息
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-error') {
        setJsErrors(prev => [...prev, `${event.data.message} (line ${event.data.line})`]);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      iframe.removeEventListener('load', checkForErrors);
      window.removeEventListener('message', handleMessage);
    };
  }, [isComplete]);

  // 自动修复错误
  useEffect(() => {
    if (isComplete && jsErrors.length > 0 && !isAutoFixing && autoFixAttempts < MAX_AUTO_FIX_ATTEMPTS) {
      // 有错误，尝试自动修复
      const autoFix = async () => {
        setIsAutoFixing(true);
        setAutoFixAttempts(prev => prev + 1);

        // 构建修复指令
        const fixPrompt = `请修复以下 JavaScript 错误：\n${jsErrors.join('\n')}\n\n保持原有设计和功能不变，只修复错误。`;

        // 重新生成
        await startGeneration(fixPrompt);
        setIsAutoFixing(false);
      };

      // 延迟 1 秒执行，让用户看到错误信息
      const timer = setTimeout(autoFix, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, jsErrors, isAutoFixing, autoFixAttempts]);

  // 开始生成
  const startGeneration = useCallback(async (additionalPrompt?: string) => {
    if (images.length === 0) return;

    // 重置状态
    setHtmlContent("");
    setError(null);
    setJsErrors([]);
    setIsComplete(false);
    setIsGenerating(true);
    setPublishedUrl(null);
    setShowCode(true); // 生成中显示代码

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 组合主题和额外指令
    const theme = [customPrompt, additionalPrompt].filter(Boolean).join('\n\n');

    try {
      const response = await fetch("/api/scrollytelling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, prompts, theme: theme || undefined }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API 错误: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setHtmlContent(fullContent);
        throttledRender(fullContent);
      }

      // 最终渲染
      setHtmlContent(fullContent);
      renderToIframe(fullContent, true);
      setIsComplete(true);
      setShowCode(false); // 生成完成后切换到预览

      // 检查是否有错误注释
      if (fullContent.includes("<!-- Error:")) {
        const errorMatch = fullContent.match(/<!-- Error: (.+?) -->/);
        if (errorMatch) {
          setError(errorMatch[1]);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }, [images, customPrompt, throttledRender, renderToIframe]);

  // 打开时自动开始生成
  useEffect(() => {
    if (isOpen && images.length > 0) {
      setAutoFixAttempts(0); // 重置自动修复计数
      startGeneration();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen]);

  // 发布到 R2
  const handlePublish = async () => {
    if (!htmlContent || !isComplete || error) return;

    setIsPublishing(true);
    try {
      const response = await fetch("/api/scrollytelling/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlContent,
          title,
          images,
          theme: customPrompt || undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setPublishedUrl(result.url);
      } else {
        setError(result.error || "发布失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally {
      setIsPublishing(false);
    }
  };

  // 下载 HTML
  const downloadHtml = () => {
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || 'scrollytelling'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制代码
  const copyCode = async () => {
    await navigator.clipboard.writeText(htmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 在新窗口打开
  const openInNewWindow = () => {
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  // 手动重新生成
  const handleRegenerate = () => {
    setAutoFixAttempts(0);
    startGeneration();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* 顶部工具栏 */}
      <header className="flex-shrink-0 h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">{title || "一镜到底网页预览"}</h2>
          {isGenerating && (
            <div className="flex items-center gap-2 text-cyan-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isAutoFixing ? "自动修复中..." : "生成中..."}</span>
            </div>
          )}
          {isComplete && !error && jsErrors.length === 0 && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <Check className="w-4 h-4" />
              <span>生成完成</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 查看代码（生成完成后才显示） */}
          {isComplete && (
            <button
              onClick={() => setShowCode(!showCode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                showCode
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              )}
            >
              <Code className="w-4 h-4" />
              代码
            </button>
          )}

          {/* 重新生成 */}
          <button
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", isGenerating && "animate-spin")} />
            重新生成
          </button>

          {/* 下载 */}
          <button
            onClick={downloadHtml}
            disabled={!isComplete || !!error}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            下载
          </button>

          {/* 新窗口打开 */}
          <button
            onClick={openInNewWindow}
            disabled={!isComplete || !!error}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            预览
          </button>

          {/* 发布按钮 */}
          {!publishedUrl ? (
            <button
              onClick={handlePublish}
              disabled={!isComplete || !!error || isPublishing || jsErrors.length > 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-sm font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  发布中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  发布
                </>
              )}
            </button>
          ) : (
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
            >
              <Check className="w-4 h-4" />
              已发布
            </a>
          )}

          {/* 关闭 */}
          <button
            onClick={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
              onClose();
            }}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 生成中：全屏显示代码 */}
        {isGenerating && !isComplete ? (
          <div className="flex-1 bg-neutral-950 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <span className="text-neutral-400 text-sm">HTML 源代码</span>
                <div className="flex items-center gap-2 text-cyan-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>流式生成中...</span>
                </div>
              </div>
              <button
                onClick={copyCode}
                disabled={!htmlContent}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-sm text-neutral-300 font-mono whitespace-pre-wrap">
              <code>{htmlContent || "// AI 正在分析图片并生成网页代码...\n// 这可能需要 30-60 秒"}</code>
            </pre>
          </div>
        ) : (
          <>
            {/* 生成完成：预览区（可切换代码） */}
            <div className={cn("flex-1 bg-white relative", showCode && "w-1/2")}>
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Scrollytelling Preview"
              />

              {/* 发布成功提示 */}
              {publishedUrl && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
                  <Check className="w-5 h-5" />
                  <span>发布成功！</span>
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    查看页面
                  </a>
                </div>
              )}
            </div>

            {/* 代码区（分屏显示） */}
            {showCode && (
              <div className="w-1/2 bg-neutral-950 border-l border-neutral-800 flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
                  <span className="text-neutral-400 text-sm">HTML 源代码</span>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        复制
                      </>
                    )}
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-4 text-sm text-neutral-300 font-mono whitespace-pre-wrap">
                  <code>{htmlContent || "// 等待生成..."}</code>
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部：指令输入 + 错误显示 */}
      <div className="flex-shrink-0 border-t border-neutral-800">
        {/* 错误/警告区 */}
        {(error || jsErrors.length > 0) && (
          <div className="bg-red-950/50 border-b border-red-900/50 p-3">
            <div className="max-w-4xl mx-auto">
              {error && (
                <div className="flex items-start gap-2 text-red-400 mb-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">生成错误</p>
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                </div>
              )}

              {jsErrors.length > 0 && (
                <div className="flex items-start gap-2 text-yellow-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">
                      JavaScript 错误 ({jsErrors.length})
                      {autoFixAttempts < MAX_AUTO_FIX_ATTEMPTS && (
                        <span className="text-yellow-300 ml-2">- 正在自动修复...</span>
                      )}
                    </p>
                    <ul className="text-sm text-yellow-300 mt-1 space-y-0.5">
                      {jsErrors.slice(0, 5).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {jsErrors.length > 5 && (
                        <li className="text-yellow-500">... 还有 {jsErrors.length - 5} 个错误</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 指令输入区 */}
        <div className="bg-neutral-900 p-4">
          <div className="max-w-4xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500" />
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="输入额外指令，如：科技感风格、添加更多视差效果、让第三张图放大显示..."
                className="w-full pl-10 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) {
                    handleRegenerate();
                  }
                }}
              />
            </div>
            <button
              onClick={handleRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-500/50 text-white rounded-xl font-medium transition-colors disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              生成
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2 max-w-4xl mx-auto">
            提示：输入任何指令来调整网页效果，按 Enter 或点击生成按钮重新生成
          </p>
        </div>
      </div>
    </div>
  );
}
