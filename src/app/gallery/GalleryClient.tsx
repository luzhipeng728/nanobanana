"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Clock, Search, Sparkles, Image as ImageIcon, Loader2 } from "lucide-react";
import PageViewCounter from "@/components/PageViewCounter";
import { cn } from "@/lib/utils";

// Cloudflare Image Resizing URL
function getCoverUrl(url: string): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      // 稍微加大图片尺寸以保证视网膜屏清晰度
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=800,quality=90${path}`;
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
  videoUrl?: string | null;
}

interface GalleryClientProps {
  initialSlides: SlideItem[];
}

export default function GalleryClient({ initialSlides }: GalleryClientProps) {
  const [slides, setSlides] = useState<SlideItem[]>(initialSlides);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  // 加载更多
  const loadMore = useCallback(async () => {
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
  }, [loading, hasMore, page]);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" } // 提前 100px 触发
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loadMore, hasMore, loading]);

  // 格式化日期 - 更人性化的中文格式
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#050505] font-sans text-neutral-900 dark:text-neutral-100">
      {/* Header - 极简磨砂风格 */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-neutral-200/60 dark:border-white/5 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="group flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10"
              >
                <ArrowLeft className="w-4.5 h-4.5 transition-transform group-hover:-translate-x-1" />
                <span className="text-[14px] font-medium">返回画布</span>
              </Link>
            </div>
            
            <div className="hidden md:flex items-center gap-6">
               <nav className="flex gap-6 text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
                 <span className="text-neutral-900 dark:text-white cursor-pointer">精选推荐</span>
                 <span className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer">最新发布</span>
                 <span className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer">热门榜单</span>
               </nav>
               <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-700"></div>
               <div className="flex items-center gap-2 text-neutral-400 bg-neutral-100/50 dark:bg-neutral-800/50 px-3 py-1.5 rounded-full border border-transparent focus-within:border-blue-500/30 focus-within:bg-white dark:focus-within:bg-black transition-all w-48">
                 <Search className="w-4 h-4" />
                 <input 
                    type="text" 
                    placeholder="搜索灵感..." 
                    className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-neutral-400 text-neutral-900 dark:text-white"
                    disabled
                 />
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - 更具设计感的中文排版 */}
      <div className="relative pt-20 pb-16 px-6 text-center bg-white dark:bg-black border-b border-neutral-100 dark:border-neutral-900 overflow-hidden">
         {/* 装饰性光晕 */}
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-purple-100/50 to-transparent dark:from-purple-900/20 blur-3xl pointer-events-none" />
         
         <div className="relative z-10 max-w-4xl mx-auto">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border border-purple-100 dark:border-purple-800 mb-6 animate-fade-in">
             <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
             <span className="text-xs font-bold text-purple-700 dark:text-purple-300 tracking-wide uppercase">NanoBanana 创意社区</span>
           </div>
           
           <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6 leading-tight">
             发现无限创意灵感
           </h2>
           <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed font-light">
             探索由社区创作者生成的精彩幻灯片作品。<br className="hidden sm:block"/>
             从商业演示到创意故事，每一个像素都源于 AI 的想象力。
           </p>
         </div>
      </div>

      {/* Gallery Grid */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner">
              <ImageIcon className="w-10 h-10 text-neutral-300 dark:text-neutral-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
              暂无作品
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-10 max-w-sm mx-auto">
              做第一个发布作品的人，点亮创意画廊。
            </p>
            <Link
              href="/"
              className="px-8 py-3.5 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-full font-semibold text-sm transition-all hover:scale-105 hover:shadow-xl"
            >
              开始创作
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
              {slides.map((slide) => (
                <Link
                  key={slide.id}
                  href={`/slides/${slide.id}`}
                  className="group flex flex-col gap-0 bg-white dark:bg-[#111] rounded-[24px] overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_40px_-12px_rgba(255,255,255,0.05)] border border-neutral-200/60 dark:border-neutral-800"
                >
                  {/* Card Image Container */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                    {slide.cover ? (
                      <img
                        src={getCoverUrl(slide.cover)}
                        alt={slide.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      // Placeholder
                      <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-8 text-center">
                         <div className="max-w-[80%] space-y-3">
                            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                              <Sparkles className="w-6 h-6 text-purple-500" />
                            </div>
                            <h3 className="text-lg font-bold text-neutral-400 dark:text-neutral-600 leading-tight line-clamp-2">
                              {slide.title}
                            </h3>
                         </div>
                      </div>
                    )}

                    {/* Video Tag */}
                    {slide.videoUrl && (
                      <div className="absolute top-4 right-4">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-sm">
                          <PlayCircle className="w-3 h-3 fill-current" />
                          视频
                        </span>
                      </div>
                    )}
                    
                    {/* Hover Overlay for Play Button */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover:opacity-100 bg-black/10">
                       <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/90 dark:bg-black/80 backdrop-blur-xl text-neutral-900 dark:text-white shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300">
                          <PlayCircle className="w-8 h-8 fill-current opacity-90" />
                       </div>
                    </div>
                  </div>

                  {/* Card Info Content - 纯白背景，留白充足 */}
                  <div className="flex flex-col justify-between flex-1 p-5 pb-6">
                    <div className="space-y-2.5">
                      <h3 className="text-[17px] font-bold text-neutral-900 dark:text-white leading-snug line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {slide.title}
                      </h3>
                      <p className="text-[13px] text-neutral-500 dark:text-neutral-400 line-clamp-2 h-[2.5em] leading-relaxed hidden">
                        {/* 预留给描述文本 */}
                        这是一个精彩的幻灯片作品...
                      </p>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                      <div className="flex items-center gap-2">
                         <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[9px] text-white font-bold">
                           NB
                         </div>
                         <span>NanoBanana</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          {slide.imageCount}页
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(slide.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Infinite Scroll Loader */}
            {hasMore && (
              <div 
                ref={observerTarget} 
                className="flex items-center justify-center mt-20 mb-12 h-20"
              >
                {loading && (
                  <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">加载更多精彩...</span>
                  </div>
                )}
              </div>
            )}
            
            {!hasMore && slides.length > 0 && (
              <div className="text-center mt-20 mb-12 text-neutral-400 dark:text-neutral-600 text-sm">
                已经到底啦 ~
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer Visitor Counter */}
      <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
        <div className="px-4 py-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-lg rounded-full border border-neutral-200/80 dark:border-white/10 shadow-xl shadow-black/5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <PageViewCounter page="/gallery" label="次访问" />
        </div>
      </div>
    </div>
  );
}
