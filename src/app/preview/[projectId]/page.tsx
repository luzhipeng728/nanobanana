"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  SandpackProvider,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { SANDPACK_TEMPLATE_FILES } from "@/types/website-gen";

export default function PreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [metadata, setMetadata] = useState<{ title?: string; description?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/website-gen/files?projectId=${projectId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("项目不存在或已删除");
          } else {
            setError("加载项目失败");
          }
          return;
        }

        const data = await response.json();
        setFiles(data.files || SANDPACK_TEMPLATE_FILES);
        setMetadata(data.metadata || {});
      } catch (err) {
        setError("加载项目失败");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            {error}
          </p>
          <a
            href="/"
            className="text-sm text-blue-500 hover:underline"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  if (!files) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
            {metadata?.title || "网站预览"}
          </h1>
          {metadata?.description && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {metadata.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            创建你的网站
          </a>
        </div>
      </header>

      {/* Preview */}
      <div className="flex-1">
        <SandpackProvider
          template="react"
          files={files}
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
          <SandpackPreview
            showNavigator={false}
            showRefreshButton={false}
            style={{ height: "calc(100vh - 64px)" }}
          />
        </SandpackProvider>
      </div>
    </div>
  );
}
