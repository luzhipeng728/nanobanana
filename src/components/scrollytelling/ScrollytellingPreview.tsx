"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, AlertCircle, Download, ExternalLink, RefreshCw, Code, Copy, Check, Send, Upload, Sparkles, Brain, Search, BarChart3, FileCode, Image, Layout, FileText, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

// 流事件类型
interface StreamEvent {
  type: string;
  message?: string;
  phase?: 'preparation' | 'generation';
  iteration?: number;
  chunk?: string;
  content?: string;
  tool?: string;
  input?: any;
  result?: any;
  index?: number;
  analysis?: string;
  plan?: any;
  query?: string;
  chapter?: number;
  summary?: string;
  chartType?: string;
  promptLength?: number;
  htmlLength?: number;
  error?: string;
}

// Agent 活动日志项
interface AgentLogItem {
  type: 'thought' | 'action' | 'observation' | 'image' | 'search' | 'chart' | 'prompt' | 'structure';
  content: string;
  timestamp: number;
  step?: number;
}

// 工作流程步骤
interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed';
}

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
  const [showCode, setShowCode] = useState(true);
  const [copied, setCopied] = useState(false);

  // 当前阶段
  const [currentPhase, setCurrentPhase] = useState<'preparation' | 'generation' | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string>("");

  // 工作流程步骤
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: 'analyze', name: '分析图片', description: '理解图片内容和主题', icon: <Image className="w-4 h-4" />, status: 'pending' },
    { id: 'plan', name: '规划结构', description: '设计网页章节和布局', icon: <Layout className="w-4 h-4" />, status: 'pending' },
    { id: 'search', name: '搜索资料', description: '查找相关数据和信息', icon: <Search className="w-4 h-4" />, status: 'pending' },
    { id: 'chart', name: '生成图表', description: '创建数据可视化配置', icon: <BarChart3 className="w-4 h-4" />, status: 'pending' },
    { id: 'prompt', name: '整合提示词', description: '汇总所有材料', icon: <FileText className="w-4 h-4" />, status: 'pending' },
    { id: 'generate', name: '生成 HTML', description: 'Gemini 流式输出代码', icon: <Code className="w-4 h-4" />, status: 'pending' },
  ]);

  // Agent 活动日志
  const [agentLogs, setAgentLogs] = useState<AgentLogItem[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 当前思考内容（用于合并连续的思考 chunks）
  const [currentThinking, setCurrentThinking] = useState<string>("");
  const lastEventTypeRef = useRef<string>("");

  // 自由指令输入
  const [customPrompt, setCustomPrompt] = useState(initialTheme);

  // 同步 initialTheme 到 customPrompt（当组件打开时）
  useEffect(() => {
    if (isOpen && initialTheme) {
      setCustomPrompt(initialTheme);
    }
  }, [isOpen, initialTheme]);

  // 发布状态
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // 自动修复状态
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixAttempts, setAutoFixAttempts] = useState(0);
  const MAX_AUTO_FIX_ATTEMPTS = 2;

  // 修改模式：保存之前生成的 HTML，用于增量修改
  const [previousHtml, setPreviousHtml] = useState<string>("");
  const [isModificationMode, setIsModificationMode] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const pendingContentRef = useRef<string>("");

  // 更新工作流程步骤状态
  const updateStepStatus = useCallback((stepId: string, status: WorkflowStep['status']) => {
    setWorkflowSteps(prev => prev.map(step => {
      if (step.id === stepId) {
        return { ...step, status };
      }
      // 如果当前步骤变为 active，之前的步骤都应该是 completed
      if (status === 'active') {
        const stepIndex = prev.findIndex(s => s.id === stepId);
        const currentIndex = prev.findIndex(s => s.id === step.id);
        if (currentIndex < stepIndex && step.status !== 'completed') {
          return { ...step, status: 'completed' };
        }
      }
      return step;
    }));
  }, []);

  // 自动滚动到日志底部
  useEffect(() => {
    if (logsEndRef.current && currentPhase === 'preparation') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLogs, currentPhase]);

  // 添加日志
  const addLog = useCallback((type: AgentLogItem['type'], content: string, step?: number) => {
    setAgentLogs(prev => [...prev, { type, content, timestamp: Date.now(), step }]);
  }, []);

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

  // 生成完成后渲染到 iframe
  useEffect(() => {
    if (!isComplete || !htmlContent || isGenerating) return;

    const timer = setTimeout(() => {
      if (iframeRef.current) {
        renderToIframe(htmlContent, true);
      } else {
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

    iframe.addEventListener('load', checkForErrors);

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
      const autoFix = async () => {
        setIsAutoFixing(true);
        setAutoFixAttempts(prev => prev + 1);

        const fixPrompt = `请修复以下 JavaScript 错误：\n${jsErrors.join('\n')}\n\n保持原有设计和功能不变，只修复错误。`;

        await startGeneration(fixPrompt);
        setIsAutoFixing(false);
      };

      const timer = setTimeout(autoFix, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, jsErrors, isAutoFixing, autoFixAttempts]);

  // 完成当前思考（将累积的思考内容添加到日志）
  const finalizeCurrentThinking = useCallback(() => {
    setCurrentThinking(prev => {
      if (prev.trim()) {
        // 将累积的思考内容添加到日志（截取前300字符）
        const content = prev.trim();
        const displayContent = content.length > 300 ? content.slice(0, 300) + '...' : content;
        addLog('thought', displayContent);
      }
      return "";
    });
  }, [addLog]);

  // 处理 SSE 事件
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    // 如果从 thought 切换到其他类型，先完成当前思考
    if (event.type !== 'thought' && lastEventTypeRef.current === 'thought') {
      finalizeCurrentThinking();
    }
    lastEventTypeRef.current = event.type;

    switch (event.type) {
      case 'start':
        addLog('thought', event.message || '开始处理...');
        break;

      case 'phase':
        setCurrentPhase(event.phase || null);
        setPhaseMessage(event.message || '');
        if (event.phase === 'generation') {
          updateStepStatus('prompt', 'completed');
          updateStepStatus('generate', 'active');
          addLog('prompt', '✅ 准备工作完成，开始生成 HTML...');
        }
        break;

      case 'thought':
        // 累积思考内容，不立即添加日志
        if (event.content) {
          setCurrentThinking(prev => prev + event.content);
        }
        break;

      case 'action':
        if (event.tool) {
          const toolMapping: Record<string, { step: string; name: string }> = {
            'analyze_images': { step: 'analyze', name: '🔍 分析图片' },
            'plan_structure': { step: 'plan', name: '📋 规划结构' },
            'web_search': { step: 'search', name: '🌐 搜索资料' },
            'generate_chart_data': { step: 'chart', name: '📊 生成图表数据' },
            'finalize_prompt': { step: 'prompt', name: '✨ 整合提示词' }
          };

          const mapping = toolMapping[event.tool];
          if (mapping) {
            updateStepStatus(mapping.step, 'active');
            addLog('action', mapping.name);
          }
        }
        break;

      case 'observation':
        // 工具执行完成，显示耗时
        if (event.result?.duration) {
          addLog('observation', `⏱️ 耗时 ${event.result.duration}`);
        }
        break;

      case 'image_analysis':
        addLog('image', `📸 图片 ${(event.index || 0) + 1} 分析完成`);
        if (event.index === images.length - 1) {
          updateStepStatus('analyze', 'completed');
        }
        break;

      case 'structure_planned':
        updateStepStatus('plan', 'completed');
        if (event.plan) {
          addLog('structure', `✅ 结构规划完成：${event.plan.chapters?.length || 0} 个章节，${event.plan.theme || '自动'} 风格`);
        }
        break;

      case 'search_start':
        addLog('search', `🔎 搜索: ${event.query}`);
        break;

      case 'search_result':
        addLog('search', `✅ 搜索完成${event.chapter !== undefined && event.chapter >= 0 ? ` (章节 ${event.chapter + 1})` : ''}`);
        break;

      case 'data_generated':
        addLog('chart', `📊 图表数据生成 (${event.chartType || '未知类型'})`);
        break;

      case 'prompt_ready':
        updateStepStatus('chart', 'completed');
        addLog('prompt', `✅ 提示词准备完成 (${event.promptLength || 0} 字符)`);
        break;

      case 'html_chunk':
        if (event.chunk) {
          setHtmlContent(prev => prev + event.chunk);
        }
        break;

      case 'complete':
        updateStepStatus('generate', 'completed');
        setIsComplete(true);
        setShowCode(false);
        // 保存生成的 HTML，供后续修改模式使用
        setHtmlContent(prev => {
          if (prev) {
            setPreviousHtml(prev);
          }
          return prev;
        });
        break;

      case 'error':
        setError(event.error || '未知错误');
        break;
    }
  }, [addLog, updateStepStatus, images.length, finalizeCurrentThinking]);

  // 重置工作流程
  const resetWorkflow = useCallback(() => {
    setWorkflowSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));
  }, []);

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
    setShowCode(true);
    setCurrentPhase(null);
    setPhaseMessage("");
    setAgentLogs([]);
    setCurrentThinking("");
    lastEventTypeRef.current = "";
    resetWorkflow();

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
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 如果这是最后一行且不完整，保存到 buffer
          if (i === lines.length - 1 && !line.endsWith('\n')) {
            buffer = line;
            continue;
          }

          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
              handleStreamEvent(event);
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 最终渲染
      if (htmlContent) {
        renderToIframe(htmlContent, true);
      }

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }, [images, prompts, customPrompt, handleStreamEvent, renderToIframe, resetWorkflow]);

  // 打开时自动开始生成
  useEffect(() => {
    if (isOpen && images.length > 0) {
      setAutoFixAttempts(0);
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

  // 手动重新生成（完整流程）
  const handleRegenerate = () => {
    setAutoFixAttempts(0);
    setPreviousHtml(""); // 清除之前的 HTML，强制完整生成
    setIsModificationMode(false);
    startGeneration();
  };

  // 修改模式：跳过 Claude Agent，直接让 Gemini 修改
  const startModification = useCallback(async (modificationRequest: string) => {
    if (!previousHtml || !modificationRequest.trim()) return;

    // 重置状态（但保留 previousHtml）
    setHtmlContent("");
    setError(null);
    setJsErrors([]);
    setIsComplete(false);
    setIsGenerating(true);
    setPublishedUrl(null);
    setShowCode(true);
    setCurrentPhase('generation'); // 直接进入生成阶段
    setPhaseMessage('Gemini 正在根据您的要求修改...');
    setAgentLogs([{ type: 'prompt', content: `📝 修改请求: ${modificationRequest}`, timestamp: Date.now() }]);
    setIsModificationMode(true);

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/scrollytelling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          prompts,
          modification: modificationRequest,
          previousHtml,
        }),
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
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (i === lines.length - 1 && !line.endsWith('\n')) {
            buffer = line;
            continue;
          }

          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
              handleStreamEvent(event);
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 最终渲染
      if (htmlContent) {
        renderToIframe(htmlContent, true);
      }

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setIsGenerating(false);
    }
  }, [images, prompts, previousHtml, handleStreamEvent, renderToIframe]);

  // 智能发送：如果已有生成结果，使用修改模式；否则完整生成
  const handleSmartSend = () => {
    if (isGenerating) return;

    if (previousHtml && customPrompt.trim()) {
      // 修改模式
      startModification(customPrompt);
    } else {
      // 完整生成
      handleRegenerate();
    }
  };

  // 获取日志图标和颜色
  const getLogStyle = (type: AgentLogItem['type']) => {
    switch (type) {
      case 'thought': return { icon: <Brain className="w-4 h-4" />, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' };
      case 'action': return { icon: <Sparkles className="w-4 h-4" />, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' };
      case 'observation': return { icon: <FileCode className="w-4 h-4" />, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' };
      case 'image': return { icon: <Image className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
      case 'search': return { icon: <Search className="w-4 h-4" />, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' };
      case 'chart': return { icon: <BarChart3 className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
      case 'prompt': return { icon: <FileText className="w-4 h-4" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
      case 'structure': return { icon: <Layout className="w-4 h-4" />, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' };
      default: return { icon: <Brain className="w-4 h-4" />, color: 'text-neutral-400', bg: 'bg-neutral-500/10 border-neutral-500/20' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* 顶部工具栏 */}
      <header className="flex-shrink-0 h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">{title || "一镜到底网页预览"}</h2>
          {isGenerating && (
            <div className={cn(
              "flex items-center gap-2 text-sm",
              isModificationMode ? "text-purple-400" : "text-cyan-400"
            )}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {isModificationMode ? 'Gemini 快速修改中...' :
                 currentPhase === 'preparation' ? 'Claude 分析中...' :
                 currentPhase === 'generation' ? 'Gemini 生成中...' :
                 isAutoFixing ? '自动修复中...' : '处理中...'}
              </span>
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
        {/* 修改模式等待状态 */}
        {isGenerating && isModificationMode && !htmlContent ? (
          <div className="flex-1 bg-neutral-950 flex flex-col items-center justify-center">
            <div className="flex items-center gap-3 text-purple-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xl">Gemini 正在修改网页...</span>
            </div>
            <p className="text-neutral-500 mt-3">快速修改模式 - 跳过分析流程</p>
            <div className="mt-6 p-4 bg-neutral-900 rounded-lg border border-neutral-800 max-w-md">
              <p className="text-sm text-neutral-400">
                <span className="text-purple-400 font-medium">修改请求：</span>
                {customPrompt || '...'}
              </p>
            </div>
          </div>
        ) : isGenerating && currentPhase === 'preparation' ? (
          /* 阶段1: Claude Agent 准备阶段 */
          <div className="flex-1 bg-neutral-950 flex">
            {/* 左侧：工作流程步骤指示器 */}
            <div className="w-64 border-r border-neutral-800 p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-purple-400" />
                <span className="text-white font-medium">工作流程</span>
              </div>

              <div className="space-y-1">
                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative">
                    {/* 连接线 */}
                    {index < workflowSteps.length - 1 && (
                      <div className={cn(
                        "absolute left-[11px] top-8 w-0.5 h-6",
                        step.status === 'completed' ? "bg-green-500" : "bg-neutral-700"
                      )} />
                    )}

                    <div className={cn(
                      "flex items-start gap-3 p-2 rounded-lg transition-all",
                      step.status === 'active' && "bg-cyan-500/10",
                      step.status === 'completed' && "opacity-70"
                    )}>
                      {/* 状态图标 */}
                      <div className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                        step.status === 'pending' && "bg-neutral-800 text-neutral-500",
                        step.status === 'active' && "bg-cyan-500 text-white animate-pulse",
                        step.status === 'completed' && "bg-green-500 text-white"
                      )}>
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : step.status === 'active' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Circle className="w-3 h-3" />
                        )}
                      </div>

                      {/* 步骤信息 */}
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-sm font-medium",
                          step.status === 'active' ? "text-cyan-400" :
                          step.status === 'completed' ? "text-green-400" : "text-neutral-400"
                        )}>
                          {step.name}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 进度提示 */}
              <div className="mt-auto pt-4 border-t border-neutral-800">
                <div className="text-xs text-neutral-500">
                  {workflowSteps.filter(s => s.status === 'completed').length} / {workflowSteps.length} 步骤完成
                </div>
                <div className="mt-2 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-green-500 transition-all duration-500"
                    style={{
                      width: `${(workflowSteps.filter(s => s.status === 'completed').length / workflowSteps.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 右侧：实时日志 */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-sm">实时日志</span>
                  <span className="text-neutral-600 text-xs">({agentLogs.length} 条)</span>
                </div>
                <div className="flex items-center gap-2 text-cyan-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>处理中...</span>
                </div>
              </div>

              {/* 日志列表 */}
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {agentLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-3" />
                    <span>正在启动 Claude Agent...</span>
                  </div>
                ) : (
                  agentLogs.map((log, index) => {
                    const style = getLogStyle(log.type);
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border animate-in fade-in slide-in-from-bottom-2 duration-300",
                          style.bg
                        )}
                      >
                        <div className={style.color}>
                          {style.icon}
                        </div>
                        <span className="text-sm text-neutral-300 flex-1">{log.content}</span>
                        <span className="text-xs text-neutral-600">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })
                )}

                {/* 当前正在输入的思考内容（实时显示） */}
                {currentThinking && (
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-purple-500/10 border-purple-500/20 animate-pulse">
                    <div className="text-purple-400">
                      <Brain className="w-4 h-4" />
                    </div>
                    <span className="text-sm text-neutral-300 flex-1">
                      {currentThinking.length > 300 ? currentThinking.slice(-300) + '...' : currentThinking}
                      <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse" />
                    </span>
                  </div>
                )}

                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        ) : isGenerating && currentPhase === 'generation' && !htmlContent ? (
          // 阶段2开始但还没有内容 - 显示等待状态
          <div className="flex-1 bg-neutral-950 flex flex-col items-center justify-center">
            <div className="flex items-center gap-3 text-cyan-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xl">Gemini 正在生成 HTML...</span>
            </div>
            <p className="text-neutral-500 mt-3">即将开始流式输出代码</p>
          </div>
        ) : isGenerating || (currentPhase === 'generation' && !isComplete) ? (
          // 阶段2: Gemini 生成阶段 - 显示代码
          <div className="flex-1 bg-neutral-950 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <Code className="w-4 h-4 text-cyan-400" />
                <span className="text-neutral-400 text-sm">HTML 源代码</span>
                <div className="flex items-center gap-2 text-cyan-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Gemini 流式生成中...</span>
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
              <code>{htmlContent || "// Gemini 正在生成 HTML 代码..."}</code>
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
              <Sparkles className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                previousHtml ? "text-purple-500" : "text-cyan-500"
              )} />
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={previousHtml
                  ? "输入修改指令，如：让标题更大、更换配色方案、添加更多动画效果..."
                  : "输入额外指令，如：科技感风格、添加更多视差效果、让第三张图放大显示..."
                }
                className={cn(
                  "w-full pl-10 pr-4 py-3 bg-neutral-800 border rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2",
                  previousHtml
                    ? "border-purple-700/50 focus:ring-purple-500/50 focus:border-purple-500"
                    : "border-neutral-700 focus:ring-cyan-500/50 focus:border-cyan-500"
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) {
                    handleSmartSend();
                  }
                }}
              />
            </div>
            <button
              onClick={handleSmartSend}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors disabled:cursor-not-allowed",
                previousHtml && customPrompt.trim()
                  ? "bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 text-white"
                  : "bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-500/50 text-white"
              )}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {previousHtml && customPrompt.trim() ? "修改" : "生成"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2 max-w-4xl mx-auto">
            {previousHtml ? (
              <>
                <span className="text-purple-400">✨ 快速修改模式：</span>
                直接输入修改要求，Gemini 将基于当前网页进行调整（跳过分析流程）
              </>
            ) : (
              "提示：Claude 会先分析图片、搜索资料、规划结构，然后 Gemini 生成最终 HTML"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
