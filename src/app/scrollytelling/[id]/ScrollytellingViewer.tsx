"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Eye, Heart, Share2, ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from 'uuid';

interface ScrollytellingViewerProps {
  scrollytellingId: string;
  title: string;
  htmlUrl: string;
  cover: string | null;
  createdAt: string;
  views: number;
  likes: number;
}

export default function ScrollytellingViewer({
  scrollytellingId,
  title,
  htmlUrl,
  cover,
  createdAt,
  views: initialViews,
  likes: initialLikes,
}: ScrollytellingViewerProps) {
  const router = useRouter();

  // 统计状态
  const [views, setViews] = useState(initialViews);
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  // 获取用户标识
  const getUserIdentifier = () => {
    let id = localStorage.getItem('scrollytelling_user_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('scrollytelling_user_id', id);
    }
    return id;
  };

  // 初始化统计数据
  useEffect(() => {
    const userId = getUserIdentifier();

    // 记录浏览量
    fetch(`/api/scrollytelling/${scrollytellingId}/view`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) setViews(data.views);
      })
      .catch(console.error);

    // 检查点赞状态
    fetch(`/api/scrollytelling/${scrollytellingId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIdentifier: userId, action: 'check' })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsLiked(data.liked);
          setLikes(data.likes);
        }
      })
      .catch(console.error);
  }, [scrollytellingId]);

  // 处理点赞
  const handleLike = async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    const userId = getUserIdentifier();
    const action = isLiked ? 'unlike' : 'like';

    try {
      // 乐观更新
      setIsLiked(!isLiked);
      setLikes(prev => isLiked ? prev - 1 : prev + 1);

      const res = await fetch(`/api/scrollytelling/${scrollytellingId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIdentifier: userId, action })
      });

      const data = await res.json();
      if (data.success) {
        setIsLiked(data.liked);
        setLikes(data.likes);
      }
    } catch (error) {
      console.error("Like failed:", error);
      // 回滚
      setIsLiked(isLiked);
      setLikes(likes);
    } finally {
      setLikeLoading(false);
    }
  };

  // 分享
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (e) {
        // 用户取消分享
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert("链接已复制到剪贴板");
    }
  };

  // 格式化日期
  const formattedDate = new Date(createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* 顶部信息栏 */}
      <header className="flex-shrink-0 bg-black/80 backdrop-blur-sm border-b border-white/10 px-4 py-3 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 返回画廊按钮 */}
            <button
              onClick={() => router.push('/gallery')}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors group"
              title="返回画廊"
            >
              <ArrowLeft className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">
                {title}
              </h1>
              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formattedDate}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>{views} 次浏览</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 点赞按钮 */}
            <button
              onClick={handleLike}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all border",
                isLiked
                  ? "bg-pink-500/20 text-pink-400 border-pink-500/50"
                  : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20 hover:text-white"
              )}
            >
              <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
              <span className="text-sm font-medium">{likes}</span>
            </button>

            {/* 分享按钮 */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/70 border border-white/10 hover:bg-white/20 hover:text-white transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm font-medium">分享</span>
            </button>

            {/* 新窗口打开 */}
            <a
              href={htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="text-sm font-medium">全屏</span>
            </a>
          </div>
        </div>
      </header>

      {/* 主内容区 - iframe */}
      <main className="flex-1 relative">
        <iframe
          src={htmlUrl}
          className="w-full h-full border-0"
          title={title}
          sandbox="allow-scripts allow-same-origin"
        />
      </main>
    </div>
  );
}
