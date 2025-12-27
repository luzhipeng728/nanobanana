"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Clock, Search, Sparkles, Image as ImageIcon, Loader2, Eye, Heart, Globe, Film, FileSpreadsheet, Download, ExternalLink } from "lucide-react";
import PageViewCounter from "@/components/PageViewCounter";
import { cn } from "@/lib/utils";

// Cloudflare Image Resizing URL
function getCoverUrl(url: string): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=800,quality=90${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

interface GalleryItem {
  id: string;
  title: string;
  cover: string | null;
  type: 'slideshow' | 'scrollytelling' | 'ppt' | 'research-video';
  imageCount?: number;
  createdAt: string;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  pptUrl?: string | null;
  previewUrl?: string | null;
  duration?: number | null;
  views: number;
  likes: number;
}

interface GalleryClientProps {
  initialSlides: GalleryItem[];
}

type SortType = 'featured' | 'latest' | 'popular';
type FilterType = 'all' | 'slideshow' | 'scrollytelling' | 'ppt' | 'research-video';

export default function GalleryClient({ initialSlides }: GalleryClientProps) {
  const [slides, setSlides] = useState<GalleryItem[]>(initialSlides);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [currentSort, setCurrentSort] = useState<SortType>('latest');
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [counts, setCounts] = useState({ slideshow: 0, scrollytelling: 0, ppt: 0, 'research-video': 0 });
  const observerTarget = useRef<HTMLDivElement>(null);

  // 加载数据
  const loadData = async (sort: SortType, filter: FilterType, pageNum: number, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/slides?page=${pageNum}&limit=20&sort=${sort}&type=${filter}`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        if (append) {
          setSlides((prev) => [...prev, ...data.items]);
        } else {
          setSlides(data.items);
        }
        setHasMore(pageNum < data.totalPages);
        if (data.counts) {
          setCounts(data.counts);
        }
      } else {
        if (!append) setSlides([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  // 切换排序
  const handleSortChange = async (sort: SortType) => {
    if (sort === currentSort || loading) return;
    setCurrentSort(sort);
    setPage(1);
    setSlides([]);
    setHasMore(true);
    await loadData(sort, currentFilter, 1);
  };

  // 切换筛选
  const handleFilterChange = async (filter: FilterType) => {
    if (filter === currentFilter || loading) return;
    setCurrentFilter(filter);
    setPage(1);
    setSlides([]);
    setHasMore(true);
    await loadData(currentSort, filter, 1);
  };

  // 加载更多
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadData(currentSort, currentFilter, nextPage, true);
  }, [loading, hasMore, page, currentSort, currentFilter]);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
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

  // 格式化日期
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

  // 格式化数字
  const formatNumber = (num?: number) => {
    if (!num) return 0;
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'w';
    }
    return num;
  };

  // 获取项目链接
  const getItemLink = (item: GalleryItem) => {
    if (item.type === 'scrollytelling') {
      return `/scrollytelling/${item.id}`;
    }
    if (item.type === 'ppt') {
      return `/ppt/${item.id}`;
    }
    if (item.type === 'research-video') {
      return `/research-video/${item.id}`;
    }
    return `/slides/${item.id}`;
  };

  // 格式化时长
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#050505] font-sans text-neutral-900 dark:text-neutral-100">
      {/* Header */}
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
              {/* 排序切换 */}
              <nav className="flex gap-1 bg-neutral-100/50 dark:bg-neutral-800/50 p-1 rounded-full border border-neutral-200/50 dark:border-white/5">
                <button
                  onClick={() => handleSortChange('featured')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200",
                    currentSort === 'featured'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  精选推荐
                </button>
                <button
                  onClick={() => handleSortChange('latest')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200",
                    currentSort === 'latest'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  最新发布
                </button>
                <button
                  onClick={() => handleSortChange('popular')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200",
                    currentSort === 'popular'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  热门榜单
                </button>
              </nav>

              <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-700"></div>

              {/* 类型筛选 */}
              <nav className="flex gap-1 bg-neutral-100/50 dark:bg-neutral-800/50 p-1 rounded-full border border-neutral-200/50 dark:border-white/5">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5",
                    currentFilter === 'all'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  全部
                  <span className="text-[10px] opacity-60">({counts.slideshow + counts.scrollytelling + counts.ppt + counts['research-video']})</span>
                </button>
                <button
                  onClick={() => handleFilterChange('slideshow')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5",
                    currentFilter === 'slideshow'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  <Film className="w-3.5 h-3.5" />
                  幻灯片
                  <span className="text-[10px] opacity-60">({counts.slideshow})</span>
                </button>
                <button
                  onClick={() => handleFilterChange('scrollytelling')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5",
                    currentFilter === 'scrollytelling'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  一镜到底
                  <span className="text-[10px] opacity-60">({counts.scrollytelling})</span>
                </button>
                <button
                  onClick={() => handleFilterChange('ppt')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5",
                    currentFilter === 'ppt'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  PPT
                  <span className="text-[10px] opacity-60">({counts.ppt})</span>
                </button>
                <button
                  onClick={() => handleFilterChange('research-video')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5",
                    currentFilter === 'research-video'
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  )}
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  研究视频
                  <span className="text-[10px] opacity-60">({counts['research-video']})</span>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative pt-20 pb-16 px-6 text-center bg-white dark:bg-black border-b border-neutral-100 dark:border-neutral-900 overflow-hidden">
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
            探索由社区创作者生成的精彩作品。<br className="hidden sm:block" />
            从精美幻灯片到沉浸式一镜到底网页，每一个像素都源于 AI 的想象力。
          </p>
        </div>
      </div>

      {/* Gallery Grid */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {slides.length === 0 && !loading ? (
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
                  key={`${slide.type}-${slide.id}`}
                  href={getItemLink(slide)}
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
                      <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-8 text-center">
                        <div className="max-w-[80%] space-y-3">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center mx-auto",
                            slide.type === 'scrollytelling'
                              ? "bg-cyan-100 dark:bg-cyan-900/30"
                              : slide.type === 'ppt'
                              ? "bg-orange-100 dark:bg-orange-900/30"
                              : slide.type === 'research-video'
                              ? "bg-emerald-100 dark:bg-emerald-900/30"
                              : "bg-purple-100 dark:bg-purple-900/30"
                          )}>
                            {slide.type === 'scrollytelling' ? (
                              <Globe className="w-6 h-6 text-cyan-500" />
                            ) : slide.type === 'ppt' ? (
                              <FileSpreadsheet className="w-6 h-6 text-orange-500" />
                            ) : slide.type === 'research-video' ? (
                              <PlayCircle className="w-6 h-6 text-emerald-500" />
                            ) : (
                              <Sparkles className="w-6 h-6 text-purple-500" />
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-neutral-400 dark:text-neutral-600 leading-tight line-clamp-2">
                            {slide.title}
                          </h3>
                        </div>
                      </div>
                    )}

                    {/* Type Tag */}
                    <div className="absolute top-4 left-4">
                      <span className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md rounded-full border shadow-sm",
                        slide.type === 'scrollytelling'
                          ? "bg-cyan-500/70 border-cyan-400/30"
                          : slide.type === 'ppt'
                          ? "bg-orange-500/70 border-orange-400/30"
                          : slide.type === 'research-video'
                          ? "bg-emerald-500/70 border-emerald-400/30"
                          : "bg-purple-500/70 border-purple-400/30"
                      )}>
                        {slide.type === 'scrollytelling' ? (
                          <>
                            <Globe className="w-3 h-3" />
                            网页
                          </>
                        ) : slide.type === 'ppt' ? (
                          <>
                            <FileSpreadsheet className="w-3 h-3" />
                            PPT
                          </>
                        ) : slide.type === 'research-video' ? (
                          <>
                            <PlayCircle className="w-3 h-3" />
                            研究视频
                          </>
                        ) : (
                          <>
                            <Film className="w-3 h-3" />
                            幻灯片
                          </>
                        )}
                      </span>
                    </div>

                    {/* Video Tag (for slideshow with video) */}
                    {slide.type === 'slideshow' && slide.videoUrl && (
                      <div className="absolute top-4 right-4">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-sm">
                          <PlayCircle className="w-3 h-3 fill-current" />
                          视频
                        </span>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover:opacity-100 bg-black/10">
                      <div className={cn(
                        "flex items-center justify-center w-16 h-16 rounded-full backdrop-blur-xl shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300",
                        slide.type === 'scrollytelling'
                          ? "bg-cyan-500/90 text-white"
                          : slide.type === 'ppt'
                          ? "bg-orange-500/90 text-white"
                          : slide.type === 'research-video'
                          ? "bg-emerald-500/90 text-white"
                          : "bg-white/90 dark:bg-black/80 text-neutral-900 dark:text-white"
                      )}>
                        {slide.type === 'scrollytelling' ? (
                          <Globe className="w-8 h-8" />
                        ) : slide.type === 'ppt' ? (
                          <FileSpreadsheet className="w-8 h-8" />
                        ) : slide.type === 'research-video' ? (
                          <PlayCircle className="w-8 h-8" />
                        ) : (
                          <PlayCircle className="w-8 h-8 fill-current opacity-90" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Info Content */}
                  <div className="flex flex-col justify-between flex-1 p-5 pb-6">
                    <div className="space-y-2.5">
                      <h3 className={cn(
                        "text-[17px] font-bold text-neutral-900 dark:text-white leading-snug line-clamp-2 transition-colors",
                        slide.type === 'scrollytelling'
                          ? "group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
                          : slide.type === 'ppt'
                          ? "group-hover:text-orange-600 dark:group-hover:text-orange-400"
                          : slide.type === 'research-video'
                          ? "group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                          : "group-hover:text-purple-600 dark:group-hover:text-purple-400"
                      )}>
                        {slide.title}
                      </h3>
                    </div>

                    <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1" title="浏览量">
                          <Eye className="w-3.5 h-3.5" />
                          {formatNumber(slide.views)}
                        </span>
                        <span className="flex items-center gap-1" title="点赞数">
                          <Heart className="w-3.5 h-3.5" />
                          {formatNumber(slide.likes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {slide.type === 'research-video' && slide.duration ? (
                          <span className="flex items-center gap-1" title="视频时长">
                            <PlayCircle className="w-3.5 h-3.5" />
                            {formatDuration(slide.duration)}
                          </span>
                        ) : slide.imageCount ? (
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {slide.imageCount}页
                          </span>
                        ) : null}
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

      {/* Footer */}
      <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
        <div className="px-4 py-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-lg rounded-full border border-neutral-200/80 dark:border-white/10 shadow-xl shadow-black/5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <PageViewCounter page="/gallery" label="次访问" />
        </div>
      </div>
    </div>
  );
}
