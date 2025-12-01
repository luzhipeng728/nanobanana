"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackCodeEditor,
  useSandpack,
} from "@codesandbox/sandpack-react";
import {
  Monitor,
  Smartphone,
  ExternalLink,
  RefreshCw,
  Code,
  Eye,
  AlertCircle,
  Copy,
  Check,
  Share2,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebsitePreviewNodeData, ImagePlaceholder } from "@/types/website-gen";
import { SANDPACK_TEMPLATE_FILES } from "@/types/website-gen";

// Preview viewport sizes
const VIEWPORT_SIZES = {
  desktop: { width: "100%", label: "桌面" },
  tablet: { width: "768px", label: "平板" },
  mobile: { width: "375px", label: "手机" },
} as const;

type ViewportSize = keyof typeof VIEWPORT_SIZES;

// Image placeholder status component
const PlaceholderStatus = ({
  placeholders,
}: {
  placeholders: Record<string, ImagePlaceholder>;
}) => {
  const entries = Object.entries(placeholders);
  if (entries.length === 0) return null;

  const pending = entries.filter(([, p]) => p.status === "pending" || p.status === "generating");
  const completed = entries.filter(([, p]) => p.status === "completed");
  const failed = entries.filter(([, p]) => p.status === "failed");

  return (
    <div className="flex items-center gap-3 text-xs">
      {pending.length > 0 && (
        <span className="flex items-center gap-1 text-blue-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          {pending.length} 张图片生成中
        </span>
      )}
      {completed.length > 0 && (
        <span className="flex items-center gap-1 text-green-500">
          <ImageIcon className="w-3 h-3" />
          {completed.length} 张已完成
        </span>
      )}
      {failed.length > 0 && (
        <span className="flex items-center gap-1 text-red-500">
          <AlertCircle className="w-3 h-3" />
          {failed.length} 张失败
        </span>
      )}
    </div>
  );
};

