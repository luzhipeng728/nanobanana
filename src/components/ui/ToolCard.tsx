"use client";

import { memo, useState } from "react";
import {
  Search,
  BookOpen,
  Image,
  Pencil,
  FileText,
  Code,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 工具图标映射
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Search,
  deep_research: BookOpen,
  generate_image: Image,
  edit_image: Pencil,
  analyze_document: FileText,
  code_interpreter: Code,
};

// 工具名称映射（中文）
const TOOL_NAMES: Record<string, string> = {
  web_search: "网络搜索",
  deep_research: "深度研究",
  generate_image: "生成图片",
  edit_image: "编辑图片",
  analyze_document: "文档分析",
  code_interpreter: "代码执行",
};

// 工具颜色映射
const TOOL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  web_search: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  deep_research: {
    bg: "bg-purple-50 dark:bg-purple-900/20",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
  },
  generate_image: {
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  edit_image: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
  },
  analyze_document: {
    bg: "bg-cyan-50 dark:bg-cyan-900/20",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-200 dark:border-cyan-800",
  },
  code_interpreter: {
    bg: "bg-pink-50 dark:bg-pink-900/20",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-pink-200 dark:border-pink-800",
  },
};

export type ToolStatus = "running" | "completed" | "error";

// 工具输出类型
interface ToolOutput {
  success?: boolean;
  error?: string;
  imageUrl?: string;
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
  researchReport?: string;
  analysis?: string;
  codeOutput?: string;
  [key: string]: unknown;
}

export interface ToolCardProps {
  toolId: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  output?: ToolOutput;
  duration?: number;
  elapsed?: number;
  statusText?: string;
  streamingContent?: string;
  onImageClick?: (imageUrl: string, prompt?: string) => void;
}

const ToolCard = memo(function ToolCard({
  toolId,
  name,
  input,
  status,
  output,
  duration,
  elapsed,
  statusText,
  streamingContent,
  onImageClick,
}: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = TOOL_ICONS[name] || Code;
  const displayName = TOOL_NAMES[name] || name;
  const colors = TOOL_COLORS[name] || TOOL_COLORS.code_interpreter;

  // 格式化时间
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // 获取输入摘要
  const getInputSummary = () => {
    if (name === "web_search" && input.query) {
      return `搜索: "${input.query}"`;
    }
    if (name === "deep_research" && input.topic) {
      return `研究: "${input.topic}"`;
    }
    if (name === "generate_image" && input.prompt) {
      const prompt = input.prompt as string;
      const resolution = input.resolution as string || "2k";
      const ratio = input.aspectRatio as string || "auto";
      return `生成 ${resolution}/${ratio}: "${prompt.slice(0, 30)}${prompt.length > 30 ? "..." : ""}"`;
    }
    if (name === "edit_image" && input.editPrompt) {
      return `编辑: "${input.editPrompt}"`;
    }
    if (name === "analyze_document") {
      return `分析: ${input.analysisType || "摘要"}`;
    }
    if (name === "code_interpreter") {
      return `执行: ${input.operation || "自定义代码"}`;
    }
    return JSON.stringify(input).slice(0, 50) + "...";
  };

  // 获取输出摘要
  const getOutputSummary = () => {
    if (!output) return null;

    if (output.error) {
      return `错误: ${output.error}`;
    }

    if (name === "web_search" && output.searchResults) {
      const results = output.searchResults as unknown[];
      return `找到 ${results.length} 条结果`;
    }
    if (name === "deep_research" && output.researchReport) {
      const report = output.researchReport as string;
      return `报告长度: ${report.length} 字符`;
    }
    if (name === "generate_image" && output.imageUrl) {
      return "图片已生成";
    }
    if (name === "edit_image" && output.imageUrl) {
      return "图片已编辑";
    }
    if (name === "analyze_document" && output.analysis) {
      return "分析完成";
    }
    if (name === "code_interpreter" && output.codeOutput) {
      return "代码执行完成";
    }

    return "完成";
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 overflow-hidden transition-all",
        colors.border,
        colors.bg
      )}
    >
      {/* 卡片头部 */}
      <div
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn("p-1.5 rounded-lg", colors.bg)}>
            <Icon className={cn("w-4 h-4", colors.text)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-bold", colors.text)}>
                {displayName}
              </span>
              {status === "running" && (
                <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
              )}
              {status === "completed" && (
                <CheckCircle className="w-3 h-3 text-green-500" />
              )}
              {status === "error" && (
                <XCircle className="w-3 h-3 text-red-500" />
              )}
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              {getInputSummary()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 时间显示 */}
          {(duration || elapsed) && (
            <div className="flex items-center gap-1 text-[10px] text-neutral-400">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(duration || elapsed || 0)}</span>
            </div>
          )}

          {/* 展开/收起按钮 */}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          )}
        </div>
      </div>

      {/* 进度状态 */}
      {status === "running" && statusText && (
        <div className="px-3 py-1 border-t border-neutral-200/50 dark:border-neutral-700/50">
          <p className="text-[10px] text-neutral-500 animate-pulse">
            {statusText}
          </p>
        </div>
      )}

      {/* 流式内容 */}
      {status === "running" && streamingContent && (
        <div className="px-3 py-2 border-t border-neutral-200/50 dark:border-neutral-700/50 max-h-32 overflow-y-auto">
          <pre className="text-[10px] text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-mono">
            {streamingContent.slice(-500)}
          </pre>
        </div>
      )}

      {/* 展开的详情 */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-neutral-200/50 dark:border-neutral-700/50 space-y-2">
          {/* 输入参数 */}
          <div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase">
              输入参数
            </span>
            <pre className="mt-1 text-[10px] text-neutral-600 dark:text-neutral-400 bg-white/50 dark:bg-black/20 rounded p-2 overflow-x-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* 输出结果 */}
          {output && (
            <div>
              <span className="text-[10px] font-bold text-neutral-500 uppercase">
                输出结果
              </span>
              <div className="mt-1">
                {/* 图片预览 */}
                {output.imageUrl && (
                  <div className="mb-2 relative group">
                    <img
                      src={output.imageUrl as string}
                      alt="Generated"
                      className="w-full max-h-40 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageClick?.(output.imageUrl as string, input.prompt as string | undefined);
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageClick?.(output.imageUrl as string, input.prompt as string | undefined);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                      title="放大查看"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {/* 搜索结果 */}
                {output.searchResults && (
                  <div className="space-y-1">
                    {(output.searchResults as Array<{ title: string; url: string; snippet: string }>)
                      .slice(0, 3)
                      .map((result, i) => (
                        <a
                          key={i}
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2 bg-white/50 dark:bg-black/20 rounded hover:bg-white dark:hover:bg-black/30 transition-colors"
                        >
                          <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 truncate">
                            {result.title}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {result.snippet}
                          </p>
                        </a>
                      ))}
                  </div>
                )}
                {/* 其他结果 */}
                {!output.imageUrl && !output.searchResults && (
                  <pre className="text-[10px] text-neutral-600 dark:text-neutral-400 bg-white/50 dark:bg-black/20 rounded p-2 overflow-x-auto max-h-40">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {status === "error" && output?.error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <p className="text-[10px] text-red-600 dark:text-red-400">
                {output.error as string}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 结果摘要（未展开时） */}
      {!isExpanded && status === "completed" && (
        <div className="px-3 py-1 border-t border-neutral-200/50 dark:border-neutral-700/50">
          <p className="text-[10px] text-green-600 dark:text-green-400">
            ✓ {getOutputSummary()}
          </p>
        </div>
      )}
    </div>
  );
});

export default ToolCard;
