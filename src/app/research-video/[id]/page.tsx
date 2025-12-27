"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowLeft, Download, Share2, Clock, Calendar } from "lucide-react";

interface ResearchVideoProject {
  id: string;
  title: string | null;
  topic: string;
  videoUrl: string | null;
  coverUrl: string | null;
  duration: number | null;
  createdAt: string;
  status: string;
}

export default function ResearchVideoPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<ResearchVideoProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/research-video/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("视频不存在或已删除");
          } else {
            setError("加载视频失败");
          }
          return;
        }

        const data = await response.json();
        setProject(data.project);
      } catch (err) {
        setError("加载视频失败");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [id]);

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleDownload = () => {
    if (project?.videoUrl) {
      const link = document.createElement("a");
      link.href = project.videoUrl;
      link.download = `${project.title || project.topic}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: project?.title || project?.topic || "研究视频",
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy link
      navigator.clipboard.writeText(window.location.href);
      alert("链接已复制到剪贴板");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-neutral-200 mb-2">{error}</p>
          <Link href="/gallery" className="text-sm text-emerald-500 hover:underline">
            返回画廊
          </Link>
        </div>
      </div>
    );
  }

  if (!project || !project.videoUrl) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-neutral-200 mb-2">视频尚未生成完成</p>
          <Link href="/gallery" className="text-sm text-emerald-500 hover:underline">
            返回画廊
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/gallery"
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回画廊</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-medium transition-colors"
            >
              <Share2 className="w-4 h-4" />
              分享
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-full text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              下载
            </button>
          </div>
        </div>
      </header>

      {/* Video Player */}
      <div className="flex flex-col items-center justify-center min-h-screen pt-20 pb-32 px-4">
        <div className="w-full max-w-5xl">
          <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl">
            <video
              src={project.videoUrl}
              poster={project.coverUrl || undefined}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          </div>

          {/* Video Info */}
          <div className="mt-8 space-y-4">
            <h1 className="text-2xl md:text-3xl font-bold">
              {project.title || project.topic}
            </h1>
            <div className="flex items-center gap-6 text-neutral-400 text-sm">
              {project.duration && (
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {formatDuration(project.duration)}
                </span>
              )}
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(project.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-neutral-400 mb-4">想要创建自己的研究视频?</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-full text-sm font-bold transition-colors"
          >
            开始创作
          </Link>
        </div>
      </div>
    </div>
  );
}