// Internal preview component with Sandpack hooks
const PreviewContent = ({
  viewport,
  showCode,
  onError,
}: {
  viewport: ViewportSize;
  showCode: boolean;
  onError: (error: string | null) => void;
}) => {
  const { sandpack } = useSandpack();
  const { error } = sandpack;

  useEffect(() => {
    if (error) {
      onError(error.message);
    } else {
      onError(null);
    }
  }, [error, onError]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCode ? (
        <div className="flex-1 overflow-hidden">
          <SandpackCodeEditor
            showTabs
            showLineNumbers
            style={{ height: "100%" }}
          />
        </div>
      ) : (
        <div
          className="flex-1 bg-white dark:bg-neutral-900 overflow-auto flex justify-center"
          style={{ padding: viewport !== "desktop" ? "1rem" : 0 }}
        >
          <div
            style={{
              width: VIEWPORT_SIZES[viewport].width,
              maxWidth: "100%",
              height: "100%",
            }}
          >
            <SandpackPreview
              showNavigator={false}
              showRefreshButton={false}
              style={{ height: "100%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const WebsitePreviewNode = ({
  data,
  id,
  isConnectable,
  selected,
}: NodeProps<any>) => {
  const nodeData = data as WebsitePreviewNodeData;

  // State
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, string>>(
    nodeData.files && Object.keys(nodeData.files).length > 0
      ? nodeData.files
      : SANDPACK_TEMPLATE_FILES
  );
  const [imagePlaceholders, setImagePlaceholders] = useState<Record<string, ImagePlaceholder>>(
    nodeData.imagePlaceholders || {}
  );
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Polling for project updates
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch files immediately and poll for updates
  useEffect(() => {
    if (!nodeData.projectId) return;

    let isMounted = true;

    const fetchFiles = async () => {
      try {
        const response = await fetch(`/api/website-gen/files?projectId=${nodeData.projectId}`);
        if (response.ok && isMounted) {
          const result = await response.json();
          if (result.files && Object.keys(result.files).length > 0) {
            setFiles(result.files);
          }
          if (result.imagePlaceholders) {
            setImagePlaceholders(result.imagePlaceholders);
          }
        }
      } catch (error) {
        console.error("[WebsitePreview] Failed to fetch files:", error);
      }
    };

    // Fetch immediately on mount
    fetchFiles();

    // Then poll every 2 seconds for updates
    pollRef.current = setInterval(fetchFiles, 2000);

    return () => {
      isMounted = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [nodeData.projectId]);

  // Refresh preview
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/website-gen/files?projectId=${nodeData.projectId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.files) {
          setFiles(result.files);
        }
      }
    } catch (error) {
      console.error("[WebsitePreview] Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [nodeData.projectId]);

  // Copy share link
  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/preview/${nodeData.projectId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [nodeData.projectId]);

  // Open in new tab
  const handleOpenExternal = useCallback(() => {
    window.open(`/preview/${nodeData.projectId}`, "_blank");
  }, [nodeData.projectId]);

  // Handle error from preview
  const handleError = useCallback((err: string | null) => {
    setError(err);
  }, []);

  // Prepare files for Sandpack (transform paths)
  const sandpackFiles = Object.entries(files).reduce(
    (acc, [path, content]) => {
      // Ensure path starts with /
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      acc[normalizedPath] = content;
      return acc;
    },
    {} as Record<string, string>
  );

  return (
    <div
      className={cn(
        "nowheel bg-white dark:bg-neutral-950 border-2 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full h-full overflow-hidden flex flex-col transition-all duration-300",
        selected
          ? "ring-4 ring-offset-0 ring-cyan-400/40 border-cyan-200 dark:border-cyan-800 shadow-[0_8px_20px_-6px_rgba(6,182,212,0.15)]"
          : "border-neutral-200 dark:border-neutral-800 hover:shadow-lg"
      )}
    >
      <NodeResizer
        isVisible={true}
        minWidth={400}
        minHeight={400}
        lineClassName="!border-cyan-400"
        handleClassName="!w-3 !h-3 !bg-cyan-500 !rounded-full"
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-cyan-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-cyan-100 dark:border-cyan-900/20 flex items-center justify-between flex-shrink-0 bg-cyan-50/50 dark:bg-cyan-900/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center shadow-sm text-cyan-600 dark:text-cyan-300">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 tracking-tight">
              {nodeData.title || "网站预览"}
            </h3>
            <PlaceholderStatus placeholders={imagePlaceholders} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Viewport selector */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setViewport("desktop")}
              className={cn(
                "p-1.5 rounded-md transition-all",
                viewport === "desktop"
                  ? "bg-white dark:bg-neutral-700 shadow-sm text-cyan-600"
                  : "text-neutral-500 hover:text-neutral-700"
              )}
              title="桌面视图"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewport("mobile")}
              className={cn(
                "p-1.5 rounded-md transition-all",
                viewport === "mobile"
                  ? "bg-white dark:bg-neutral-700 shadow-sm text-cyan-600"
                  : "text-neutral-500 hover:text-neutral-700"
              )}
              title="手机视图"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Code/Preview toggle */}
          <button
            onClick={() => setShowCode(!showCode)}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              showCode
                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
            )}
            title={showCode ? "显示预览" : "显示代码"}
          >
            {showCode ? <Eye className="w-4 h-4" /> : <Code className="w-4 h-4" />}
          </button>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-all disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>

          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-all"
            title="复制分享链接"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Open external */}
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-all"
            title="在新窗口打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">编译错误</p>
            <p className="text-[10px] text-red-500 dark:text-red-400/80 truncate">{error}</p>
          </div>
        </div>
      )}

      {/* Preview content */}
      <SandpackProvider
        template="react"
        files={sandpackFiles}
        customSetup={{
          dependencies: {
            "framer-motion": "^10.0.0",
          },
        }}
        options={{
          externalResources: [
            "https://cdn.tailwindcss.com",
          ],
        }}
        theme="auto"
      >
        <PreviewContent
          viewport={viewport}
          showCode={showCode}
          onError={handleError}
        />
      </SandpackProvider>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-2 h-2 !bg-cyan-500 !border-0"
      />
    </div>
  );
};

export default memo(WebsitePreviewNode);
