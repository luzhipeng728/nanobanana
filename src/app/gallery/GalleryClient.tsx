"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Images, Calendar, ExternalLink, Loader2 } from "lucide-react";
import PageViewCounter from "@/components/PageViewCounter";

// Cloudflare Image Resizing URL
function getCoverUrl(url: string): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=400,quality=75${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

interface SlideItem {
  id: string;
  title: string;
  cover: string | null;
  imageCount: number;
  createdAt: string;
  needsCover?: boolean;
}

interface GalleryClientProps {
  initialSlides: SlideItem[];
}

export default function GalleryClient({ initialSlides }: GalleryClientProps) {
  const [slides, setSlides] = useState<SlideItem[]>(initialSlides);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // 加载更多
  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/slides?page=${nextPage}&limit=20`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        setSlides((prev) => [...prev, ...data.items]);
        setPage(nextPage);
        setHasMore(nextPage < data.totalPages);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to load more slides:", error);
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/60 backdrop-blur-xl border-b border-neutral-200/50 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">返回画布</span>
              </Link>
              <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-700" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                作品画廊
              </h1>
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              共 {slides.length} 个作品
            </div>
          </div>
        </div>
      </header>

      {/* Gallery Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {slides.length === 0 ? (
          <div className="text-center py-20">
            <Images className="w-16 h-16 mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
            <h2 className="text-xl font-medium text-neutral-600 dark:text-neutral-400 mb-2">
              暂无作品
            </h2>
            <p className="text-neutral-500 dark:text-neutral-500 mb-6">
              还没有用户发布幻灯片作品
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              开始创作
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {slides.map((slide) => (
                <Link
                  key={slide.id}
                  href={`/slides/${slide.id}`}
                  className="group bg-white dark:bg-neutral-800/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-neutral-200/50 dark:border-white/5 hover:border-purple-300 dark:hover:border-purple-500/30"
                >
                  {/* Cover Image */}
                  <div className="aspect-[4/3] relative bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 overflow-hidden">
                    {slide.cover ? (
                      <img
                        src={getCoverUrl(slide.cover)}
                        alt={slide.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      // 没有封面时显示标题作为占位
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                        {slide.needsCover ? (
                          // 正在生成封面
                          <>
                            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-2" />
                            <span className="text-xs text-purple-500 dark:text-purple-400">生成封面中...</span>
                          </>
                        ) : (
                          // 显示标题作为封面
                          <div className="text-center">
                            <div className="text-lg font-bold text-purple-600 dark:text-purple-300 line-clamp-3">
                              {slide.title}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-white/90 dark:bg-black/70 backdrop-blur-sm rounded-full p-3">
                          <ExternalLink className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
                        </div>
                      </div>
                    </div>
                    {/* Image Count Badge */}
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <Images className="w-3 h-3" />
                      {slide.imageCount}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-medium text-neutral-800 dark:text-neutral-100 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {slide.title}
                    </h3>
                    <div className="flex items-center gap-1 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <Calendar className="w-3 h-3" />
                      {formatDate(slide.createdAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? "加载中..." : "加载更多"}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 右下角访问计数 */}
      <div className="fixed bottom-4 right-4 bg-white/80 dark:bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg border border-neutral-200/50 dark:border-white/10">
        <PageViewCounter page="/gallery" label="次访问" />
      </div>
    </div>
  );
}
